import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, BookmarkPlus, Copy, FileText, Lightbulb, MessageSquare, PanelLeft, Plus, Sparkles, Square, Trash2, Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { RichText } from "@/components/RichText";
import { DEFAULT_STYLE, StylePicker, type StyleChoice } from "@/components/StylePicker";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/misc";
import { UpgradeCard } from "@/components/UpgradeGate";
import { ListeningBar, MicButton, useVoiceAppend } from "@/components/Voice";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError } from "@/lib/ai";
import { sendChatMessage } from "@/lib/chat";
import { useTableMutations } from "@/lib/queries";
import { speak } from "@/lib/speech";
import { friendlyError, supabase } from "@/lib/supabase";
import { cn, copyText, fmtRelative } from "@/lib/utils";
import type { ContentIdea, LibraryItem, Script } from "@/types";

interface Conversation { id: string; title: string; updated_at: string }
interface Msg { id: string; role: "user" | "assistant"; content: string; pending?: boolean }

const STARTERS = [
  { icon: "🗓️", title: "Planejar minha semana", prompt: "Monte um plano de conteúdo para esta semana, com 1 tema por dia, formato e gancho." },
  { icon: "🎬", title: "Roteiro de 30 segundos", prompt: "Escreva um roteiro de Reels de 30 segundos sobre um tema forte do meu nicho, com gancho, desenvolvimento e CTA." },
  { icon: "🪝", title: "Melhorar meu gancho", prompt: "Vou te mandar um gancho e quero 5 versões mais fortes, explicando por que cada uma prende. Meu gancho: " },
  { icon: "🧭", title: "Pautas que ainda não fiz", prompt: "Considerando o que já publiquei, quais 8 temas eu ainda não explorei e deveria? Diga o ângulo de cada um." },
  { icon: "🧩", title: "Carrossel completo", prompt: "Crie um carrossel de 7 slides sobre um erro comum do meu público, com o texto de cada slide e a legenda." },
  { icon: "💬", title: "Responder comentários", prompt: "Me ajude a responder este comentário de forma simpática e que gere conversa: " },
];

export default function Assistant() {
  const { hasFeature, plan } = useWorkspace();
  if (plan && !hasFeature("ai_chat")) return <UpgradeCard feature="ai_chat" />;
  return <AssistantWorkspace />;
}

