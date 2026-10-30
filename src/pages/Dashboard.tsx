import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, eachDayOfInterval, startOfWeek, subDays } from "date-fns";
import {
  ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, Clock, Eye, FileText, Heart, Lightbulb,
  Plus, RefreshCw, Sparkles, Target, Wand2,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, Dot, EmptyState, ProgressBar, Skeleton, Tabs } from "@/components/ui/misc";
import { UpgradeCard } from "@/components/UpgradeGate";
import { QuickCreate } from "@/components/QuickCreate";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError, generate, type SuggestionsResult } from "@/lib/ai";
import { formatLabel, pillarMeta, platformColor, platformLabel, STAGES, statusMeta } from "@/lib/constants";
import { useTableMutations } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { cn, fmtDate, fmtNumber, toISODate } from "@/lib/utils";
import type { AnalyticsRecord, CalendarPost, ContentIdea, ProductionTask } from "@/types";

type Range = "7" | "15" | "30";

function useDashboardData(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const since = toISODate(subDays(new Date(), 30));
      const [posts, scripts, tasks, analytics] = await Promise.all([
        supabase.from("calendar_posts").select("*").eq("project_id", projectId),
        supabase.from("scripts").select("id, created_at").eq("project_id", projectId),
        supabase.from("production_tasks").select("*").eq("project_id", projectId).is("completed_at", null)
          .order("due_date", { ascending: true, nullsFirst: false }).limit(50),
        supabase.from("analytics").select("views, reach, likes, comments, shares, saves, engagement_rate, published_on").eq("project_id", projectId),
      ]);
      for (const r of [posts, scripts, tasks, analytics]) if (r.error) throw r.error;
      return {
        posts: posts.data as CalendarPost[],
        scripts: scripts.data as { id: string; created_at: string }[],
        tasks: tasks.data as ProductionTask[],
        analytics: analytics.data as Pick<AnalyticsRecord, "views" | "engagement_rate" | "published_on">[],
        since,
      };
    },
  });
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { project, projectId, hasFeature, plan } = useWorkspace();
  const trialDays = plan?.trial_ends_at ? Math.max(0, Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null;
  const { data, isLoading } = useDashboardData(projectId);
  const [range, setRange] = useState<Range>("7");
  const [editing, setEditing] = useState<PostDraft | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<AiError | null>(null);
  const ideas = useTableMutations<ContentIdea>("content_ideas");
  const navigate = useNavigate();

  const [today] = useState(() => toISODate(new Date()));
  const weekStart = useMemo(() => startOfWeek(new Date(`${today}T12:00:00`), { weekStartsOn: 1 }), [today]);

  const stats = useMemo(() => {
    if (!data) return null;
    const { posts, scripts, analytics } = data;
    const published = posts.filter((p) => p.status === "publicado");
    const planned = posts.filter((p) => p.status !== "publicado" && p.status !== "ideia");
    const pending = posts.filter((p) => p.status !== "publicado" && p.scheduled_date < today);
    const withEng = analytics.filter((a) => a.engagement_rate !== null);
    const publishedThisWeek = published.filter((p) => p.published_at && new Date(p.published_at) >= weekStart).length;
    return {
      planned: planned.length,
      published: published.length,
      pending: pending.length,
      scripts: scripts.length,
      views: analytics.reduce((s, a) => s + a.views, 0),
      engagement: withEng.length ? withEng.reduce((s, a) => s + Number(a.engagement_rate), 0) / withEng.length : null,
      analyticsCount: analytics.length,
      publishedThisWeek,
    };
  }, [data, today, weekStart]);

  const chart = useMemo(() => {
    if (!data) return [];
    const days = eachDayOfInterval({ start: subDays(new Date(), Number(range) - 1), end: new Date() });
    return days.map((d) => {
      const key = toISODate(d);
      return {
        label: fmtDate(d, "dd/MM"),
        Publicados: data.posts.filter((p) => p.published_at && toISODate(new Date(p.published_at)) === key).length,
        Planejados: data.posts.filter((p) => toISODate(new Date(p.created_at)) === key).length,
        Roteiros: data.scripts.filter((s) => toISODate(new Date(s.created_at)) === key).length,
      };
    });
  }, [data, range]);

  const upcoming = (data?.posts ?? [])
    .filter((p) => p.scheduled_date >= today && p.scheduled_date <= toISODate(addDays(new Date(), 14)) && p.status !== "publicado")
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time ?? "")).localeCompare(b.scheduled_date + (b.scheduled_time ?? "")))
    .slice(0, 6);

  const loadSuggestions = async () => {
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await generate<SuggestionsResult>("suggestions", projectId);
      setSuggestions(res.data);
    } catch (e) {
      setAiError(e instanceof AiError ? e : new AiError("unknown", "Não foi possível gerar sugestões."));
    } finally {
      setLoadingAi(false);
    }
  };

  const firstName = profile?.full_name?.split(" ")[0];
  const goal = profile?.weekly_goal ?? project?.posts_per_week ?? 3;
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";

  const cards = [
    { label: "Planejados", value: stats?.planned, icon: CalendarClock, color: "#7952D6", to: "/calendario" },
    { label: "Publicados", value: stats?.published, icon: CheckCircle2, color: "#20B486", to: "/calendario?view=lista&status=publicado" },
    { label: "Pendentes", value: stats?.pending, icon: Clock, color: "#E8743D", to: "/calendario?view=lista", hint: "Data passou e não foi publicado" },
    { label: "Roteiros criados", value: stats?.scripts, icon: FileText, color: "#4F7BE8", to: "/roteiros" },
    { label: "Visualizações registradas", value: stats ? fmtNumber(stats.views) : undefined, icon: Eye, color: "#2BA7C2", to: "/analytics",
      hint: stats && stats.analyticsCount === 0 ? "Nenhuma métrica registrada ainda" : undefined },
    { label: "Engajamento médio", value: stats ? (stats.engagement === null ? "—" : `${stats.engagement.toFixed(1)}%`) : undefined, icon: Heart, color: "#D6337A", to: "/analytics",
      hint: stats && stats.engagement === null ? "Registre alcance e interações" : undefined },
  ];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Dashboard</h1>
      {trialDays !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white px-5 py-3">
          <Sparkles className="h-5 w-5 text-brand-500" />
          <p className="flex-1 text-sm"><strong>Teste grátis do Pro:</strong> {trialDays === 0 ? "termina hoje" : `${trialDays} dia${trialDays === 1 ? "" : "s"} restante${trialDays === 1 ? "" : "s"}`}. Tudo liberado, incluindo planejamento de 30 dias.</p>
          <Link to="/precos"><Button size="sm">Ver planos</Button></Link>
        </div>
      )}
      <QuickCreate greeting={`${greeting}${firstName ? `, ${firstName}` : ""} 👋`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">Panorama de <strong className="text-ink">{project?.name}</strong></p>
        <Button icon={<Plus className="h-4 w-4" />} variant="secondary" onClick={() => setEditing({})} data-tour="create">Criar novo conteúdo</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Card className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white col-span-2 xl:col-span-1 xl:row-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><Target className="h-4 w-4" /> Meta semanal</div>
            {stats ? (
              <>
                <p className="mt-4 text-5xl font-extrabold">{stats.publishedThisWeek}<span className="text-2xl text-white/60">/{goal}</span></p>
                <p className="mt-1 text-sm text-white/80">publicações nesta semana</p>
                <ProgressBar value={stats.publishedThisWeek} max={goal} color="#fff" className="mt-5 bg-white/20" />
                <p className="mt-3 text-xs text-white/70">
                  {stats.publishedThisWeek >= goal ? "Meta batida! Constância é o que constrói audiência." :
                    `Faltam ${goal - stats.publishedThisWeek} para bater a meta.`}
                </p>
              </>
            ) : <Skeleton className="mt-4 h-16 bg-white/20" />}
            <Link to="/configuracoes?tab=perfil" className="relative mt-5 inline-block text-xs font-semibold text-white/80 underline-offset-2 hover:underline">Ajustar meta</Link>
          </div>
        </Card>
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card group min-w-0 p-4 transition hover:-translate-y-0.5 hover:shadow-pop sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-soft">{c.label}</span>
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${c.color}14`, color: c.color }}>
                <c.icon className="h-4 w-4" />
              </span>
            </div>
            {c.value === undefined || isLoading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-extrabold">{c.value}</p>}
            {c.hint && <p className="mt-1 text-xs text-ink-faint">{c.hint}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Produtividade" subtitle="Conteúdos criados, roteiros escritos e publicações realizadas"
            action={<Tabs tabs={[{ value: "7", label: "7 dias" }, { value: "15", label: "15 dias" }, { value: "30", label: "30 dias" }] as const} value={range} onChange={setRange} />} />
          <div className="h-72 px-2 pb-4 pt-6">
            {isLoading ? <Skeleton className="mx-4 h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: -18, right: 12 }}>
                  <defs>
                    {[["pub", "#20B486"], ["plan", "#7952D6"], ["rot", "#4F7BE8"]].map(([id, c]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="#ECEAF4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAF4", fontSize: 12 }} />
                  <Area type="monotone" dataKey="Planejados" stroke="#7952D6" strokeWidth={2} fill="url(#plan)" />
                  <Area type="monotone" dataKey="Roteiros" stroke="#4F7BE8" strokeWidth={2} fill="url(#rot)" />
                  <Area type="monotone" dataKey="Publicados" stroke="#20B486" strokeWidth={2} fill="url(#pub)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Próximas publicações" subtitle="Próximos 14 dias" icon={<CalendarCheck className="h-4 w-4" />}
            action={<Link to="/calendario" className="text-[13px] font-semibold text-brand-600 hover:underline">Ver calendário</Link>} />
          <div className="p-3">
            {upcoming.length === 0 ? (
              <EmptyState className="py-8" icon={<CalendarClock className="h-6 w-6" />} title="Nada agendado"
                description="Gere um planejamento ou adicione uma publicação."
                action={<Link to="/planejamento"><Button size="sm" variant="soft">Planejar com IA</Button></Link>} />
            ) : upcoming.map((p) => {
              const st = statusMeta(p.status);
              return (
                <button key={p.id} onClick={() => setEditing(p)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-canvas">
                  <div className="w-12 shrink-0 rounded-xl border border-line py-1 text-center">
                    <p className="text-[10px] font-bold uppercase text-ink-soft">{fmtDate(p.scheduled_date, "EEE")}</p>
                    <p className="text-lg font-extrabold leading-tight">{fmtDate(p.scheduled_date, "dd")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                      <Dot color={platformColor(p.platform)} />{platformLabel(p.platform)} · {formatLabel(p.format)}
                      {p.scheduled_time && ` · ${p.scheduled_time.slice(0, 5)}`}
                    </p>
                  </div>
                  <Badge color={st.text} bg={st.bg}>{st.label}</Badge>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Painel de tarefas" subtitle="O que precisa de você agora" icon={<CheckCircle2 className="h-4 w-4" />}
            action={<Link to="/producao" className="text-[13px] font-semibold text-brand-600 hover:underline">Kanban</Link>} />
          <div className="p-3">
            {(data?.tasks.length ?? 0) === 0 ? (
              <EmptyState className="py-8" icon={<CheckCircle2 className="h-6 w-6" />} title="Nenhuma tarefa aberta"
                description="Envie publicações para a produção para acompanhar gravação, edição e revisão." />
            ) : data!.tasks.filter((t) => t.stage !== "ideias").slice(0, 6).map((t) => {
              const stage = STAGES.find((s) => s.value === t.stage)!;
              const late = t.due_date && t.due_date < today;
              return (
                <Link key={t.id} to={`/producao?task=${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-canvas">
                  <Dot color={stage.color} className="h-2.5 w-2.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="text-xs text-ink-soft">{stage.label}{t.assignee && ` · ${t.assignee}`}</p>
                  </div>
                  {t.due_date && <span className={cn("text-xs font-semibold", late ? "text-[#D93A4A]" : "text-ink-soft")}>{late ? "Atrasada" : fmtDate(t.due_date, "dd/MM")}</span>}
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Sugestões da IA" subtitle="Ideias e recomendações com base no seu projeto e no seu calendário" icon={<Sparkles className="h-4 w-4" />}
            action={suggestions && <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} loading={loadingAi} onClick={loadSuggestions}>Gerar novamente</Button>} />
          <div className="p-5">
            {aiError?.needsUpgrade ? <UpgradeCard compact message={aiError.message} /> : !suggestions ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 px-6 py-8 text-center">
                <Wand2 className="h-7 w-7 text-brand-500" />
                <p className="mt-3 max-w-md text-sm text-ink-soft">
                  A IA analisa seu nicho, a memória do projeto e o equilíbrio do seu calendário para sugerir o que criar a seguir.
                </p>
                {aiError && <p className="mt-2 text-sm font-semibold text-[#D93A4A]">{aiError.message}</p>}
                <Button className="mt-4" icon={<Sparkles className="h-4 w-4" />} loading={loadingAi} onClick={loadSuggestions}
                  disabled={!hasFeature("ai_suggestions")}>Gerar sugestões</Button>
                <p className="mt-2 text-xs text-ink-faint">Usa 1 geração de IA</p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Ideias para criar</p>
                  {suggestions.ideas.map((i) => {
                    const pillar = pillarMeta(i.pillar);
                    return (
                      <div key={i.title} className="rounded-xl border border-line p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">{i.title}</p>
                          {pillar && <Badge color={pillar.color}>{pillar.label}</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-ink-soft">{i.format} · {i.why}</p>
                        <div className="mt-2.5 flex gap-1.5">
                          <Button size="sm" variant="soft" icon={<Lightbulb className="h-3.5 w-3.5" />}
                            onClick={async () => {
                              await ideas.create.mutateAsync({ title: i.title, description: i.why, format: i.format, source: "ai", niche: project?.niche ?? "" });
                              toast.success("Ideia salva no banco");
                            }}>Salvar ideia</Button>
                          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => setEditing({ title: i.title, content_pillar: (pillar?.value ?? null), strategic_goal: i.why })}>Agendar</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Recomendações estratégicas</p>
                  {suggestions.recommendations.map((r) => (
                    <div key={r.title} className="rounded-xl bg-canvas p-3.5">
                      <p className="text-sm font-semibold">{r.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{r.detail}</p>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => navigate("/estudio")}>Abrir Estúdio de IA <ArrowRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <PostEditorModal open={editing !== null} initial={editing && Object.keys(editing).length ? { ...emptyPost(undefined, project?.platforms[0]), ...editing } : null}
        onClose={() => setEditing(null)} />
    </div>
  );
}
