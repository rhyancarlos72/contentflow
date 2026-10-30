import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookmarkPlus, CalendarPlus, Check, Copy, FileText, Hash, Lightbulb, Megaphone, MessageSquareQuote,
  Sparkles, Type, Wand2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, Spinner } from "@/components/ui/misc";
import { UpgradeCard } from "@/components/UpgradeGate";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  AiError, generate, type AiTool, type CaptionResult, type CtaResult, type HashtagResult, type HookResult,
  type IdeaResult, type ScriptResult,
} from "@/lib/ai";
import { PLATFORMS, TONES } from "@/lib/constants";
import { useTableMutations } from "@/lib/queries";
import { cn, copyText } from "@/lib/utils";
import type { ContentIdea, LibraryItem, LibraryKind, Script } from "@/types";

type ModuleId = "ideas" | "script" | "caption" | "hooks" | "cta" | "hashtags";

const MODULES: { id: ModuleId; label: string; desc: string; icon: typeof Lightbulb; feature: string }[] = [
  { id: "ideas", label: "Gerador de ideias", desc: "Reels, carrosséis, Stories e mais", icon: Lightbulb, feature: "ai_ideas" },
  { id: "script", label: "Gerador de roteiros", desc: "Roteiros falados de 15 a 90s", icon: FileText, feature: "ai_scripts" },
  { id: "caption", label: "Gerador de legendas", desc: "3 variações no seu tom", icon: Type, feature: "ai_captions" },
  { id: "hooks", label: "Gerador de ganchos", desc: "Aberturas que prendem", icon: Zap, feature: "ai_hooks" },
  { id: "cta", label: "Gerador de CTA", desc: "Chamadas para ação", icon: Megaphone, feature: "ai_cta" },
  { id: "hashtags", label: "Gerador de hashtags", desc: "Relevantes ao tema", icon: Hash, feature: "ai_hashtags" },
];

const IDEA_TYPES: Record<string, string> = {
  reels: "Reels", carrossel: "Carrossel", stories: "Stories", video: "Vídeo", educativo: "Educativo",
  autoridade: "Autoridade", viral_potencial: "Potencial de alcance",
};
const SCRIPT_TYPES = [
  { value: "reels_narrado", label: "Reels narrado" }, { value: "camera", label: "Falando para a câmera" },
  { value: "react", label: "React" }, { value: "tiktok", label: "TikTok" }, { value: "shorts", label: "Shorts" },
  { value: "motivacional", label: "Motivacional" }, { value: "educativo", label: "Educativo" }, { value: "vendas", label: "Vendas" },
] as const;
const DURATIONS = [15, 30, 45, 60, 90].map((d) => ({ value: String(d), label: `${d}s` }));
const HOOK_CATEGORIES = [
  { value: "curiosidade", label: "Curiosidade" }, { value: "polemica_construtiva", label: "Polêmica construtiva" },
  { value: "identificacao", label: "Identificação" }, { value: "historia_pessoal", label: "História pessoal" },
  { value: "pergunta", label: "Pergunta" }, { value: "erro_comum", label: "Erro comum" },
  { value: "conselho", label: "Conselho" }, { value: "quebra_de_crenca", label: "Quebra de crença" },
] as const;
const CTA_GOALS = [
  { value: "seguir", label: "Seguir o perfil" }, { value: "comentar", label: "Comentar" }, { value: "compartilhar", label: "Compartilhar" },
  { value: "salvar", label: "Salvar" }, { value: "clicar_link", label: "Clicar no link" }, { value: "comprar", label: "Comprar" },
  { value: "mensagem", label: "Enviar mensagem" },
] as const;
const labelOf = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

