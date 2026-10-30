// Edge Function: ai-generate
// Ponto único de geração com IA. Valida sessão, plano, limites mensais e por
// minuto, monta o contexto do projeto (memória isolada por projeto + histórico
// para evitar repetição), chama o Claude e registra o consumo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured, type Effort } from "../_shared/ai.ts";
import { HttpError, json, serve } from "../_shared/http.ts";
import { admin, authenticate, getPlan, type PlanInfo } from "../_shared/supabase.ts";
import {
  CTA_GOAL_LABELS,
  HOOK_CATEGORY_LABELS,
  planSchema,
  SCHEMAS,
  SCRIPT_TYPE_LABELS,
  SYSTEM_PROMPT,
} from "./prompts.ts";

type Tool = "ideas" | "script" | "caption" | "hooks" | "cta" | "hashtags" | "plan" | "analytics_insights" | "suggestions";

const TOOL_FEATURE: Record<Tool, string> = {
  ideas: "ai_ideas",
  hooks: "ai_hooks",
  hashtags: "ai_hashtags",
  suggestions: "ai_suggestions",
  script: "ai_scripts",
  caption: "ai_captions",
  cta: "ai_cta",
  plan: "ai_plan",
  analytics_insights: "ai_analytics",
};

const PER_MINUTE_LIMIT = 8;

type Input = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------
function text(input: Input, key: string, { required = false, max = 2000 } = {}): string {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, "invalid_input", `Preencha o campo "${key}".`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, "invalid_input", `Campo "${key}" inválido.`);
  return value.trim().slice(0, max);
}

function list(input: Input, key: string, max = 12): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim().slice(0, 80)).slice(0, max);
}

