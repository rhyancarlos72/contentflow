// Edge Function: ai-chat
// Assistente de conteúdo em conversa. Valida sessão, plano e limites, monta o
// contexto do projeto (memória + histórico), envia a resposta aos pedaços
// (NDJSON: {"type":"delta"|"done"|"error"}) e salva as mensagens.
import { streamChat, type ChatMessage, type StreamResult } from "../_shared/ai.ts";
import { buildContext, loadProject } from "../_shared/context.ts";
import { corsHeaders, HttpError, serve } from "../_shared/http.ts";
import { admin, authenticate, getPlan } from "../_shared/supabase.ts";

const PER_MINUTE_LIMIT = 10;
const HISTORY_LIMIT = 30;

const CHAT_SYSTEM = `Você é o assistente de conteúdo do ContentFlow AI: um estrategista, roteirista e copywriter que conversa com criadores brasileiros.

Como agir:
- Responda em português do Brasil, de forma natural e direta, como um colega experiente. Nada de clichês de marketing.
- Use o contexto do projeto (nicho, público, tom de voz, memória e conteúdos já feitos) em todas as respostas. Evite sugerir temas já abordados.
- Quando pedirem um conteúdo (roteiro, legenda, gancho, CTA, carrossel, plano), entregue pronto para usar, bem formatado.
- Quando a pergunta for estratégica, dê uma recomendação clara e o porquê, depois os próximos passos.
- Se faltar informação essencial, faça no máximo uma pergunta curta — ou assuma algo razoável e diga o que assumiu.
- Nunca invente métricas, estatísticas do usuário, tendências "do momento" ou resultados garantidos. Você não tem acesso à internet.
- Formatação: parágrafos curtos, listas com "-", títulos com "##" quando ajudar, **negrito** para destacar. Sem tabelas.`;

serve(async (req) => {
  const deadline = Date.now() + 140_000; // limite da Edge Function: ~150 s
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
  const { user, db } = await authenticate(req);
  const body = await req.json().catch(() => null) as {
    projectId?: string; conversationId?: string; message?: string; style?: string;
  } | null;

  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 8000) : "";
  if (!message) throw new HttpError(400, "invalid_input", "Escreva uma mensagem.");
  if (!body?.projectId) throw new HttpError(400, "invalid_input", "Selecione um projeto.");
  const style = typeof body.style === "string" ? body.style.trim().slice(0, 400) : "";

  // Plano e limites (validados no servidor)
  const plan = await getPlan(user.id);
  if (!plan.features.includes("ai_chat")) {
    throw new HttpError(402, "plan_feature", "O assistente não está disponível no seu plano.");
  }
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [monthly, recent] = await Promise.all([
    admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("success", true).gte("created_at", monthStart.toISOString()),
    admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
  ]);
  if (monthly.error) throw monthly.error;
  if (recent.error) throw recent.error;
  const used = monthly.count ?? 0;
  if (used >= plan.monthly_ai_generations) {
    throw new HttpError(429, "monthly_limit",
      `Você usou as ${plan.monthly_ai_generations} gerações de IA do mês. Faça upgrade ou aguarde o próximo mês.`);
  }
  if ((recent.count ?? 0) >= PER_MINUTE_LIMIT) {
    throw new HttpError(429, "rate_limited", "Muitas mensagens seguidas. Aguarde um minuto.");
  }

  // Projeto (RLS garante que é do usuário) e conversa
  const project = await loadProject(db, body.projectId);
  let conversationId = body.conversationId ?? "";
  let isNew = false;
  if (conversationId) {
    const { data, error } = await db.from("ai_conversations").select("id, project_id").eq("id", conversationId).maybeSingle();
    if (error) throw error;
    if (!data || data.project_id !== project.id) throw new HttpError(404, "not_found", "Conversa não encontrada.");
  } else {
    const { data, error } = await db.from("ai_conversations")
      .insert({ user_id: user.id, project_id: project.id, title: message.replace(/\s+/g, " ").slice(0, 80) })
      .select("id").single();
    if (error) throw error;
    conversationId = data.id;
    isNew = true;
  }

  const { error: insertError } = await db.from("ai_messages")
    .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });
  if (insertError) throw insertError;

  const { data: history, error: historyError } = await db.from("ai_messages")
    .select("role, content").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
  if (historyError) throw historyError;
  const messages = (history ?? []).reverse() as ChatMessage[];
  // A conversa precisa começar pelo usuário.
  while (messages.length && messages[0]!.role !== "user") messages.shift();

  const context = await buildContext(db, project, plan);
  const system = style
    ? `${CHAT_SYSTEM}\n\nEstilo de escrita pedido pelo usuário para as respostas: ${style}`
    : CHAT_SYSTEM;

  const result: StreamResult = { model: "", inputTokens: 0, outputTokens: 0 };
  const generator = await streamChat({ system, context, messages, maxTokens: 6000, deadline }, result);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "start", conversationId, isNew });
      let full = "";
      try {
        for await (const delta of generator) {
          full += delta;
          send({ type: "delta", text: delta });
        }
        if (!full.trim()) throw new HttpError(502, "ai_empty", "A IA não retornou resposta. Tente reformular.");
        await db.from("ai_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: full.slice(0, 40000) });
        await db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        await admin.from("ai_usage").insert({
          user_id: user.id, project_id: project.id, tool: "chat", model: result.model || "n/a",
          input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true,
        });
        send({ type: "done", conversationId, usage: { used: used + 1, limit: plan.monthly_ai_generations } });
      } catch (err) {
        console.error("ai-chat stream error", err);
        await admin.from("ai_usage").insert({ user_id: user.id, project_id: project.id, tool: "chat", model: "n/a", success: false });
        if (full.trim()) {
          await db.from("ai_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: full.slice(0, 40000) });
        }
        send({
          type: "error",
          code: err instanceof HttpError ? err.code : "ai_error",
          message: err instanceof HttpError ? err.message : "A IA não conseguiu responder agora. Tente novamente.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
});
