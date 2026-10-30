import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, BookmarkPlus, CalendarPlus, Check, Copy, FileText, Hash, Lightbulb, Megaphone, RefreshCw,
  Shuffle, SlidersHorizontal, Sparkles, Type, Volume2, VolumeX, Wand2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/misc";
import { UpgradeCard } from "@/components/UpgradeGate";
import { ListeningBar, MicButton, useVoiceAppend } from "@/components/Voice";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  AiError, generate, type AiTool, type CaptionResult, type CtaResult, type HashtagResult, type HookResult,
  type IdeaResult, type ScriptResult,
} from "@/lib/ai";
import { PLATFORMS, TONES } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { speak } from "@/lib/speech";
import { topicSuggestions } from "@/lib/suggestions";
import { cn, copyText } from "@/lib/utils";
import type { ContentIdea, LibraryItem, LibraryKind, Script } from "@/types";

type ModuleId = "script" | "ideas" | "caption" | "hooks" | "cta" | "hashtags";

const MODULES: { id: ModuleId; label: string; short: string; icon: typeof Lightbulb; feature: string; placeholder: string; cta: string }[] = [
  { id: "script", label: "Roteiro", short: "Roteiros falados de 15 a 90s", icon: FileText, feature: "ai_scripts", placeholder: "Sobre o que é o vídeo? Fale ou digite…", cta: "Criar roteiro" },
  { id: "ideas", label: "Ideias", short: "Reels, carrosséis, Stories", icon: Lightbulb, feature: "ai_ideas", placeholder: "Um assunto e eu trago ideias prontas…", cta: "Gerar ideias" },
  { id: "caption", label: "Legenda", short: "3 versões no seu tom", icon: Type, feature: "ai_captions", placeholder: "Do que o post fala?", cta: "Criar legendas" },
  { id: "hooks", label: "Ganchos", short: "Aberturas que prendem", icon: Zap, feature: "ai_hooks", placeholder: "Tema do conteúdo…", cta: "Criar ganchos" },
  { id: "cta", label: "CTA", short: "Chamadas para ação", icon: Megaphone, feature: "ai_cta", placeholder: "O que você quer que a pessoa faça?", cta: "Criar CTAs" },
  { id: "hashtags", label: "Hashtags", short: "Relevantes ao tema", icon: Hash, feature: "ai_hashtags", placeholder: "Tema do post…", cta: "Sugerir hashtags" },
];

const IDEA_TYPES: Record<string, string> = {
  reels: "Reels", carrossel: "Carrossel", stories: "Stories", video: "Vídeo", educativo: "Educativo",
  autoridade: "Autoridade", viral_potencial: "Potencial de alcance",
};
const SCRIPT_TYPES = [
  { value: "camera", label: "Falando p/ câmera" }, { value: "reels_narrado", label: "Narrado" }, { value: "react", label: "React" },
  { value: "tiktok", label: "TikTok" }, { value: "shorts", label: "Shorts" }, { value: "educativo", label: "Educativo" },
  { value: "motivacional", label: "Motivacional" }, { value: "vendas", label: "Vendas" },
] as const;
const DURATIONS = ["15", "30", "45", "60", "90"];
const HOOK_CATEGORIES = [
  { value: "curiosidade", label: "Curiosidade" }, { value: "polemica_construtiva", label: "Polêmica construtiva" },
  { value: "identificacao", label: "Identificação" }, { value: "historia_pessoal", label: "História pessoal" },
  { value: "pergunta", label: "Pergunta" }, { value: "erro_comum", label: "Erro comum" },
  { value: "conselho", label: "Conselho" }, { value: "quebra_de_crenca", label: "Quebra de crença" },
] as const;
const CTA_GOALS = [
  { value: "seguir", label: "Seguir" }, { value: "comentar", label: "Comentar" }, { value: "compartilhar", label: "Compartilhar" },
  { value: "salvar", label: "Salvar" }, { value: "clicar_link", label: "Link" }, { value: "comprar", label: "Comprar" },
  { value: "mensagem", label: "Mensagem" },
] as const;
const LOADING_TIPS = [
  "Lendo a memória do seu projeto…", "Evitando temas que você já publicou…", "Escrevendo como gente fala com gente…",
  "Testando ganchos que prendem nos 3 primeiros segundos…", "Ajustando ao tom da sua marca…",
];
const labelOf = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