function AssistantWorkspace() {
  const { projectId, project, refetchPlan, hasFeature } = useWorkspace();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [style, setStyle] = useState<StyleChoice>(DEFAULT_STYLE);
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useVoiceAppend(input, setInput);
  const ideas = useTableMutations<ContentIdea>("content_ideas");
  const scripts = useTableMutations<Script>("scripts");
  const library = useTableMutations<LibraryItem>("library_items");

  const conversations = useQuery({
    queryKey: ["conversations", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_conversations").select("id, title, updated_at")
        .eq("project_id", projectId).order("updated_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Conversation[];
    },
  });

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setConversationId(id);
    setShowList(false);
    const { data, error } = await supabase.from("ai_messages").select("id, role, content")
      .eq("conversation_id", id).order("created_at");
    if (error) return toast.error(friendlyError(error));
    setMessages(data as Msg[]);
  }, []);

  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setShowList(false);
    textareaRef.current?.focus();
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);
  useEffect(() => { newConversation(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || sending) return;
    dictation.stop();
    setInput("");
    setSending(true);
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, { id: assistantId, role: "assistant", content: "", pending: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await sendChatMessage({ projectId, conversationId: conversationId ?? undefined, message, style: style.instruction || undefined }, {
        onStart: (id, isNew) => {
          setConversationId(id);
          if (isNew) qc.invalidateQueries({ queryKey: ["conversations", projectId] });
        },
        onDelta: (delta) => setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + delta } : x))),
        onDone: () => { qc.invalidateQueries({ queryKey: ["conversations", projectId] }); refetchPlan(); },
      }, controller.signal);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("unknown", "A IA não conseguiu responder.");
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content || `⚠️ ${err.message}` } : x)));
      if (err.needsUpgrade) toast.error(err.message, { action: { label: "Ver planos", onClick: () => navigate("/precos") } });
    } finally {
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, pending: false } : x)));
      setSending(false);
      abortRef.current = null;
    }
  };

  // Mensagem vinda de outra tela (?msg=...)
  useEffect(() => {
    const msg = params.get("msg");
    if (!msg || !projectId) return;
    setParams({}, { replace: true });
    send(msg);
  }, [params, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id: string) => {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    if (id === conversationId) newConversation();
    qc.invalidateQueries({ queryKey: ["conversations", projectId] });
  };

  const firstLine = (t: string) => t.replace(/[#*`>]/g, "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? "Conteúdo do assistente";

  const list = (
    <div className="flex h-full flex-col">
      <Button className="m-3" icon={<Plus className="h-4 w-4" />} onClick={newConversation}>Nova conversa</Button>
      <div className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {(conversations.data ?? []).length === 0 && <p className="px-3 py-6 text-center text-xs text-ink-soft">Suas conversas aparecem aqui.</p>}
        {(conversations.data ?? []).map((c) => (
          <div key={c.id} className={cn("group flex items-center gap-2 rounded-xl px-3 py-2.5 transition", c.id === conversationId ? "bg-brand-50" : "hover:bg-canvas")}>
            <button onClick={() => openConversation(c.id)} className="min-w-0 flex-1 text-left">
              <p className={cn("truncate text-[13px] font-semibold", c.id === conversationId && "text-brand-700")}>{c.title}</p>
              <p className="text-[11px] text-ink-faint">{fmtRelative(c.updated_at)}</p>
            </button>
            <button onClick={() => remove(c.id)} className="hidden text-ink-faint hover:text-[#D93A4A] group-hover:block" aria-label="Excluir conversa"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-4rem)] sm:-mx-6 lg:-mx-8 lg:-my-8">
      <aside className="hidden w-[260px] shrink-0 border-r border-line bg-white/70 backdrop-blur lg:block">{list}</aside>
      {showList && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowList(false)}>
          <div className="absolute inset-0 bg-[#0E0B1E]/40" />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>{list}</aside>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line/70 px-4 py-2.5 sm:px-6">
          <button className="rounded-lg p-1.5 text-ink-soft hover:bg-brand-50 lg:hidden" onClick={() => setShowList(true)} aria-label="Conversas"><PanelLeft className="h-5 w-5" /></button>
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white"><Sparkles className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Assistente de conteúdo</p>
            <p className="truncate text-xs text-ink-soft">Conhece o projeto {project?.name}</p>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 ? (
              <div className="pt-6 text-center sm:pt-12">
                <div className="orb mx-auto h-16 w-16 rounded-full" />
                <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">Como posso ajudar hoje?</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">Converse sobre estratégia, peça roteiros, legendas e planos. Eu uso a memória de <strong className="text-ink">{project?.name}</strong>.</p>
                <div className="mt-8 grid gap-2.5 text-left sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button key={s.title} onClick={() => (s.prompt.endsWith(": ") ? (setInput(s.prompt), textareaRef.current?.focus()) : send(s.prompt))}
                      className="card flex items-start gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop">
                      <span className="text-xl">{s.icon}</span>
                      <span><span className="block text-sm font-bold">{s.title}</span><span className="mt-0.5 line-clamp-2 block text-xs text-ink-soft">{s.prompt}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                {m.role === "user"
                  ? <Avatar name={profile?.full_name || "Você"} url={profile?.avatar_url} size={32} />
                  : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white"><Sparkles className="h-4 w-4" /></span>}
                <div className={cn("min-w-0 max-w-[85%]", m.role === "user" && "text-right")}>
                  <div className={cn("inline-block rounded-2xl px-4 py-3 text-left",
                    m.role === "user" ? "rounded-tr-md bg-brand-500 text-white" : "rounded-tl-md border border-line bg-white shadow-card")}>
                    {m.role === "user" ? <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{m.content}</p>
                      : m.content ? <RichText text={m.content} />
                      : <span className="flex gap-1 py-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-brand-300" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>}
                    {m.pending && m.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand-400 align-middle" />}
                  </div>
                  {m.role === "assistant" && !m.pending && m.content && !m.content.startsWith("⚠️") && (
                    <div className="mt-1.5 flex flex-wrap gap-0.5">
                      <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await copyText(m.content); toast.success("Copiado"); }}>Copiar</Button>
                      <Button size="sm" variant="ghost" icon={<Volume2 className="h-3.5 w-3.5" />} onClick={() => speak(m.content.replace(/[#*`]/g, "")) || toast.error("Leitura em voz alta indisponível.")}>Ouvir</Button>
                      <Button size="sm" variant="ghost" icon={<Lightbulb className="h-3.5 w-3.5" />} onClick={async () => {
                        await ideas.create.mutateAsync({ title: firstLine(m.content), description: m.content.slice(0, 4000), source: "ai", niche: project?.niche ?? "" });
                        toast.success("Salvo no banco de ideias");
                      }}>Ideia</Button>
                      <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={async () => {
                        const [s] = await scripts.create.mutateAsync({ title: firstLine(m.content), content: m.content.replace(/\*\*/g, ""), source: "ai", status: "rascunho" });
                        toast.success("Roteiro criado", { action: { label: "Abrir", onClick: () => navigate(`/roteiros/${s!.id}`) } });
                      }}>Roteiro</Button>
                      {hasFeature("library") && (
                        <Button size="sm" variant="ghost" icon={<BookmarkPlus className="h-3.5 w-3.5" />} onClick={async () => {
                          await library.create.mutateAsync({ kind: "texto", title: firstLine(m.content), content: m.content, tags: ["assistente"] });
                          toast.success("Salvo na biblioteca");
                        }}>Biblioteca</Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-line/70 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="glow-border rounded-2xl">
              <div className="rounded-2xl bg-white p-2">
                <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Mensagem"
                  placeholder="Pergunte, peça um roteiro, cole um texto para melhorar…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  className="max-h-48 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0" />
                <div className="flex items-center gap-2">
                  {dictation.supported && <MicButton size="sm" listening={dictation.listening} onClick={dictation.toggle} />}
                  <StylePicker value={style} onChange={setStyle} />
                  <span className="ml-auto hidden text-[11px] text-ink-faint sm:inline">Enter envia · Shift+Enter quebra linha</span>
                  {sending ? (
                    <button onClick={() => abortRef.current?.abort()} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white" aria-label="Parar resposta"><Square className="h-3.5 w-3.5 fill-current" /></button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white shadow-glow transition disabled:opacity-40" aria-label="Enviar"><ArrowUp className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            </div>
            {dictation.listening && <ListeningBar interim={dictation.interim} />}
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-ink-faint"><MessageSquare className="h-3 w-3" />Cada mensagem usa 1 geração de IA. Confira informações importantes.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