function number(input: Input, key: string, allowed: number[], fallback: number): number {
  const value = Number(input[key]);
  return allowed.includes(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Contexto do projeto e memória
// ---------------------------------------------------------------------------
const MEMORY_LABELS: Record<string, string> = {
  estilo: "Estilo de escrita",
  tom_de_voz: "Tom de voz",
  publico: "Público-alvo",
  assunto_abordado: "Assuntos já abordados (não repetir)",
  conteudo_aprovado: "Conteúdos aprovados pelo usuário (referência de qualidade)",
  preferencia: "Preferências do usuário",
  objetivo: "Objetivos",
  palavra_evitar: "Palavras e expressões proibidas",
};

interface Project {
  id: string;
  name: string;
  kind: string;
  description: string;
  niche: string;
  audience: string;
  voice: string;
  platforms: string[];
  goals: string[];
  posts_per_week: number;
}

async function loadProject(db: SupabaseClient, projectId: string): Promise<Project> {
  const { data, error } = await db.from("projects")
    .select("id, name, kind, description, niche, audience, voice, platforms, goals, posts_per_week")
    .eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "project_not_found", "Projeto não encontrado.");
  return data as Project;
}

async function buildContext(db: SupabaseClient, project: Project, plan: PlanInfo): Promise<string> {
  const advanced = plan.features.includes("advanced_memory");
  const [memory, posts, ideas, top] = await Promise.all([
    db.from("ai_memory").select("kind, content").eq("project_id", project.id)
      .order("updated_at", { ascending: false }).limit(advanced ? 250 : 60),
    db.from("calendar_posts").select("title, format, content_pillar").eq("project_id", project.id)
      .order("scheduled_date", { ascending: false }).limit(advanced ? 120 : 50),
    db.from("content_ideas").select("title").eq("project_id", project.id)
      .order("created_at", { ascending: false }).limit(advanced ? 80 : 30),
    advanced
      ? db.from("analytics").select("title, format, topic, engagement_rate, saves, views")
        .eq("project_id", project.id).not("engagement_rate", "is", null)
        .order("engagement_rate", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  for (const r of [memory, posts, ideas, top]) if (r.error) throw r.error;

  const grouped = new Map<string, string[]>();
  for (const m of memory.data ?? []) {
    grouped.set(m.kind, [...(grouped.get(m.kind) ?? []), m.content]);
  }

  const lines: (string | null)[] = [
    `# Projeto: ${project.name}`,
    `Tipo: ${project.kind}`,
    project.description ? `Descrição: ${project.description}` : null,
    `Nicho: ${project.niche || "não informado"}`,
    `Público: ${project.audience || "não informado"}`,
    `Identidade de comunicação: ${project.voice || "não informada"}`,
    `Plataformas: ${project.platforms.join(", ") || "não informadas"}`,
    `Objetivos: ${project.goals.join(", ") || "não informados"}`,
    "",
    "# Memória estratégica do projeto",
  ];
  if (grouped.size === 0) lines.push("(vazia)");
  for (const [kind, items] of grouped) {
    lines.push(`## ${MEMORY_LABELS[kind] ?? kind}`, ...items.map((i) => `- ${i}`));
  }
  const postTitles = (posts.data ?? []).map((p) => `- ${p.title}${p.format ? ` (${p.format})` : ""}`);
  if (postTitles.length) lines.push("", "# Conteúdos já planejados ou publicados (evite repetir)", ...postTitles);
  const ideaTitles = (ideas.data ?? []).map((i) => `- ${i.title}`);
  if (ideaTitles.length) lines.push("", "# Ideias já salvas no banco (evite duplicar)", ...ideaTitles);
  if (top.data?.length) {
    lines.push("", "# Publicações com melhor engajamento registrado (dados reais do usuário)");
    for (const t of top.data) {
      lines.push(`- ${t.title} · ${t.format} · engajamento ${t.engagement_rate}% · ${t.saves} salvamentos · ${t.views} views`);
    }
  }
  return lines.filter((l) => l !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------
interface ToolRun {
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: Effort;
  transform?: (data: unknown) => unknown;
}

function ideasTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 300 });
  const quantity = number(input, "quantity", [5, 10, 15], 10);
  return {
    prompt: `Gere ${quantity} ideias de conteúdo sobre: "${topic}".
Distribua entre os tipos: Reels, carrosséis, Stories, temas de vídeo, conteúdos educativos, de autoridade e com potencial de alcance (marque como "viral_potencial" apenas ideias com gatilhos claros de compartilhamento; isso é potencial, não garantia).
Cada ideia: título claro, abordagem (como executar, em 1-2 frases), público específico a quem fala e objetivo estratégico.`,
    schema: SCHEMAS.ideas,
    maxTokens: 8000,
    effort: "low",
  };
}

function scriptTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const type = text(input, "type", { max: 40 }) || "camera";
  const duration = number(input, "duration", [15, 30, 45, 60, 90], 30);
  const platform = text(input, "platform", { max: 40 });
  const extra = text(input, "notes", { max: 1000 });
  const words = Math.round(duration * 2.4);
  return {
    prompt: `Escreva um roteiro de ${duration} segundos (cerca de ${words} palavras faladas no total).
Tipo: ${SCRIPT_TYPE_LABELS[type] ?? type}.
${platform ? `Plataforma: ${platform}.` : ""}
Tema: ${topic}
${extra ? `Observações do usuário: ${extra}` : ""}

Estrutura obrigatória: gancho forte (primeiros 3 segundos), desenvolvimento natural, mensagem central, conclusão e CTA.
Escreva como fala, não como texto escrito: contrações naturais ("tá", "pra") quando combinarem com o tom do projeto, pausas indicadas com quebra de linha, sem palavras difíceis.
Em "full_script", junte tudo no texto final para gravar, com indicações de cena entre colchetes quando úteis (ex.: [corte para a tela do celular]).
Em "recording_tips", até 4 dicas práticas de gravação para este roteiro.`,
    schema: SCHEMAS.script,
    maxTokens: 8000,
    effort: "medium",
  };
}

function captionTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 800 });
  const platform = text(input, "platform", { required: true, max: 40 });
  const tone = text(input, "tone", { max: 40 }) || "natural";
  const goal = text(input, "goal", { max: 200 });
  const niche = text(input, "niche", { max: 200 });
  return {
    prompt: `Crie 3 variações de legenda para ${platform}.
Tema/conteúdo do post: ${topic}
${niche ? `Nicho: ${niche}` : ""}
${goal ? `Objetivo: ${goal}` : ""}
Tom: ${tone}.
Adapte tamanho e formatação às convenções de ${platform} (ex.: LinkedIn aceita textos mais longos com parágrafos; TikTok pede legendas curtas).
Cada variação com abertura forte na primeira linha, corpo e CTA final. Não inclua hashtags no texto.
Em "label", descreva a abordagem em 2-4 palavras (ex.: "Direta e curta").`,
    schema: SCHEMAS.caption,
    maxTokens: 6000,
    effort: "low",
  };
}

function hooksTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const categories = list(input, "categories").filter((c) => c in HOOK_CATEGORY_LABELS);
  const selected = categories.length ? categories : Object.keys(HOOK_CATEGORY_LABELS);
  return {
    prompt: `Crie ganchos de abertura (a primeira frase do vídeo ou do post) sobre: "${topic}".
Gere 2 ganchos para cada categoria: ${selected.map((c) => `${c} (${HOOK_CATEGORY_LABELS[c]})`).join(", ")}.
Cada gancho com no máximo 18 palavras, falável em até 3 segundos. Em "why_it_works", explique em uma frase o mecanismo de atenção.`,
    schema: SCHEMAS.hooks,
    maxTokens: 6000,
    effort: "low",
  };
}

function ctaTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const goals = list(input, "goals").filter((g) => g in CTA_GOAL_LABELS);
  const selected = goals.length ? goals : Object.keys(CTA_GOAL_LABELS);
  const platform = text(input, "platform", { max: 40 });
  return {
    prompt: `Crie chamadas para ação (CTA) para um conteúdo sobre: "${topic}"${platform ? ` em ${platform}` : ""}.
Gere 3 opções para cada objetivo: ${selected.map((g) => `${g} (${CTA_GOAL_LABELS[g]})`).join(", ")}.
CTAs curtos, com um motivo concreto para a ação (o que a pessoa ganha), sem soar desesperado.`,
    schema: SCHEMAS.cta,
    maxTokens: 5000,
    effort: "low",
  };
}

function hashtagsTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const platform = text(input, "platform", { required: true, max: 40 });
  return {
    prompt: `Sugira hashtags para um conteúdo sobre "${topic}" em ${platform}.
Organize em grupos: "Nicho específico", "Comunidade", "Tema do post" e "Alcance amplo (relacionado)".
Respeite a quantidade usual da plataforma (ex.: Instagram até 15 no total, TikTok 3-6, LinkedIn 3-5, YouTube 3-5).
Todas devem ter relação direta com o assunto. Em "notes", explique em uma frase como combinar os grupos.`,
    schema: SCHEMAS.hashtags,
    maxTokens: 3000,
    effort: "low",
    transform: (data) => {
      const d = data as { groups: { label: string; hashtags: string[] }[]; notes: string };
      return {
        ...d,
        groups: d.groups.map((g) => ({
          ...g,
          hashtags: [...new Set(g.hashtags.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")))],
        })),
      };
    },
  };
}

/** Datas de publicação distribuídas uniformemente no período. */
function planSlots(startDate: string, days: number, perWeek: number): string[] {
  const total = Math.max(1, Math.round((days * perWeek) / 7));
  const start = new Date(`${startDate}T12:00:00Z`);
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + Math.floor((i * days) / total));
    return d.toISOString().slice(0, 10);
  });
}

