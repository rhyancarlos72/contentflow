import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, isToday,
  startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, Plus, Rows3 } from "lucide-react";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Badge, Card, Dot, EmptyState, Skeleton, Tabs } from "@/components/ui/misc";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatLabel, platformColor, platformLabel, PLATFORMS, POST_STATUSES, statusMeta } from "@/lib/constants";
import { useTableMutations } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { cn, fmtDate, toISODate } from "@/lib/utils";
import type { CalendarPost, PostStatus } from "@/types";

type View = "mes" | "semana" | "lista";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function Calendar() {
  const { projectId, projects, project } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "mes";
  const [cursor, setCursor] = useState(new Date());
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [projectFilter, setProjectFilter] = useState<string>("atual");
  const [editing, setEditing] = useState<PostDraft | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const { update } = useTableMutations<CalendarPost>("calendar_posts");

  const range = useMemo(() => {
    if (view === "semana") return { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) };
    if (view === "lista") return { start: startOfMonth(cursor), end: endOfMonth(addMonths(cursor, 1)) };
    return { start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
  }, [view, cursor]);

  const scope = projectFilter === "atual" ? projectId : projectFilter;
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["rows", "calendar_posts", "range", scope, toISODate(range.start), toISODate(range.end)],
    enabled: Boolean(projectId),
    queryFn: async () => {
      let q = supabase.from("calendar_posts").select("*")
        .gte("scheduled_date", toISODate(range.start)).lte("scheduled_date", toISODate(range.end))
        .order("scheduled_date").order("scheduled_time", { nullsFirst: false });
      if (scope !== "todos") q = q.eq("project_id", scope);
      const { data, error } = await q;
      if (error) throw error;
      return data as CalendarPost[];
    },
  });

  // Abre uma publicação vinda da busca global ou de notificações (?post=id).
  const postParam = params.get("post");
  useEffect(() => {
    if (!postParam) return;
    supabase.from("calendar_posts").select("*").eq("id", postParam).maybeSingle().then(({ data }) => {
      if (data) {
        setEditing(data as CalendarPost);
        setCursor(new Date(`${(data as CalendarPost).scheduled_date}T12:00:00`));
      }
      params.delete("post");
      setParams(params, { replace: true });
    });
  }, [postParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = posts.filter((p) => (!platform || p.platform === platform) && (!status || p.status === status));
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of filtered) map.set(p.scheduled_date, [...(map.get(p.scheduled_date) ?? []), p]);
    return map;
  }, [filtered]);

  const move = (dir: 1 | -1) => setCursor((c) => view === "semana" ? (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)) : (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)));
  const setView = (v: View) => { params.set("view", v); setParams(params, { replace: true }); };
  const projectName = (id: string) => projects.find((p) => p.id === id);

  const onDrop = (date: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/post-id");
    const post = posts.find((p) => p.id === id);
    if (post && post.scheduled_date !== date) update.mutate({ id, scheduled_date: date });
  };

  const dropProps = (date: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(date); },
    onDragLeave: () => setDragOver((d) => (d === date ? null : d)),
    onDrop: (e: React.DragEvent) => onDrop(date, e),
  });

  const title = view === "semana"
    ? `${fmtDate(range.start, "dd MMM")} – ${fmtDate(range.end, "dd MMM yyyy")}`
    : fmtDate(cursor, "MMMM 'de' yyyy");

  const PostChip = ({ p, expanded }: { p: CalendarPost; expanded?: boolean }) => {
    const st = statusMeta(p.status);
    const proj = projectName(p.project_id);
    return (
      <button draggable onDragStart={(e) => e.dataTransfer.setData("text/post-id", p.id)}
        onClick={(e) => { e.stopPropagation(); setEditing(p); }}
        className="group w-full cursor-grab rounded-lg border border-line bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-brand-200 hover:shadow-card active:cursor-grabbing"
        style={{ borderLeft: `3px solid ${platformColor(p.platform)}` }}>
        <p className={cn("text-[12px] font-semibold leading-snug", expanded ? "line-clamp-3" : "truncate")}>{p.title}</p>
        <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-soft">
          <Dot color={st.dot} className="h-1.5 w-1.5" />
          <span className="truncate">{expanded ? st.label : formatLabel(p.format)}</span>
          {p.scheduled_time && <span className="ml-auto shrink-0">{p.scheduled_time.slice(0, 5)}</span>}
        </div>
        {expanded && (
          <div className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-faint">
            {platformLabel(p.platform)} · {formatLabel(p.format)}
            {projectFilter === "todos" && proj && <><span>·</span><Dot color={proj.color} className="h-1.5 w-1.5" />{proj.name}</>}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Calendário Editorial</h1>
          <p className="page-subtitle">Arraste publicações entre os dias para reorganizar. Clique para editar.</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(emptyPost(undefined, project?.platforms[0]))}>Nova publicação</Button>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" size="icon" onClick={() => move(1)} aria-label="Próximo"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
          </div>
          <h2 className="min-w-[180px] text-lg font-bold capitalize">{title}</h2>
          <Tabs className="ml-auto" value={view} onChange={setView} tabs={[
            { value: "mes", label: "Mensal", icon: <CalendarDays className="h-3.5 w-3.5" /> },
            { value: "semana", label: "Semanal", icon: <Rows3 className="h-3.5 w-3.5" /> },
            { value: "lista", label: "Lista", icon: <List className="h-3.5 w-3.5" /> },
          ] as const} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filtrar plataforma">
            <option value="">Todas as plataformas</option>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar status">
            <option value="">Todos os status</option>
            {POST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filtrar projeto">
            <option value="atual">Projeto atual ({project?.name})</option>
            {projects.length > 1 && <option value="todos">Todos os projetos</option>}
            {projects.filter((p) => p.id !== projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </Card>

      {isLoading ? <Skeleton className="h-[540px] rounded-2xl" /> : view === "lista" ? (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState icon={<List className="h-6 w-6" />} title="Nenhuma publicação neste período" description="Ajuste os filtros ou crie uma nova publicação." />
          ) : (
            <div className="divide-y divide-line">
              {filtered.map((p) => {
                const st = statusMeta(p.status);
                const proj = projectName(p.project_id);
                return (
                  <button key={p.id} onClick={() => setEditing(p)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition hover:bg-canvas sm:flex-nowrap">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-bold capitalize">{fmtDate(p.scheduled_date, "EEE, dd/MM")}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-soft"><Clock className="h-3 w-3" />{p.scheduled_time?.slice(0, 5) ?? "sem horário"}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.title}</p>
                      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                        <Dot color={platformColor(p.platform)} />{platformLabel(p.platform)} · {formatLabel(p.format)}
                        {proj && <> · <Dot color={proj.color} />{proj.name}</>}
                      </p>
                    </div>
                    <Badge color={st.text} bg={st.bg}>{st.label}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-canvas/60">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-ink-soft">{d}</div>)}
          </div>
          <div className={cn("grid grid-cols-7", view === "semana" ? "min-h-[460px]" : "auto-rows-[minmax(108px,auto)]")}>
            {eachDayOfInterval(range).map((day) => {
              const key = toISODate(day);
              const items = byDay.get(key) ?? [];
              const outside = view === "mes" && !isSameMonth(day, cursor);
              const max = view === "mes" ? 3 : 99;
              return (
                <div key={key} {...dropProps(key)}
                  onDoubleClick={() => setEditing(emptyPost(key, project?.platforms[0]))}
                  className={cn(
                    "group relative min-w-0 border-b border-r border-line p-1 transition-colors sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                    outside && "bg-canvas/50", dragOver === key && "bg-brand-50 ring-2 ring-inset ring-brand-300",
                  )}>
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className={cn("grid h-6 min-w-6 place-items-center rounded-full text-xs font-bold",
                      isToday(day) ? "bg-brand-500 text-white" : outside ? "text-ink-faint" : "text-ink")}>
                      {fmtDate(day, "d")}
                    </span>
                    <button onClick={() => setEditing(emptyPost(key, project?.platforms[0]))}
                      className="hidden h-5 w-5 place-items-center rounded-md text-ink-soft hover:bg-brand-100 hover:text-brand-700 group-hover:grid" aria-label="Adicionar neste dia">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, max).map((p) => <PostChip key={p.id} p={p} expanded={view === "semana"} />)}
                    {items.length > max && (
                      <button onClick={() => { setCursor(day); setView("semana"); }} className="w-full rounded-md px-1 text-left text-[11px] font-semibold text-brand-600 hover:underline">
                        +{items.length - max} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
        {POST_STATUSES.map((s) => (
          <button key={s.value} onClick={() => setStatus(status === s.value ? "" : (s.value as PostStatus))}
            className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 transition hover:bg-white", status === s.value && "bg-white font-semibold text-ink")}>
            <Dot color={s.dot} /> {s.label}
          </button>
        ))}
      </div>

      <PostEditorModal open={editing !== null} initial={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
