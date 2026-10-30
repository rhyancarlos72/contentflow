import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import {
  CalendarPlus, Check, ChevronDown, Copy, History, Lock, Pencil, Plus, Sparkles, Target, Trash2, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, Dot, EmptyState, Spinner } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { UpgradeGate } from "@/components/UpgradeGate";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError, generate } from "@/lib/ai";
import { FORMATS, formatLabel, GOALS, PILLARS, pillarMeta, platformColor, platformLabel, PLATFORMS, TONES } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { cn, fmtDate, toISODate, uid } from "@/lib/utils";
import type { CalendarPost, ContentPlan, PlanItem } from "@/types";

interface Briefing {
  niche: string; audience: string; goal: string; platforms: string[]; posts_per_week: number;
  formats: string[]; style: string; themes: string; avoid: string; days: 7 | 15 | 30; start_date: string;
}

export default function Planning() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Planejamento Inteligente</h1>
        <p className="page-subtitle">Conte sua estratégia e receba um calendário completo, equilibrado e sem temas repetidos.</p>
      </div>
      <UpgradeGate feature="ai_plan"><PlanningWorkspace /></UpgradeGate>
    </div>
  );
}

function PlanningWorkspace() {
  const { project, plan, refetchPlan } = useWorkspace();
  const { profile } = useAuth();
  const plans = useProjectRows<ContentPlan>("content_plans");
  const planMut = useTableMutations<ContentPlan>("content_plans");
  const posts = useTableMutations<CalendarPost>("calendar_posts");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [deleting, setDeleting] = useState<ContentPlan | null>(null);
  const [showForm, setShowForm] = useState(true);

  const [briefing, setBriefing] = useState<Briefing>(() => ({
    niche: "", audience: "", goal: GOALS[0], platforms: [], posts_per_week: 3, formats: ["reels", "carrossel"],
    style: "natural", themes: "", avoid: "", days: 7, start_date: toISODate(addDays(new Date(), 1)),
  }));
  useEffect(() => {
    if (!project) return;
    setBriefing((b) => ({
      ...b,
      niche: project.niche, audience: project.audience,
      goal: (GOALS as readonly string[]).includes(project.goals[0] ?? "") ? project.goals[0]! : GOALS[0],
      platforms: project.platforms.length ? project.platforms : ["instagram"],
      posts_per_week: project.posts_per_week || 3,
      style: profile?.communication_style ?? "natural",
    }));
  }, [project, profile?.communication_style]);

  const active = useMemo(() => {
    const list = plans.data ?? [];
    return list.find((p) => p.id === activeId) ?? (activeId === null ? list[0] : undefined) ?? null;
  }, [plans.data, activeId]);
  useEffect(() => { if (active) setShowForm(false); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Briefing>(k: K, v: Briefing[K]) => setBriefing((b) => ({ ...b, [k]: v }));
  const maxDays = plan?.limits.max_plan_days ?? 7;

  const run = async () => {
    if (!briefing.niche.trim() || !briefing.audience.trim()) return toast.error("Preencha nicho e público-alvo.");
    if (!briefing.platforms.length) return toast.error("Escolha pelo menos uma rede social.");
    setGenerating(true);
    try {
      const styleLabel = TONES.find((t) => t.value === briefing.style)?.label ?? briefing.style;
      const res = await generate<{ strategy_summary: string; items: PlanItem[] }>("plan", project!.id, {
        ...briefing, style: styleLabel,
      });
      const saved = await planMut.create.mutateAsync({
        title: `${briefing.days} dias · a partir de ${fmtDate(briefing.start_date, "dd/MM")}`,
        days: briefing.days, start_date: briefing.start_date, briefing: { ...briefing },
        strategy_summary: res.data.strategy_summary, items: res.data.items,
      });
      setActiveId(saved[0]!.id);
      setShowForm(false);
      refetchPlan();
      toast.success(`Planejamento com ${res.data.items.length} publicações criado!`);
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : "Não foi possível gerar o planejamento.");
    } finally {
      setGenerating(false);
    }
  };

  const saveItems = (items: PlanItem[]) => active && planMut.update.mutateAsync({ id: active.id, items });

  const toCalendar = async (items: PlanItem[]) => {
    if (!active) return;
    const pending = items.filter((i) => !i.post_id);
    if (!pending.length) return toast.info("Esses itens já estão no calendário.");
    const created = await posts.create.mutateAsync(pending.map((i) => ({
      plan_id: active.id, title: i.theme, scheduled_date: i.date, platform: i.platform, format: i.format,
      status: "planejado" as const, content_pillar: i.pillar, strategic_goal: i.strategic_goal, hook: i.hook,
      script_outline: i.script, caption: i.caption, cta: i.cta, hashtags: i.hashtags,
    })));
    const ids = new Map(pending.map((i, idx) => [i.id, created[idx]?.id]));
    await saveItems(active.items.map((i) => (ids.get(i.id) ? { ...i, post_id: ids.get(i.id) } : i)));
    toast.success(`${created.length} publicação(ões) adicionada(s) ao calendário`);
  };

  const pillarBalance = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of active?.items ?? []) counts.set(i.pillar, (counts.get(i.pillar) ?? 0) + 1);
    return PILLARS.filter((p) => counts.has(p.value)).map((p) => ({ ...p, count: counts.get(p.value)! }));
  }, [active]);

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <button onClick={() => setShowForm((s) => !s)} className="flex w-full items-center justify-between px-5 py-4 text-left">
            <span className="flex items-center gap-2 font-bold"><Target className="h-4 w-4 text-brand-500" /> Novo planejamento</span>
            <ChevronDown className={cn("h-4 w-4 text-ink-soft transition", showForm && "rotate-180")} />
          </button>
          {showForm && (
            <div className="space-y-4 border-t border-line px-5 py-5">
              <Field label="Período">
                <div className="grid grid-cols-3 gap-2">
                  {([7, 15, 30] as const).map((d) => (
                    <button key={d} type="button" disabled={d > maxDays} onClick={() => set("days", d)}
                      className={cn("relative rounded-xl border py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
                        briefing.days === d ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line hover:border-brand-200")}>
                      {d} dias
                      {d > maxDays && <Lock className="absolute right-1.5 top-1.5 h-3 w-3" />}
                    </button>
                  ))}
                </div>
                {maxDays < 30 && <p className="hint">Planejamento de 30 dias disponível no plano Pro.</p>}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><Input type="date" value={briefing.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
                <Field label="Posts/semana"><Input type="number" min={1} max={14} value={briefing.posts_per_week} onChange={(e) => set("posts_per_week", Number(e.target.value))} /></Field>
              </div>
              <Field label="Nicho de atuação"><Input value={briefing.niche} onChange={(e) => set("niche", e.target.value)} /></Field>
              <Field label="Público-alvo"><Textarea rows={3} value={briefing.audience} onChange={(e) => set("audience", e.target.value)} /></Field>
              <Field label="Objetivo principal">
                <Select value={briefing.goal} onChange={(e) => set("goal", e.target.value)}>
                  {GOALS.map((g) => <option key={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Redes sociais"><Chips multiple options={PLATFORMS} value={briefing.platforms} onChange={(v) => set("platforms", v)} /></Field>
              <Field label="Formatos preferidos"><Chips multiple options={FORMATS} value={briefing.formats} onChange={(v) => set("formats", v)} /></Field>
              <Field label="Estilo de comunicação"><Chips options={TONES} value={[briefing.style]} onChange={(v) => set("style", v[0] ?? "natural")} /></Field>
              <Field label="Temas que deseja abordar"><Textarea rows={2} value={briefing.themes} onChange={(e) => set("themes", e.target.value)} placeholder="Ex.: reserva de emergência, primeiros investimentos" /></Field>
              <Field label="Temas que deseja evitar"><Textarea rows={2} value={briefing.avoid} onChange={(e) => set("avoid", e.target.value)} placeholder="Ex.: criptomoedas, política" /></Field>
              <Button size="lg" className="w-full" icon={<Wand2 className="h-4 w-4" />} loading={generating} onClick={run}>
                {generating ? "Criando estratégia…" : "Gerar planejamento"}
              </Button>
              {generating && <p className="text-center text-xs text-ink-soft">Isso pode levar até um minuto para planos maiores.</p>}
            </div>
          )}
        </Card>

        {(plans.data?.length ?? 0) > 0 && (
          <Card className="p-2">
            <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink-faint"><History className="h-3.5 w-3.5" /> Histórico</p>
            {plans.data!.map((p) => (
              <div key={p.id} className={cn("group flex items-center gap-2 rounded-xl px-3 py-2", active?.id === p.id && "bg-brand-50")}>
                <button className="min-w-0 flex-1 text-left" onClick={() => setActiveId(p.id)}>
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-ink-soft">{p.items.length} publicações · criado {fmtDate(p.created_at)}</p>
                </button>
                <button onClick={() => setDeleting(p)} className="rounded-lg p-1.5 text-ink-faint opacity-0 transition hover:bg-white hover:text-[#D93A4A] group-hover:opacity-100" aria-label="Excluir planejamento">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div className="min-w-0">
        {generating ? (
          <Card className="grid min-h-[420px] place-items-center">
            <div className="text-center">
              <Spinner className="mx-auto h-8 w-8" />
              <p className="mt-4 font-bold">Montando sua estratégia</p>
              <p className="mt-1 text-sm text-ink-soft">Equilibrando pilares, evitando temas repetidos e escrevendo ganchos…</p>
            </div>
          </Card>
        ) : !active ? (
          <Card><EmptyState icon={<Sparkles className="h-6 w-6" />} title="Seu primeiro planejamento começa aqui"
            description="Preencha o briefing ao lado. A IA usa a memória do projeto para respeitar seu tom e evitar repetições." /></Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Estratégia</p>
                  <h2 className="mt-1 text-lg font-bold">{active.title}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({
                    id: uid(), date: active.items.at(-1)?.date ?? active.start_date, platform: project?.platforms[0] ?? "instagram",
                    format: "reels", theme: "", pillar: "educativo", strategic_goal: "", hook: "", script: "", caption: "", cta: "", hashtags: [],
                  })}>Adicionar item</Button>
                  <Button icon={<CalendarPlus className="h-4 w-4" />} loading={posts.create.isPending} onClick={() => toCalendar(active.items)}>
                    Adicionar tudo ao calendário
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{active.strategy_summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {pillarBalance.map((p) => <Badge key={p.value} color={p.color}>{p.label} · {p.count}</Badge>)}
              </div>
            </Card>

            <div className="space-y-3">
              {active.items.map((item) => (
                <PlanItemCard key={item.id} item={item}
                  onEdit={() => setEditing(item)}
                  onDuplicate={() => {
                    const idx = active.items.findIndex((i) => i.id === item.id);
                    const copy = { ...item, id: uid(), post_id: null, theme: `${item.theme} (variação)` };
                    saveItems([...active.items.slice(0, idx + 1), copy, ...active.items.slice(idx + 1)]);
                  }}
                  onDelete={() => saveItems(active.items.filter((i) => i.id !== item.id))}
                  onCalendar={() => toCalendar([item])} />
              ))}
              {active.items.length === 0 && <Card><EmptyState icon={<Target className="h-6 w-6" />} title="Planejamento vazio" /></Card>}
            </div>
          </div>
        )}
      </div>

      <PlanItemModal item={editing} onClose={() => setEditing(null)}
        onSave={(updated) => {
          const exists = active!.items.some((i) => i.id === updated.id);
          const items = exists ? active!.items.map((i) => (i.id === updated.id ? updated : i)) : [...active!.items, updated];
          saveItems([...items].sort((a, b) => a.date.localeCompare(b.date)));
          setEditing(null);
          toast.success("Item atualizado");
        }} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir planejamento?"
        description="As publicações já enviadas ao calendário continuam lá."
        onConfirm={async () => {
          await planMut.remove.mutateAsync(deleting!.id);
          if (activeId === deleting!.id) setActiveId(null);
          setDeleting(null);
        }} />
    </div>
  );
}

function PlanItemCard({ item, onEdit, onDuplicate, onDelete, onCalendar }: {
  item: PlanItem; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onCalendar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pillar = pillarMeta(item.pillar);
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="w-14 shrink-0 rounded-xl bg-canvas py-2 text-center">
          <p className="text-[10px] font-bold uppercase text-ink-soft">{fmtDate(item.date, "EEE")}</p>
          <p className="text-xl font-extrabold leading-tight">{fmtDate(item.date, "dd")}</p>
          <p className="text-[10px] font-semibold text-ink-soft">{fmtDate(item.date, "MMM")}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5"><Dot color={platformColor(item.platform)} />{platformLabel(item.platform)}</span>
            <span>·</span><span>{formatLabel(item.format)}</span>
            {pillar && <Badge color={pillar.color}>{pillar.label}</Badge>}
            {item.post_id && <Badge color="#127757" bg="#E3F6EF"><Check className="h-3 w-3" /> No calendário</Badge>}
          </div>
          <h3 className="mt-1.5 font-bold leading-snug">{item.theme}</h3>
          <p className="mt-1 text-sm text-ink-soft"><span className="font-semibold text-ink">Gancho:</span> “{item.hook}”</p>
          <p className="mt-1 text-xs text-ink-faint">{item.strategic_goal}</p>
        </div>
      </div>
      {open && (
        <div className="grid gap-4 border-t border-line bg-canvas/50 p-4 text-sm md:grid-cols-2">
          <div><p className="mb-1 text-xs font-bold uppercase text-ink-faint">Roteiro / estrutura</p><p className="prose-script text-sm">{item.script}</p></div>
          <div className="space-y-3">
            <div><p className="mb-1 text-xs font-bold uppercase text-ink-faint">Legenda</p><p className="whitespace-pre-wrap">{item.caption}</p></div>
            <div><p className="mb-1 text-xs font-bold uppercase text-ink-faint">CTA</p><p>{item.cta}</p></div>
            <div><p className="mb-1 text-xs font-bold uppercase text-ink-faint">Hashtags</p><p className="text-brand-600">{item.hashtags.join(" ")}</p></div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 border-t border-line px-3 py-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} /> {open ? "Recolher" : "Ver roteiro e legenda"}
        </Button>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDuplicate} aria-label="Duplicar"><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
          {!item.post_id && <Button size="sm" variant="soft" icon={<CalendarPlus className="h-4 w-4" />} onClick={onCalendar}>Calendário</Button>}
        </div>
      </div>
    </Card>
  );
}

function PlanItemModal({ item, onClose, onSave }: { item: PlanItem | null; onClose: () => void; onSave: (i: PlanItem) => void }) {
  const [draft, setDraft] = useState<PlanItem | null>(item);
  const [tags, setTags] = useState("");
  useEffect(() => { setDraft(item); setTags(item?.hashtags.join(" ") ?? ""); }, [item]);
  if (!draft) return null;
  const set = <K extends keyof PlanItem>(k: K, v: PlanItem[K]) => setDraft({ ...draft, [k]: v });
  return (
    <Modal open={Boolean(item)} onClose={onClose} title="Editar item do planejamento" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, hashtags: tags.split(/\s+/).filter(Boolean).map((h) => "#" + h.replace(/^#+/, "")) })}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tema" className="sm:col-span-3"><Input value={draft.theme} onChange={(e) => set("theme", e.target.value)} /></Field>
        <Field label="Data"><Input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Plataforma"><Select value={draft.platform} onChange={(e) => set("platform", e.target.value)}>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Pilar"><Select value={draft.pillar} onChange={(e) => set("pillar", e.target.value as PlanItem["pillar"])}>{PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Objetivo estratégico" className="sm:col-span-3"><Input value={draft.strategic_goal} onChange={(e) => set("strategic_goal", e.target.value)} /></Field>
        <Field label="Gancho" className="sm:col-span-3"><Input value={draft.hook} onChange={(e) => set("hook", e.target.value)} /></Field>
        <Field label="Roteiro / estrutura" className="sm:col-span-3"><Textarea rows={6} value={draft.script} onChange={(e) => set("script", e.target.value)} /></Field>
        <Field label="Legenda" className="sm:col-span-3"><Textarea rows={4} value={draft.caption} onChange={(e) => set("caption", e.target.value)} /></Field>
        <Field label="CTA" className="sm:col-span-3"><Input value={draft.cta} onChange={(e) => set("cta", e.target.value)} /></Field>
        <Field label="Hashtags" className="sm:col-span-3"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