function planTool(input: Input, plan: PlanInfo): ToolRun {
  const days = number(input, "days", [7, 15, 30], 7);
  if (days > plan.max_plan_days) {
    throw new HttpError(402, "plan_feature", `Planejamentos de ${days} dias estão disponíveis no plano Pro.`);
  }
  const startDate = text(input, "start_date", { required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new HttpError(400, "invalid_input", "Data inicial inválida.");
  const perWeek = Math.min(14, Math.max(1, Number(input.posts_per_week) || 3));
  const platforms = list(input, "platforms");
  if (!platforms.length) throw new HttpError(400, "invalid_input", "Escolha pelo menos uma rede social.");
  const formats = list(input, "formats");
  const slots = planSlots(startDate, days, perWeek);

  return {
    prompt: `Crie um planejamento estratégico de conteúdo de ${days} dias com exatamente ${slots.length} publicações.

Briefing:
- Nicho: ${text(input, "niche", { required: true, max: 200 })}
- Público-alvo: ${text(input, "audience", { required: true, max: 600 })}
- Objetivo principal: ${text(input, "goal", { required: true, max: 80 })}
- Redes: ${platforms.join(", ")}
- Publicações por semana: ${perWeek}
- Formatos preferidos: ${formats.join(", ") || "livre"}
- Estilo de comunicação: ${text(input, "style", { max: 200 }) || "natural"}
- Temas desejados: ${text(input, "themes", { max: 800 }) || "livre, dentro do nicho"}
- Temas a evitar: ${text(input, "avoid", { max: 800 }) || "nenhum informado"}

As publicações estão nas datas: ${slots.join(", ")}. Gere os itens nessa ordem, um por data.
Regras:
- Sem temas repetidos entre si nem com os já abordados no contexto.
- Equilibre pilares: educativo, emocional, informativo, entretenimento e vendas (vendas no máximo 1 a cada 5, salvo se o objetivo for gerar vendas, então até 1 a cada 3). Use também autoridade/comunidade quando fizer sentido.
- Alterne plataformas e formatos de acordo com as preferências.
- Crie uma progressão: começar atraindo e gerando confiança, depois aprofundar e converter.
- "script": estrutura do roteiro em tópicos curtos (gancho → desenvolvimento → mensagem → CTA) ou o roteiro do carrossel slide a slide.
- "caption": legenda completa pronta para publicar, sem hashtags.
- "hashtags": 3 a 10 hashtags específicas com #.
- "strategy_summary": 3-5 frases explicando a lógica do planejamento.`,
    schema: planSchema(platforms, formats),
    maxTokens: days === 30 ? 64000 : 32000,
    effort: "medium",
    transform: (data) => {
      const d = data as { strategy_summary: string; items: Record<string, unknown>[] };
      return {
        strategy_summary: d.strategy_summary,
        items: d.items.slice(0, slots.length).map((item, i) => ({
          ...item,
          id: crypto.randomUUID(),
          date: slots[i],
          hashtags: ((item.hashtags as string[]) ?? []).map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")),
        })),
      };
    },
  };
}

interface AnalyticsRow {
  title: string;
  platform: string;
  format: string;
  topic: string;
  published_on: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  clicks: number;
  engagement_rate: number | null;
}

async function analyticsTool(db: SupabaseClient, projectId: string): Promise<ToolRun> {
  const { data, error } = await db.from("analytics")
    .select("title, platform, format, topic, published_on, views, reach, likes, comments, shares, saves, followers_gained, clicks, engagement_rate")
    .eq("project_id", projectId).order("published_on", { ascending: false }).limit(300);
  if (error) throw error;
  const rows = (data ?? []) as AnalyticsRow[];
  if (rows.length < 3) {
    throw new HttpError(422, "insufficient_data",
      "Registre métricas de pelo menos 3 publicações para a IA analisar seus resultados.");
  }

  const groupBy = (key: keyof AnalyticsRow) => {
    const groups = new Map<string, AnalyticsRow[]>();
    for (const r of rows) {
      const k = String(r[key] || "sem informação");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups].map(([k, items]) => {
      const withEng = items.filter((i) => i.engagement_rate !== null);
      const avg = (f: (r: AnalyticsRow) => number) => Math.round(items.reduce((s, r) => s + f(r), 0) / items.length);
      return {
        [key]: k,
        publicacoes: items.length,
        media_views: avg((r) => r.views),
        media_salvamentos: avg((r) => r.saves),
        media_comentarios: avg((r) => r.comments),
        engajamento_medio: withEng.length
          ? Number((withEng.reduce((s, r) => s + Number(r.engagement_rate), 0) / withEng.length).toFixed(2))
          : null,
      };
    });
  };

  const dates = rows.map((r) => r.published_on).sort();
  const spanDays = Math.max(1, (Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / 86_400_000 + 1);

  const dataset = {
    total_publicacoes: rows.length,
    periodo: { de: dates[0], ate: dates.at(-1), publicacoes_por_semana: Number((rows.length / (spanDays / 7)).toFixed(1)) },
    por_formato: groupBy("format"),
    por_plataforma: groupBy("platform"),
    por_tema: groupBy("topic"),
    mais_salvas: [...rows].sort((a, b) => b.saves - a.saves).slice(0, 5)
      .map((r) => ({ titulo: r.title, salvamentos: r.saves, formato: r.format })),
    publicacoes: rows.slice(0, 60),
  };

  return {
    prompt: `Analise as métricas reais registradas pelo usuário (JSON abaixo) e escreva observações úteis.

${JSON.stringify(dataset)}

Regras:
- Use apenas estes números. Não invente métricas nem extrapole tendências que os dados não mostram.
- Cubra: formatos com melhor desempenho, temas com mais interação, frequência de publicação, conteúdos mais salvos e sugestões para os próximos conteúdos.
- Em "evidence", cite os números que sustentam cada observação.
- Não chame nenhuma publicação de viral. Se a amostra for pequena (menos de 10 publicações ou grupos com 1-2 itens), diga isso em "data_caveats" e trate as conclusões como hipóteses.
- "next_steps": 3 a 5 ações concretas para as próximas semanas.`,
    schema: SCHEMAS.analytics_insights,
    maxTokens: 8000,
    effort: "medium",
  };
}

async function suggestionsTool(db: SupabaseClient, projectId: string): Promise<ToolRun> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("calendar_posts")
    .select("status, content_pillar, format, platform, scheduled_date")
    .eq("project_id", projectId).gte("scheduled_date", since);
  if (error) throw error;
  const posts = data ?? [];
  const count = (key: "status" | "content_pillar" | "format" | "platform") =>
    posts.reduce<Record<string, number>>((acc, p) => {
      const k = (p[key] as string | null) ?? "sem_pilar";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

  return {
    prompt: `Situação real dos últimos 30 dias e próximos agendamentos deste projeto:
${JSON.stringify({ total: posts.length, por_status: count("status"), por_pilar: count("content_pillar"), por_formato: count("format"), por_plataforma: count("platform") })}

1. Sugira 4 ideias de conteúdo novas e específicas para este projeto, que preencham lacunas de pilar ou formato.
2. Faça 3 recomendações estratégicas curtas baseadas nessa situação (ex.: equilíbrio de pilares, constância, gargalos de produção). Se não houver dados, recomende os primeiros passos.`,
    schema: SCHEMAS.suggestions,
    maxTokens: 5000,
    effort: "low",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
  const { user, db } = await authenticate(req);

  const body = await req.json().catch(() => null) as { tool?: Tool; projectId?: string; input?: Input } | null;
  const tool = body?.tool;
  if (!tool || !(tool in TOOL_FEATURE)) throw new HttpError(400, "invalid_tool", "Ferramenta de IA inválida.");
  if (!body?.projectId) throw new HttpError(400, "invalid_input", "Selecione um projeto.");
  const input = (body.input && typeof body.input === "object") ? body.input : {};

  // 1. Plano e permissões (validados no servidor)
  const plan = await getPlan(user.id);
  if (!plan.features.includes(TOOL_FEATURE[tool])) {
    throw new HttpError(402, "plan_feature", "Este recurso não está disponível no seu plano. Faça upgrade para liberar.");
  }

  // 2. Limites de uso: mensal e anti-abuso por minuto
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
    throw new HttpError(429, "rate_limited", "Muitas gerações seguidas. Aguarde um minuto.");
  }

  // 3. Contexto do projeto (RLS garante que o projeto é do usuário)
  const project = await loadProject(db, body.projectId);
  const context = await buildContext(db, project, plan);

  const run: ToolRun = await (async () => {
    switch (tool) {
      case "ideas": return ideasTool(input);
      case "script": return scriptTool(input);
      case "caption": return captionTool(input);
      case "hooks": return hooksTool(input);
      case "cta": return ctaTool(input);
      case "hashtags": return hashtagsTool(input);
      case "plan": return planTool(input, plan);
      case "analytics_insights": return analyticsTool(db, project.id);
      case "suggestions": return suggestionsTool(db, project.id);
    }
  })();

  // 4. Geração
  try {
    const result = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      context,
      prompt: run.prompt,
      schema: run.schema,
      maxTokens: run.maxTokens,
      effort: run.effort,
    });
    await admin.from("ai_usage").insert({
      user_id: user.id, project_id: project.id, tool, model: result.model,
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true,
    });
    return json({
      data: run.transform ? run.transform(result.data) : result.data,
      usage: { used: used + 1, limit: plan.monthly_ai_generations },
    });
  } catch (err) {
    // Falhas não consomem cota, mas contam para o limite por minuto.
    await admin.from("ai_usage").insert({
      user_id: user.id, project_id: project.id, tool, model: "n/a", success: false,
    });
    throw err;
  }
});