export default function Studio() {
  const [active, setActive] = useState<ModuleId>("ideas");
  const { hasFeature } = useWorkspace();
  const mod = MODULES.find((m) => m.id === active)!;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Estúdio de IA</h1>
        <p className="page-subtitle">Ferramentas que escrevem no tom do seu projeto e evitam o que você já publicou.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {MODULES.map((m) => (
          <button key={m.id} onClick={() => setActive(m.id)}
            className={cn("card flex flex-col items-start gap-2 p-4 text-left transition hover:-translate-y-0.5",
              active === m.id ? "border-brand-400 ring-4 ring-brand-100" : "hover:border-brand-200")}>
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl", active === m.id ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600")}>
              <m.icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold leading-tight">{m.label}</span>
            <span className="text-xs text-ink-soft">{m.desc}</span>
            {!hasFeature(m.feature) && <Badge color="#5935A8">Creator</Badge>}
          </button>
        ))}
      </div>
      {hasFeature(mod.feature) ? <ModuleView key={active} id={active} /> : <UpgradeCard feature={mod.feature} />}
    </div>
  );
}

/** Ações de salvar compartilhadas pelos resultados. */
function useSavers() {
  const { hasFeature, project } = useWorkspace();
  const library = useTableMutations<LibraryItem>("library_items");
  const ideas = useTableMutations<ContentIdea>("content_ideas");
  const scripts = useTableMutations<Script>("scripts");
  return {
    canLibrary: hasFeature("library"),
    toLibrary: async (kind: LibraryKind, title: string, content: string, tags: string[] = []) => {
      await library.create.mutateAsync({ kind, title: title.slice(0, 200), content, tags });
      toast.success("Salvo na biblioteca");
    },
    toIdea: async (idea: Partial<ContentIdea>) => {
      await ideas.create.mutateAsync({ niche: project?.niche ?? "", source: "ai", ...idea });
      toast.success("Ideia salva no banco");
    },
    toScript: (script: Partial<Script>) => scripts.create.mutateAsync({ source: "ai", status: "rascunho", ...script }),
  };
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="ghost" icon={done ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
      onClick={async () => { await copyText(text); setDone(true); toast.success("Copiado!"); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copiado" : "Copiar"}
    </Button>
  );
}

function ModuleView({ id }: { id: ModuleId }) {
  const { project } = useWorkspace();
  const savers = useSavers();
  const navigate = useNavigate();
  const [input, setInput] = useState<Record<string, unknown>>({
    topic: "", platform: project?.platforms[0] ?? "instagram", tone: "natural", type: "camera", duration: "30",
    quantity: "10", niche: project?.niche ?? "", goal: "", categories: [], goals: [], notes: "",
  });
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [scheduling, setScheduling] = useState<PostDraft | null>(null);
  const set = (k: string, v: unknown) => setInput((i) => ({ ...i, [k]: v }));
  const topic = String(input.topic ?? "");

  const run = async () => {
    if (!topic.trim()) return toast.error("Descreva o assunto primeiro.");
    setLoading(true);
    setError(null);
    try {
      const res = await generate<unknown>(id as AiTool, project!.id, {
        ...input, duration: Number(input.duration), quantity: Number(input.quantity),
        tone: labelOf(TONES, String(input.tone)),
        platform: labelOf(PLATFORMS, String(input.platform)),
      });
      setResult(res.data);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("unknown", "Erro ao gerar.");
      setError(err);
      if (!err.needsUpgrade) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const placeholder: Record<ModuleId, string> = {
    ideas: "Ex.: organização financeira para quem ganha até 3 salários",
    script: "Ex.: por que guardar dinheiro na poupança não é reserva de emergência",
    caption: "Ex.: carrossel com 5 sinais de que você precisa de um orçamento",
    hooks: "Ex.: como sair do cheque especial",
    cta: "Ex.: guia gratuito de planilha de gastos",
    hashtags: "Ex.: receitas fit para marmita da semana",
  };

  const form: ReactNode = (
    <div className="space-y-4">
      <Field label={id === "caption" ? "Tema ou conteúdo do post" : "Assunto"}>
        <Textarea rows={3} value={topic} onChange={(e) => set("topic", e.target.value)} placeholder={placeholder[id]} />
      </Field>
      {id === "ideas" && (
        <Field label="Quantidade"><Chips options={[{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "15", label: "15" }]}
          value={[String(input.quantity)]} onChange={(v) => set("quantity", v[0])} /></Field>
      )}
      {id === "script" && (
        <>
          <Field label="Tipo de roteiro"><Chips options={SCRIPT_TYPES} value={[String(input.type)]} onChange={(v) => set("type", v[0])} /></Field>
          <Field label="Duração"><Chips options={DURATIONS} value={[String(input.duration)]} onChange={(v) => set("duration", v[0])} /></Field>
          <Field label="Observações (opcional)"><Input value={String(input.notes)} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: citar meu e-book no final" /></Field>
        </>
      )}
      {["script", "caption", "cta", "hashtags"].includes(id) && (
        <Field label="Plataforma">
          <Select value={String(input.platform)} onChange={(e) => set("platform", e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
      )}
      {id === "caption" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nicho"><Input value={String(input.niche)} onChange={(e) => set("niche", e.target.value)} /></Field>
            <Field label="Objetivo"><Input value={String(input.goal)} onChange={(e) => set("goal", e.target.value)} placeholder="Ex.: gerar comentários" /></Field>
          </div>
          <Field label="Tom"><Chips options={TONES} value={[String(input.tone)]} onChange={(v) => set("tone", v[0])} /></Field>
        </>
      )}
      {id === "hooks" && (
        <Field label="Categorias" hint="Deixe vazio para gerar todas"><Chips multiple options={HOOK_CATEGORIES} value={input.categories as string[]} onChange={(v) => set("categories", v)} /></Field>
      )}
      {id === "cta" && (
        <Field label="Objetivos" hint="Deixe vazio para gerar todos"><Chips multiple options={CTA_GOALS} value={input.goals as string[]} onChange={(v) => set("goals", v)} /></Field>
      )}
      <Button size="lg" className="w-full" icon={<Wand2 className="h-4 w-4" />} loading={loading} onClick={run}>Gerar com IA</Button>
    </div>
  );

  const libraryBtn = (kind: LibraryKind, title: string, content: string, tags?: string[]) => savers.canLibrary && (
    <Button size="sm" variant="ghost" icon={<BookmarkPlus className="h-3.5 w-3.5" />} onClick={() => savers.toLibrary(kind, title, content, tags)}>Biblioteca</Button>
  );

  const renderResult = () => {
    if (!result) return null;
    switch (id) {
      case "ideas": return (result as { ideas: IdeaResult[] }).ideas.map((i) => (
        <ResultCard key={i.title} title={i.title} badge={IDEA_TYPES[i.type] ?? i.type}
          actions={<>
            <Button size="sm" variant="soft" icon={<Lightbulb className="h-3.5 w-3.5" />} onClick={() => savers.toIdea({
              title: i.title, description: i.approach, notes: `Público: ${i.audience}\nObjetivo: ${i.objective}`, format: i.type,
            })}>Salvar ideia</Button>
            <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-3.5 w-3.5" />}
              onClick={() => setScheduling({ ...emptyPost(undefined, project?.platforms[0]), title: i.title, strategic_goal: i.objective, script_outline: i.approach })}>Agendar</Button>
          </>}>
          <p>{i.approach}</p>
          <p className="mt-2 text-xs text-ink-soft"><strong>Público:</strong> {i.audience} · <strong>Objetivo:</strong> {i.objective}</p>
        </ResultCard>
      ));
      case "script": {
        const s = result as ScriptResult;
        return (
          <ResultCard title={s.title} badge={`~${s.estimated_seconds}s`}
            actions={<>
              <Button size="sm" variant="soft" icon={<FileText className="h-3.5 w-3.5" />} onClick={async () => {
                const [saved] = await savers.toScript({
                  title: s.title, content: s.full_script, duration_seconds: Number(input.duration),
                  platform: String(input.platform), format: String(input.type), notes: s.recording_tips.map((t) => `• ${t}`).join("\n"),
                });
                toast.success("Roteiro salvo em Meus Roteiros", { action: { label: "Abrir", onClick: () => navigate(`/roteiros/${saved!.id}`) } });
              }}>Salvar em Meus Roteiros</Button>
              <CopyButton text={s.full_script} />
              {libraryBtn("roteiro", s.title, s.full_script)}
            </>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[["Gancho", s.hook], ["Mensagem central", s.core_message], ["Desenvolvimento", s.development], ["Conclusão e CTA", `${s.conclusion}\n\n${s.cta}`]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-canvas p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{k}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Roteiro completo</p>
            <p className="prose-script mt-1 rounded-xl border border-line p-4">{s.full_script}</p>
            {s.recording_tips.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-ink-soft">{s.recording_tips.map((t) => <li key={t}>🎬 {t}</li>)}</ul>
            )}
          </ResultCard>
        );
      }
      case "caption": return (result as CaptionResult).captions.map((c) => (
        <ResultCard key={c.label} title={c.label} actions={<><CopyButton text={c.text} />{libraryBtn("legenda", `Legenda · ${topic.slice(0, 60)}`, c.text)}</>}>
          <p className="whitespace-pre-wrap">{c.text}</p>
        </ResultCard>
      ));
      case "hooks": return (result as HookResult).hooks.map((h, i) => (
        <ResultCard key={i} title={`“${h.text}”`} badge={labelOf(HOOK_CATEGORIES, h.category)}
          actions={<><CopyButton text={h.text} />{libraryBtn("gancho", h.text, h.text, [h.category])}</>}>
          <p className="text-ink-soft">{h.why_it_works}</p>
        </ResultCard>
      ));
      case "cta": return (result as CtaResult).ctas.map((c, i) => (
        <ResultCard key={i} title={c.text} badge={labelOf(CTA_GOALS, c.goal)} actions={<><CopyButton text={c.text} />{libraryBtn("cta", c.text, c.text, [c.goal])}</>} />
      ));
      case "hashtags": {
        const h = result as HashtagResult;
        const all = h.groups.flatMap((g) => g.hashtags).join(" ");
        return (
          <>
            {h.groups.map((g) => (
              <ResultCard key={g.label} title={g.label} actions={<CopyButton text={g.hashtags.join(" ")} />}>
                <div className="flex flex-wrap gap-1.5">{g.hashtags.map((t) => <span key={t} className="rounded-lg bg-brand-50 px-2 py-1 text-[13px] font-semibold text-brand-700">{t}</span>)}</div>
              </ResultCard>
            ))}
            <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
              <p className="text-sm text-ink-soft">{h.notes}</p>
              <div className="flex gap-1"><CopyButton text={all} />{libraryBtn("hashtags", `Hashtags · ${topic.slice(0, 60)}`, all)}</div>
            </Card>
          </>
        );
      }
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-5">{form}</Card>
      <div className="min-w-0 space-y-3">
        {error?.needsUpgrade && <UpgradeCard compact message={error.message} />}
        {loading ? (
          <Card className="grid min-h-[320px] place-items-center">
            <div className="text-center"><Spinner className="mx-auto h-7 w-7" /><p className="mt-3 text-sm font-semibold">Escrevendo com o tom do seu projeto…</p></div>
          </Card>
        ) : result ? renderResult() : (
          <Card className="grid min-h-[320px] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-glow">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-4 font-bold">Pronto para criar</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                A IA usa a memória do projeto <strong>{project?.name}</strong> — tom de voz, público e palavras a evitar.
              </p>
            </div>
          </Card>
        )}
      </div>
      <PostEditorModal open={scheduling !== null} initial={scheduling} onClose={() => setScheduling(null)} />
    </div>
  );
}

function ResultCard({ title, badge, actions, children }: { title: string; badge?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="animate-fade-in p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2 font-semibold leading-snug"><MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />{title}</p>
        {badge && <Badge>{badge}</Badge>}
      </div>
      {children && <div className="mt-2 pl-6 text-sm leading-relaxed">{children}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-1 pl-5">{actions}</div>}
    </Card>
  );
}
