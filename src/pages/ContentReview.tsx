import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, ClipboardPaste, Copy, FileText, ImagePlus, Lightbulb, Link2, ScanSearch,
  Sparkles, Target, TriangleAlert, Users, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { UpgradeCard } from "@/components/UpgradeGate";
import { VoiceInput, VoiceTextarea } from "@/components/Voice";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError, generate, type ContentReviewResult, type ReviewCriterion } from "@/lib/ai";
import { FORMATS, GOALS, platformLabel } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { cn, copyText, fmtDate } from "@/lib/utils";
import type { ContentIdea } from "@/types";

interface Preview {
  url: string; platform: string; format: string; title: string; caption: string; author: string; thumbnail: string;
  metrics?: { likes?: number; comments?: number }; limited: boolean;
}
interface AnalysisRow {
  id: string; url: string | null; platform: string | null; title: string; thumbnail_url: string | null; audience: string;
  input: Record<string, unknown>; result: ContentReviewResult; overall_score: number | null; created_at: string;
}

const CRITERIA: Record<ReviewCriterion, string> = {
  gancho: "Gancho", clareza: "Clareza", naturalidade: "Naturalidade", valor_entregue: "Valor entregue",
  adequacao_ao_publico: "Fala com o público", cta: "Chamada para ação", legenda: "Legenda", capa_visual: "Capa / visual", hashtags: "Hashtags",
};
const METRICS = [
  ["views", "Visualizações"], ["reach", "Alcance"], ["likes", "Curtidas"], ["comments", "Comentários"], ["shares", "Compartilhamentos"], ["saves", "Salvamentos"],
] as const;

const scoreColor = (n: number) => (n >= 80 ? "#20B486" : n >= 60 ? "#7952D6" : n >= 40 ? "#E8A33D" : "#D93A4A");
const scoreLabel = (n: number) => (n >= 85 ? "Excelente" : n >= 70 ? "Bom" : n >= 50 ? "Pode melhorar" : "Precisa de ajustes");

/** Reduz a imagem para no máximo 1280px e devolve como data URL JPEG. */
async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function ScoreRing({ value, size = 132 }: { value: number; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const color = scoreColor(value);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.12)" strokeWidth={10} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">de 100</p>
      </div>
    </div>
  );
}

export default function ContentReview() {
  const { hasFeature, plan } = useWorkspace();
  if (plan && !hasFeature("ai_review")) return <UpgradeCard feature="ai_review" />;
  return <ReviewWorkspace />;
}