export default function Studio() {
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState<ModuleId>("script");
  // Pedido vindo da URL (Dashboard, "Virar roteiro"…): abre a ferramenta e já gera.
  const [launch, setLaunch] = useState<{ tema: string; auto: boolean; nonce: number }>({ tema: "", auto: false, nonce: 0 });
  useEffect(() => {
    if (!params.has("ferramenta") && !params.has("tema")) return;
    const tool = params.get("ferramenta") as ModuleId | null;
    if (tool && MODULES.some((m) => m.id === tool)) setActive(tool);
    setLaunch((l) => ({ tema: params.get("tema") ?? "", auto: params.get("auto") === "1", nonce: l.nonce + 1 }));
    setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#13102A] px-6 py-8 text-white sm:px-10">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-[#20B486]/25 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-200"><Sparkles className="h-3.5 w-3.5" /> Estúdio de IA</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">O que vamos criar hoje?</h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/65">Fale ou digite um assunto. A IA escreve no tom do seu projeto e evita o que você já publicou.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <button key={m.id} onClick={() => { setActive(m.id); setLaunch((l) => ({ tema: "", auto: false, nonce: l.nonce })); }}
                className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                  active === m.id ? "bg-white text-[#13102A] shadow-[0_8px_30px_-6px_rgba(151,117,222,.8)]" : "bg-white/10 text-white/75 hover:bg-white/15 hover:text-white")}>
                <m.icon className="h-4 w-4" />{m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ModuleView key={`${active}-${launch.nonce}`} id={active} seedTopic={launch.tema} autoRun={launch.auto} />
    </div>
  );
}

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

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="ghost" icon={done ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
      onClick={async () => { await copyText(text); setDone(true); toast.success("Copiado!"); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copiado" : label}
    </Button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
        active ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300 hover:text-brand-700")}>
      {children}
    </button>
  );
}

function ModuleView({ id, seedTopic, autoRun }: { id: ModuleId; seedTopic: string; autoRun: boolean }) {
  const mod = MODULES.find((m) => m.id === id)!;
  const { project, hasFeature, plan, refetchPlan } = useWorkspace();
  const savers = useSavers();
  const navigate = useNavigate();
  const savedIdeas = useProjectRows<ContentIdea>("content_ideas", { limit: 8 });
  const [topic, setTopic] = useState(seedTopic);
  const [platform, setPlatform] = useState(project?.platforms[0] ?? "instagram");
  const [tone, setTone] = useState("natural");
  const [type, setType] = useState("camera");
  const [duration, setDuration] = useState("30");
  const [quantity, setQuantity] = useState("10");
  const [categories, setCategories] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState(0);
  const [error, setError] = useState<AiError | null>(null);
  const [scheduling, setScheduling] = useState<PostDraft | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const dictation = useVoiceAppend(topic, setTopic);
  const ran = useRef(false);

  const suggestions = useMemo(() => topicSuggestions(project?.niche ?? "", seed), [project?.niche, seed]);
  const allowed = hasFeature(mod.feature);
  const toolLimit = plan?.limits.tool_limits?.[id === "script" ? "script" : id];
  const toolUsed = plan?.tool_usage?.[id] ?? 0;

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setTip((i) => (i + 1) % LOADING_TIPS.length), 2200);
    return () => clearInterval(t);
  }, [loading]);

  const run = async (override?: string) => {
    const subject = (override ?? topic).trim();
    if (!subject) return toast.error("Fale ou digite um assunto primeiro.");
    if (override) setTopic(override);
    dictation.stop();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await generate<unknown>(id as AiTool, project!.id, {
        topic: subject, platform: labelOf(PLATFORMS, platform), tone: labelOf(TONES, tone), type, duration: Number(duration),
        quantity: Number(quantity), niche: project?.niche ?? "", categories, goals,
      });
      setResult(res.data);
      refetchPlan();
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("unknown", "Erro ao gerar.");
      setError(err);
      if (!err.needsUpgrade) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun && seedTopic && allowed && project && !ran.current) {
      ran.current = true;
      run(seedTopic);
    }
  }, [autoRun, seedTopic, allowed, project]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return <UpgradeCard feature={mod.feature} />;

  const libraryBtn = (kind: LibraryKind, title: string, content: string, tags?: string[]) => savers.canLibrary && (
    <Button size="sm" variant="ghost" icon={<BookmarkPlus className="h-3.5 w-3.5" />} onClick={() => savers.toLibrary(kind, title, content, tags)}>Biblioteca</Button>
  );

  const options: ReactNode = (
    <div className="grid gap-4 border-t border-line/70 px-5 py-4 sm:grid-cols-2">
      {["script", "caption", "cta", "hashtags"].includes(id) && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Plataforma</p>
          <div className="flex flex-wrap gap-1.5">{PLATFORMS.slice(0, 6).map((p) => <Pill key={p.value} active={platform === p.value} onClick={() => setPlatform(p.value)}>{p.label}</Pill>)}</div>
        </div>
      )}
      {id === "script" && (
        <>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Duração</p>
            <div className="flex flex-wrap gap-1.5">{DURATIONS.map((d) => <Pill key={d} active={duration === d} onClick={() => setDuration(d)}>{d}s</Pill>)}</div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Estilo</p>
            <div className="flex flex-wrap gap-1.5">{SCRIPT_TYPES.map((t) => <Pill key={t.value} active={type === t.value} onClick={() => setType(t.value)}>{t.label}</Pill>)}</div>
          </div>
        </>
      )}
      {id === "caption" && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Tom</p>
          <div className="flex flex-wrap gap-1.5">{TONES.map((t) => <Pill key={t.value} active={tone === t.value} onClick={() => setTone(t.value)}>{t.label}</Pill>)}</div>
        </div>
      )}
      {id === "ideas" && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Quantidade</p>
          <div className="flex gap-1.5">{["5", "10", "15"].map((q) => <Pill key={q} active={quantity === q} onClick={() => setQuantity(q)}>{q} ideias</Pill>)}</div>
        </div>
      )}
      {id === "hooks" && (
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Categorias (vazio = todas)</p>
          <div className="flex flex-wrap gap-1.5">{HOOK_CATEGORIES.map((c) => <Pill key={c.value} active={categories.includes(c.value)} onClick={() => setCategories((v) => v.includes(c.value) ? v.filter((x) => x !== c.value) : [...v, c.value])}>{c.label}</Pill>)}</div>
        </div>
      )}
      {id === "cta" && (
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Objetivos (vazio = todos)</p>
          <div className="flex flex-wrap gap-1.5">{CTA_GOALS.map((c) => <Pill key={c.value} active={goals.includes(c.value)} onClick={() => setGoals((v) => v.includes(c.value) ? v.filter((x) => x !== c.value) : [...v, c.value])}>{c.label}</Pill>)}</div>
        </div>
      )}
    </div>
  );

  const summary = [
    ["script", "caption", "cta", "hashtags"].includes(id) && labelOf(PLATFORMS, platform),
    id === "script" && `${duration}s`, id === "script" && labelOf(SCRIPT_TYPES, type),
    id === "caption" && labelOf(TONES, tone), id === "ideas" && `${quantity} ideias`,
  ].filter(Boolean).join(" · ");

  const renderResult = () => {
    if (!result) return null;
    switch (id) {
      case "ideas": return (result as { ideas: IdeaResult[] }).ideas.map((i) => (
        <ResultCard key={i.title} title={i.title} badge={IDEA_TYPES[i.type] ?? i.type}
          actions={<>
            <Button size="sm" variant="soft" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => navigate(`/estudio?ferramenta=script&tema=${encodeURIComponent(i.title)}&auto=1`)}>Virar roteiro</Button>
            <Button size="sm" variant="ghost" icon={<Lightbulb className="h-3.5 w-3.5" />} onClick={() => savers.toIdea({
              title: i.title, description: i.approach, notes: `Público: ${i.audience}\nObjetivo: ${i.objective}`, format: i.type,
            })}>Salvar</Button>
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
          <Card className="overflow-hidden">
            <div className="relative bg-gradient-to-br from-brand-600 to-[#2A1A5C] px-6 py-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-200">Roteiro · ~{s.estimated_seconds}s</p>
                  <h3 className="mt-1 text-xl font-extrabold">{s.title}</h3>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" icon={speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
                      if (speak(s.full_script.replace(/\[[^\]]*\]/g, ""), () => setSpeaking(false))) setSpeaking(true);
                      else toast.error("Seu navegador não suporta leitura em voz alta.");
                    }}>{speaking ? "Parar" : "Ouvir"}</Button>
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-white/10 px-4 py-3 text-[15px] font-semibold leading-snug">🎯 “{s.hook}”</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              {[["Desenvolvimento", s.development], ["Mensagem central", s.core_message], ["Fechamento + CTA", `${s.conclusion}\n\n${s.cta}`]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-canvas p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{k}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{v}</p>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Texto para gravar</p>
              <p className="prose-script mt-1.5 rounded-2xl border border-line bg-white p-5">{s.full_script}</p>
              {s.recording_tips.length > 0 && <ul className="mt-3 grid gap-1.5 text-sm text-ink-soft sm:grid-cols-2">{s.recording_tips.map((t) => <li key={t}>🎬 {t}</li>)}</ul>}
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
              <Button size="sm" icon={<FileText className="h-3.5 w-3.5" />} onClick={async () => {
                const [saved] = await savers.toScript({
                  title: s.title, content: s.full_script, duration_seconds: Number(duration), platform, format: type,
                  notes: s.recording_tips.map((t) => `• ${t}`).join("\n"),
                });
                toast.success("Roteiro salvo!", { action: { label: "Abrir", onClick: () => navigate(`/roteiros/${saved!.id}`) } });
              }}>Salvar em Meus Roteiros</Button>
              <Button size="sm" variant="soft" icon={<CalendarPlus className="h-3.5 w-3.5" />}
                onClick={() => setScheduling({ ...emptyPost(undefined, platform), title: s.title, hook: s.hook, script_outline: s.full_script, cta: s.cta, status: "roteiro_pronto" })}>Agendar</Button>
              <CopyButton text={s.full_script} />
              {libraryBtn("roteiro", s.title, s.full_script)}
            </div>
          </Card>
        );
      }
      case "caption": return (result as CaptionResult).captions.map((c) => (
        <ResultCard key={c.label} title={c.label} actions={<><CopyButton text={c.text} />{libraryBtn("legenda", `Legenda · ${topic.slice(0, 60)}`, c.text)}</>}>
          <p className="whitespace-pre-wrap">{c.text}</p>
        </ResultCard>
      ));
      case "hooks": return (result as HookResult).hooks.map((h, i) => (
        <ResultCard key={i} title={`“${h.text}”`} badge={labelOf(HOOK_CATEGORIES, h.category)}
          actions={<>
            <CopyButton text={h.text} />
            <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => navigate(`/estudio?ferramenta=script&tema=${encodeURIComponent(`${topic} — abrir com: "${h.text}"`)}&auto=1`)}>Roteiro com este gancho</Button>
            {libraryBtn("gancho", h.text, h.text, [h.category])}
          </>}>
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
              <div className="flex gap-1"><CopyButton text={all} label="Copiar todas" />{libraryBtn("hashtags", `Hashtags · ${topic.slice(0, 60)}`, all)}</div>
            </Card>
          </>
        );
      }
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="glow-border rounded-3xl">
          <div className="rounded-3xl bg-white">
            <div className="flex items-start gap-3 p-5 pb-3">
              <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-glow"><mod.icon className="h-5 w-5" /></span>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} placeholder={mod.placeholder} aria-label="Assunto"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
                className="min-h-[84px] flex-1 resize-none bg-transparent text-lg font-medium leading-relaxed text-ink outline-none placeholder:text-ink-faint" />
            </div>
            {dictation.listening && <div className="px-5"><ListeningBar interim={dictation.interim} /></div>}
            <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-1">
              {dictation.supported && <MicButton size="lg" listening={dictation.listening} onClick={dictation.toggle} />}
              <button onClick={() => setShowOptions((o) => !o)}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink-soft transition hover:border-brand-300 hover:text-brand-700">
                <SlidersHorizontal className="h-3.5 w-3.5" />{summary || "Ajustes"}
              </button>
              {toolLimit ? <span className="text-xs font-semibold text-ink-soft">{Math.max(0, toolLimit - toolUsed)} de {toolLimit} grátis este mês</span> : null}
              <Button size="lg" className="ml-auto" icon={<Wand2 className="h-4 w-4" />} loading={loading} onClick={() => run()}>{mod.cta}</Button>
            </div>
            {showOptions && options}
          </div>
        </div>

        {error?.needsUpgrade && <UpgradeCard compact message={error.message} />}

        {loading ? (
          <Card className="grid min-h-[300px] place-items-center p-8">
            <div className="text-center">
              <div className="orb mx-auto h-20 w-20 rounded-full" />
              <p className="mt-6 font-bold">Criando com IA</p>
              <p key={tip} className="mt-1 animate-fade-in text-sm text-ink-soft">{LOADING_TIPS[tip]}</p>
            </div>
          </Card>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Resultado</p>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => run()}>Gerar outra versão</Button>
            </div>
            <div className="stagger space-y-3">{renderResult()}</div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Temas para você</p>
            <button onClick={() => setSeed((s) => s + 7)} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"><Shuffle className="h-3.5 w-3.5" />Outros</button>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">Toque para criar na hora — sem digitar.</p>
          <div className="mt-3 space-y-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => run(s)} disabled={loading}
                className="group flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-medium transition hover:border-brand-300 hover:bg-brand-50/60 disabled:opacity-50">
                <span className="flex-1">{s}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </button>
            ))}
          </div>
        </Card>
        {(savedIdeas.data?.length ?? 0) > 0 && (
          <Card className="p-5">
            <p className="text-sm font-bold">Do seu banco de ideias</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {savedIdeas.data!.map((i) => (
                <button key={i.id} onClick={() => run(i.title)} disabled={loading}
                  className="rounded-full bg-canvas px-3 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-brand-50 hover:text-brand-700">
                  💡 {i.title}
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card className="p-5 text-xs text-ink-soft">
          <p className="flex items-center gap-1.5 font-bold text-ink"><Sparkles className="h-3.5 w-3.5 text-brand-500" />Dica</p>
          <p className="mt-1">Use <kbd className="rounded border border-line px-1">Ctrl</kbd>+<kbd className="rounded border border-line px-1">Enter</kbd> para gerar. A IA usa a memória de <strong className="text-ink">{project?.name}</strong>.</p>
          {plan?.limits.tool_limits?.script && id === "script" && <Badge className="mt-2">Plano gratuito: {plan.limits.tool_limits.script} roteiros/mês</Badge>}
        </Card>
      </div>
      <PostEditorModal open={scheduling !== null} initial={scheduling} onClose={() => setScheduling(null)} />
    </div>
  );
}

function ResultCard({ title, badge, actions, children }: { title: string; badge?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="p-4 transition hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold leading-snug">{title}</p>
        {badge && <Badge>{badge}</Badge>}
      </div>
      {children && <div className="mt-2 text-sm leading-relaxed">{children}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">{actions}</div>}
    </Card>
  );
}