function ReviewWorkspace() {
  const { user } = useAuth();
  const { project, projectId, plan, refetchPlan } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const history = useProjectRows<AnalysisRow>("content_analyses", { limit: 20 });
  const ideas = useTableMutations<ContentIdea>("content_ideas");
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [stage, setStage] = useState<"start" | "form" | "report">("start");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audience, setAudience] = useState(project?.audience ?? "");
  const [goal, setGoal] = useState(project?.goals[0] ?? "");
  const [format, setFormat] = useState("reels");
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<{ result: ContentReviewResult; meta: Partial<AnalysisRow> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const limit = plan?.limits.tool_limits?.content_review;
  const used = plan?.tool_usage?.content_review ?? 0;

  const loadLink = async (raw = link) => {
    let url = raw.trim();
    if (!url) return toast.error("Cole o link do Reels, TikTok, Short ou post.");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/^http:\/\//i, "https://");
    setFetching(true);
    const { data, error } = await supabase.functions.invoke("link-preview", { body: { url } });
    setFetching(false);
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: { message?: string } } | null;
      return toast.error(body?.error?.message ?? "Não foi possível ler esse link.");
    }
    const p = data as Preview;
    setPreview(p);
    setCaption(p.caption || "");
    setFormat(FORMATS.some((f) => f.value === p.format) ? p.format : "reels");
    setMetrics({
      ...(p.metrics?.likes !== undefined ? { likes: String(p.metrics.likes) } : {}),
      ...(p.metrics?.comments !== undefined ? { comments: String(p.metrics.comments) } : {}),
    });
    setImage(null);
    setStage("form");
    if (p.limited) toast.message("A rede não mostrou a legenda publicamente. Cole o texto para uma análise completa.");
  };

  const manual = () => {
    setPreview(null);
    setCaption("");
    setMetrics({});
    setStage("form");
  };

  const analyze = async () => {
    if (!caption.trim() && !transcript.trim()) return toast.error("Cole a legenda ou o texto/fala do conteúdo.");
    setAnalyzing(true);
    try {
      const input = {
        url: preview?.url, platform: preview ? platformLabel(preview.platform) : "", format, title: preview?.title ?? "",
        caption, transcript, audience, goal,
        metrics: Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])),
        thumbnail: image ? "" : preview?.thumbnail ?? "", image: image ?? undefined,
      };
      const res = await generate<ContentReviewResult>("content_review", projectId, input);
      const title = (preview?.title || caption || transcript).replace(/\s+/g, " ").slice(0, 120) || "Análise de conteúdo";
      const meta = { url: preview?.url ?? null, platform: preview?.platform ?? null, title, thumbnail_url: preview?.thumbnail || null, audience };
      setReport({ result: res.data, meta });
      setStage("report");
      refetchPlan();
      const { image: _omit, ...stored } = input;
      void _omit;
      await supabase.from("content_analyses").insert({
        user_id: user!.id, project_id: projectId, ...meta, input: stored, result: res.data,
        overall_score: Math.max(0, Math.min(100, Math.round(res.data.overall_score))),
      });
      qc.invalidateQueries({ queryKey: ["rows", "content_analyses"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("unknown", "Não foi possível analisar.");
      toast.error(err.message, err.needsUpgrade ? { action: { label: "Ver planos", onClick: () => navigate("/precos") } } : undefined);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {stage !== "report" && (
        <div className="relative overflow-hidden rounded-3xl bg-[#13102A] px-6 py-8 text-white sm:px-10">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-60 w-60 rounded-full bg-[#20B486]/25 blur-3xl" />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-200"><ScanSearch className="h-3.5 w-3.5" />Análise de conteúdo</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Cole o link. A IA te diz o que melhorar.</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-white/65">Reels, TikTok, Shorts ou post: o que já está bom, o que ajustar e versões mais naturais para o público que você quer atingir.</p>
            <div className="mt-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 pl-4 backdrop-blur focus-within:border-brand-300">
              <Link2 className="h-5 w-5 shrink-0 text-brand-200" />
              <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLink()} inputMode="url"
                placeholder="https://www.instagram.com/reel/…" aria-label="Link do conteúdo"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-white outline-none placeholder:text-white/40" />
              {"clipboard" in navigator && (
                <button onClick={async () => { try { const t = await navigator.clipboard.readText(); setLink(t); if (t) loadLink(t); } catch { toast.error("Permita colar ou cole manualmente."); } }}
                  className="hidden items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 sm:flex"><ClipboardPaste className="h-4 w-4" />Colar</button>
              )}
              <Button onClick={() => loadLink()} loading={fetching} icon={<ScanSearch className="h-4 w-4" />}>Analisar</Button>
            </div>
            <button onClick={manual} className="mt-3 text-xs font-semibold text-white/60 underline-offset-2 hover:text-white hover:underline">Sem link? Cole o texto do conteúdo</button>
            {limit ? <p className="mt-2 text-xs text-white/50">{Math.max(0, limit - used)} de {limit} análises grátis neste mês</p> : null}
          </div>
        </div>
      )}

      {stage === "form" && (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <Card className="h-fit overflow-hidden">
            {preview?.thumbnail && !image ? (
              <img src={preview.thumbnail} alt="Capa do conteúdo" referrerPolicy="no-referrer" className="aspect-[4/5] w-full bg-canvas object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : image ? (
              <img src={image} alt="Capa enviada" className="aspect-[4/5] w-full bg-canvas object-cover" />
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center bg-gradient-to-br from-brand-50 to-canvas text-brand-300"><ImagePlus className="h-10 w-10" /></div>
            )}
            <div className="space-y-2 p-4">
              {preview ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5"><Badge>{platformLabel(preview.platform)}</Badge>{preview.author && <span className="text-xs font-semibold text-ink-soft">@{preview.author.replace(/^@/, "")}</span>}</div>
                  {preview.title && <p className="line-clamp-3 text-sm font-semibold">{preview.title}</p>}
                  <a href={preview.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-600 hover:underline">{preview.url}</a>
                </>
              ) : <p className="text-sm text-ink-soft">Análise sem link: cole o texto ao lado.</p>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try { setImage(await fileToDataUrl(f)); } catch { toast.error("Não foi possível ler a imagem."); }
              }} />
              <div className="flex gap-1.5 pt-1">
                <Button size="sm" variant="secondary" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>{image ? "Trocar capa/print" : "Enviar capa ou print"}</Button>
                {image && <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setImage(null)}>Remover</Button>}
              </div>
              <p className="text-[11px] text-ink-faint">A IA avalia a capa (miniatura ou o print que você enviar). Áudio e cenas do vídeo não são acessíveis pelas redes.</p>
            </div>
          </Card>

          <Card className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">O que vamos analisar</h2>
              <Button size="sm" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStage("start")}>Outro link</Button>
            </div>
            <Field label="Legenda" hint={preview?.limited ? "A rede não mostrou a legenda publicamente — cole aqui." : "Puxamos do link quando disponível. Ajuste se precisar."}>
              <VoiceTextarea rows={5} value={caption} onValueChange={setCaption} placeholder="Cole a legenda do post…" />
            </Field>
            <Field label="O que é falado no vídeo (ou texto dos slides)" hint="Opcional, mas faz muita diferença: cole o roteiro ou toque no microfone e fale o que diz no vídeo.">
              <VoiceTextarea rows={5} value={transcript} onValueChange={setTranscript} placeholder="Ex.: “Você não gasta muito. Você gasta sem ver…”" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Público que você quer atingir">
                <VoiceInput value={audience} onValueChange={setAudience} placeholder="Ex.: mulheres 25-40 começando a investir" />
              </Field>
              <Field label="Formato">
                <div className="flex flex-wrap gap-1.5">
                  {FORMATS.filter((f) => ["reels", "carrossel", "post", "stories", "shorts", "video_longo"].includes(f.value)).map((f) => (
                    <button key={f.value} type="button" onClick={() => setFormat(f.value)} className={cn("chip", format === f.value && "chip-active")}>{f.label}</button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Objetivo do conteúdo">
              <div className="flex flex-wrap gap-1.5">
                {GOALS.map((g) => <button key={g} type="button" onClick={() => setGoal(goal === g ? "" : g)} className={cn("chip", goal === g && "chip-active")}>{g}</button>)}
              </div>
            </Field>
            <details className="group rounded-2xl border border-line p-4" open={Object.keys(metrics).length > 0}>
              <summary className="cursor-pointer list-none text-sm font-bold">Métricas (opcional) <span className="font-normal text-ink-soft">— a IA interpreta os números reais</span></summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {METRICS.map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Input type="number" min={0} inputMode="numeric" value={metrics[k] ?? ""} onChange={(e) => setMetrics((m) => ({ ...m, [k]: e.target.value }))} placeholder="—" />
                  </Field>
                ))}
              </div>
            </details>
            <Button size="lg" className="w-full" icon={<Wand2 className="h-4 w-4" />} loading={analyzing} onClick={analyze}>
              {analyzing ? "Analisando o conteúdo…" : "Analisar com IA"}
            </Button>
          </Card>
        </div>
      )}

      {stage === "report" && report && (
        <Report report={report} onBack={() => { setStage("start"); setReport(null); setLink(""); }}
          onIdea={async (title, why) => { await ideas.create.mutateAsync({ title, description: why, source: "ai", niche: project?.niche ?? "" }); toast.success("Ideia salva no banco"); }} />
      )}

      {stage === "start" && (
        <div>
          <h2 className="mb-3 text-sm font-bold">Análises anteriores</h2>
          {(history.data ?? []).length === 0 ? (
            <Card><EmptyState icon={<ScanSearch className="h-6 w-6" />} title="Nenhuma análise ainda" description="Cole o link de um Reels ou post seu (ou de referência) para receber o diagnóstico." /></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {history.data!.map((a) => (
                <button key={a.id} onClick={() => { setReport({ result: a.result, meta: a }); setStage("report"); }}
                  className="card flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-pop">
                  {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" referrerPolicy="no-referrer" className="h-16 w-14 shrink-0 rounded-xl bg-canvas object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    : <div className="grid h-16 w-14 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-400"><FileText className="h-5 w-5" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{a.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{a.platform ? platformLabel(a.platform) : "Texto"} · {fmtDate(a.created_at)}</p>
                  </div>
                  {a.overall_score !== null && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: scoreColor(a.overall_score) }}>{a.overall_score}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  return <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await copyText(text); toast.success("Copiado"); }}>Copiar</Button>;
}

function Report({ report, onBack, onIdea }: {
  report: { result: ContentReviewResult; meta: Partial<AnalysisRow> }; onBack: () => void; onIdea: (title: string, why: string) => void;
}) {
  const r = report.result;
  const navigate = useNavigate();
  const overall = Math.max(0, Math.min(100, Math.round(r.overall_score)));
  const scores = useMemo(() => [...r.scores].sort((a, b) => b.score - a.score), [r.scores]);
  const toStudio = (tema: string) => navigate(`/estudio?ferramenta=script&tema=${encodeURIComponent(tema)}&auto=1`);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>Nova análise</Button>

      <div className="relative overflow-hidden rounded-3xl bg-[#13102A] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full blur-3xl" style={{ background: `${scoreColor(overall)}55` }} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing value={overall} />
          <div className="min-w-0 flex-1">
            <Badge className="bg-white/15" color="#fff" bg="rgba(255,255,255,.15)">{scoreLabel(overall)}</Badge>
            <h1 className="mt-2 line-clamp-2 text-xl font-extrabold sm:text-2xl">{report.meta.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{r.summary}</p>
            {report.meta.url && <a href={report.meta.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-200 hover:underline">{report.meta.url}</a>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Target className="h-4 w-4 text-brand-500" />Nota por critério</h2>
            <div className="mt-4 space-y-3.5">
              {scores.map((s) => (
                <div key={s.criterion}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{CRITERIA[s.criterion] ?? s.criterion}</span>
                    <span className="font-bold" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, s.score)}%`, background: scoreColor(s.score) }} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.comment}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4 text-positive" />O que já está bom</h2>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {r.strengths.map((s) => (
                <div key={s.title} className="rounded-xl border border-positive/20 bg-positive-soft/60 p-3.5">
                  <p className="text-sm font-bold text-[#127757]">{s.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{s.detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-[#E8A33D]" />O que melhorar</h2>
            <div className="mt-3 space-y-3">
              {r.improvements.map((m, i) => (
                <div key={m.title} className="rounded-2xl border border-line p-4">
                  <p className="flex items-start gap-2 font-bold"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FDF5E7] text-xs text-[#9A6213]">{i + 1}</span>{m.title}</p>
                  <p className="mt-2 text-sm text-ink-soft"><strong className="text-ink">Problema:</strong> {m.problem}</p>
                  <p className="mt-1 text-sm text-ink-soft"><strong className="text-ink">Como ajustar:</strong> {m.suggestion}</p>
                  {m.example && <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">✍️ {m.example}</p>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Wand2 className="h-4 w-4 text-brand-500" />Versões mais naturais para o seu público</h2>
            <p className="mt-0.5 text-xs text-ink-soft">Público: {report.meta.audience || "o do projeto"}</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Ganchos alternativos</p>
                <div className="mt-2 space-y-1.5">
                  {r.rewrites.hooks.map((h) => (
                    <div key={h} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
                      <p className="flex-1 text-sm font-semibold">“{h}”</p>
                      <CopyBtn text={h} />
                      <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => toStudio(`${report.meta.title} — abrir com: "${h}"`)}>Roteiro</Button>
                    </div>
                  ))}
                </div>
              </div>
              {r.rewrites.opening_script && (
                <div>
                  <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Abertura do vídeo (primeiros segundos)</p><CopyBtn text={r.rewrites.opening_script} /></div>
                  <p className="prose-script mt-1.5 rounded-xl bg-canvas p-4 text-sm">{r.rewrites.opening_script}</p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Legenda reescrita</p><CopyBtn text={`${r.rewrites.caption}\n\n${r.rewrites.hashtags.join(" ")}`} /></div>
                <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-canvas p-4 text-sm leading-relaxed">{r.rewrites.caption}</p>
                <p className="mt-2 text-sm font-semibold text-brand-600">{r.rewrites.hashtags.join(" ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
                <p className="flex-1 text-sm"><strong>CTA:</strong> {r.rewrites.cta}</p><CopyBtn text={r.rewrites.cta} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-brand-500" />Público</h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full text-lg font-extrabold text-white" style={{ background: scoreColor(r.audience_fit.score) }}>{r.audience_fit.score}</span>
              <p className="text-sm text-ink-soft">{r.audience_fit.analysis}</p>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <p className="rounded-xl bg-canvas p-3"><strong>Fala hoje com:</strong> {r.audience_fit.who_it_reaches}</p>
              <p className="rounded-xl bg-brand-50 p-3 text-brand-800"><strong>Deveria falar com:</strong> {r.audience_fit.who_it_should_reach}</p>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Para soar mais natural</h2>
            <ul className="mt-2 space-y-2 text-sm">{r.natural_language_tips.map((t) => <li key={t} className="flex gap-2"><span>💬</span><span>{t}</span></li>)}</ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Leitura das métricas</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.metrics_reading}</p>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Lightbulb className="h-4 w-4 text-brand-500" />Próximos conteúdos</h2>
            <div className="mt-3 space-y-2">
              {r.next_content_ideas.map((n) => (
                <div key={n.title} className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{n.why}</p>
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="soft" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => toStudio(n.title)}>Roteiro</Button>
                    <Button size="sm" variant="ghost" icon={<Lightbulb className="h-3.5 w-3.5" />} onClick={() => onIdea(n.title, n.why)}>Salvar</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {r.data_caveats && <p className="flex gap-2 px-1 text-xs text-ink-soft"><TriangleAlert className="h-4 w-4 shrink-0 text-[#E8A33D]" />{r.data_caveats}</p>}
        </div>
      </div>
    </div>
  );
}
