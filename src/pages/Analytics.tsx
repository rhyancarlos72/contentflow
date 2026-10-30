import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { startOfWeek } from "date-fns";
import { BarChart3, Download, Lightbulb, Pencil, Plus, Sparkles, Trash2, TrendingUp, TriangleAlert } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { UpgradeCard, UpgradeGate } from "@/components/UpgradeGate";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError, generate, type InsightsResult } from "@/lib/ai";
import { FORMATS, formatLabel, platformLabel, PLATFORMS } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { cn, fmtDate, fmtNumber, toISODate } from "@/lib/utils";
import type { AnalyticsRecord, CalendarPost } from "@/types";

const METRICS = [
  { key: "views", label: "Visualizações" }, { key: "reach", label: "Alcance" }, { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" }, { key: "shares", label: "Compartilhamentos" }, { key: "saves", label: "Salvamentos" },
  { key: "followers_gained", label: "Seguidores" }, { key: "clicks", label: "Cliques" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];
const COMPARE_COLORS = ["#7952D6", "#20B486", "#E8743D", "#4F7BE8"];

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Analytics e Desempenho</h1>
        <p className="page-subtitle">Registre os números reais das suas publicações e descubra o que funciona para o seu público.</p>
      </div>
      <UpgradeGate feature="analytics_manual"><AnalyticsWorkspace /></UpgradeGate>
    </div>
  );
}

function AnalyticsWorkspace() {
  const { hasFeature, projectId, project, refetchPlan } = useWorkspace();
  const records = useProjectRows<AnalyticsRecord>("analytics", { order: "published_on", ascending: true });
  const { remove } = useTableMutations<AnalyticsRecord>("analytics");
  const [editing, setEditing] = useState<Partial<AnalyticsRecord> | null>(null);
  const [deleting, setDeleting] = useState<AnalyticsRecord | null>(null);
  const [metric, setMetric] = useState<MetricKey>("views");
  const [sortBy, setSortBy] = useState<MetricKey | "engagement_rate">("engagement_rate");
  const [compare, setCompare] = useState<string[]>([]);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<AiError | null>(null);

  const rows = useMemo(() => records.data ?? [], [records.data]);
  const totals = useMemo(() => {
    const sum = (k: MetricKey) => rows.reduce((s, r) => s + r[k], 0);
    const eng = rows.filter((r) => r.engagement_rate !== null);
    return {
      ...Object.fromEntries(METRICS.map((m) => [m.key, sum(m.key)])) as Record<MetricKey, number>,
      engagement: eng.length ? eng.reduce((s, r) => s + Number(r.engagement_rate), 0) / eng.length : null,
    };
  }, [rows]);

  const weekly = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const wk = toISODate(startOfWeek(new Date(`${r.published_on}T12:00:00`), { weekStartsOn: 1 }));
      const cur = map.get(wk) ?? { publicacoes: 0 };
      for (const m of METRICS) cur[m.key] = (cur[m.key] ?? 0) + r[m.key];
      cur.publicacoes = (cur.publicacoes ?? 0) + 1;
      map.set(wk, cur);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([wk, v]) => ({ semana: fmtDate(wk, "dd/MM"), ...v }));
  }, [rows]);

  const byFormat = useMemo(() => {
    const map = new Map<string, AnalyticsRecord[]>();
    for (const r of rows) map.set(r.format, [...(map.get(r.format) ?? []), r]);
    return [...map].map(([format, items]) => {
      const eng = items.filter((i) => i.engagement_rate !== null);
      return {
        formato: formatLabel(format),
        "Engajamento médio (%)": eng.length ? Number((eng.reduce((s, i) => s + Number(i.engagement_rate), 0) / eng.length).toFixed(2)) : 0,
        "Salvamentos médios": Math.round(items.reduce((s, i) => s + i.saves, 0) / items.length),
        n: items.length,
      };
    });
  }, [rows]);

  const sorted = [...rows].sort((a, b) => Number(b[sortBy] ?? -1) - Number(a[sortBy] ?? -1));
  const compared = rows.filter((r) => compare.includes(r.id));
  const compareData = METRICS.map((m) => ({
    metrica: m.label, ...Object.fromEntries(compared.map((r) => [r.title.slice(0, 28), r[m.key]])),
  }));

  const runInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await generate<InsightsResult>("analytics_insights", projectId);
      setInsights(res.data);
      refetchPlan();
    } catch (e) {
      setAiError(e instanceof AiError ? e : new AiError("unknown", "Erro ao analisar."));
    } finally {
      setAiLoading(false);
    }
  };

  const exportCsv = () => {
    const header = ["data", "titulo", "plataforma", "formato", "tema", ...METRICS.map((m) => m.key), "engajamento_%"];
    const lines = rows.map((r) => [r.published_on, r.title, r.platform, r.format, r.topic, ...METRICS.map((m) => r[m.key]), r.engagement_rate ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${project?.name.toLowerCase().replace(/\W+/g, "-")}-${toISODate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (records.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        {hasFeature("reports") ? (
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={exportCsv}>Exportar relatório (CSV)</Button>
        ) : (
          <Link to="/precos"><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Relatórios no plano Pro</Button></Link>
        )}
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ published_on: toISODate(new Date()), platform: project?.platforms[0] ?? "instagram", format: "reels" })}>Registrar métricas</Button>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nenhuma métrica registrada"
          description="Depois de publicar, registre visualizações, alcance e interações. Os gráficos e a análise da IA usam só esses dados reais."
          action={<Button onClick={() => setEditing({ published_on: toISODate(new Date()), platform: project?.platforms[0] ?? "instagram", format: "reels" })}>Registrar primeira publicação</Button>} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[...METRICS.map((m) => ({ label: m.label, value: fmtNumber(totals[m.key]) })),
              { label: "Engajamento médio", value: totals.engagement === null ? "—" : `${totals.engagement.toFixed(2)}%` },
              { label: "Publicações medidas", value: String(rows.length) }].map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-xs font-semibold text-ink-soft">{k.label}</p>
                <p className="mt-1 text-2xl font-extrabold">{k.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Evolução semanal" subtitle="Soma por semana de publicação" icon={<TrendingUp className="h-4 w-4" />}
                action={<div className="w-40"><Select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></div>} />
              <div className="h-72 px-2 pb-4 pt-4">
                <ResponsiveContainer>
                  <LineChart data={weekly} margin={{ left: -10, right: 16 }}>
                    <CartesianGrid stroke="#ECEAF4" vertical={false} />
                    <XAxis dataKey="semana" tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(Number(v))} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAF4", fontSize: 12 }} />
                    <Line type="monotone" dataKey={metric} name={METRICS.find((m) => m.key === metric)!.label} stroke="#7952D6" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Desempenho por formato" subtitle="Médias por publicação" icon={<BarChart3 className="h-4 w-4" />} />
              <div className="h-72 px-2 pb-4 pt-4">
                <ResponsiveContainer>
                  <BarChart data={byFormat} margin={{ left: -10, right: 16 }}>
                    <CartesianGrid stroke="#ECEAF4" vertical={false} />
                    <XAxis dataKey="formato" tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAF4", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Engajamento médio (%)" fill="#7952D6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Salvamentos médios" fill="#20B486" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Análise da IA" subtitle="Observações baseadas somente nas métricas registradas" icon={<Sparkles className="h-4 w-4" />}
              action={hasFeature("ai_analytics") && <Button size="sm" icon={<Sparkles className="h-4 w-4" />} loading={aiLoading} disabled={rows.length < 3} onClick={runInsights}>{insights ? "Analisar novamente" : "Analisar resultados"}</Button>} />
            <div className="p-5">
              {!hasFeature("ai_analytics") ? <UpgradeCard feature="ai_analytics" compact /> :
                aiError ? (aiError.needsUpgrade ? <UpgradeCard compact message={aiError.message} /> : <p className="text-sm font-semibold text-[#D93A4A]">{aiError.message}</p>) :
                rows.length < 3 ? <p className="text-sm text-ink-soft">Registre pelo menos 3 publicações para liberar a análise (você tem {rows.length}).</p> :
                !insights ? <p className="text-sm text-ink-soft">A IA vai comparar formatos, temas, frequência e salvamentos — e dizer o que priorizar nas próximas semanas.</p> : (
                  <div className="space-y-5">
                    <p className="text-[15px] leading-relaxed">{insights.summary}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {insights.observations.map((o) => (
                        <div key={o.title} className="rounded-xl border border-line p-4">
                          <p className="font-semibold">{o.title}</p>
                          <p className="mt-1 text-sm text-ink-soft">{o.detail}</p>
                          <p className="mt-2 rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink">📊 {o.evidence}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl bg-brand-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-brand-700"><Lightbulb className="h-4 w-4" />Próximos passos</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{insights.next_steps.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                    {insights.data_caveats && <p className="flex gap-2 text-xs text-ink-soft"><TriangleAlert className="h-4 w-4 shrink-0 text-[#E8A33D]" />{insights.data_caveats}</p>}
                  </div>
                )}
            </div>
          </Card>

          {compared.length >= 2 && (
            <Card>
              <CardHeader title="Comparação entre publicações" subtitle={`${compared.length} selecionadas`}
                action={<Button size="sm" variant="ghost" onClick={() => setCompare([])}>Limpar</Button>} />
              <div className="h-80 px-2 pb-4 pt-4">
                <ResponsiveContainer>
                  <BarChart data={compareData} margin={{ left: -10, right: 16 }}>
                    <CartesianGrid stroke="#ECEAF4" vertical={false} />
                    <XAxis dataKey="metrica" tick={{ fontSize: 10, fill: "#858399" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: "#858399" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(Number(v))} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAF4", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {compared.map((r, i) => <Bar key={r.id} dataKey={r.title.slice(0, 28)} fill={COMPARE_COLORS[i]} radius={[4, 4, 0, 0]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="font-bold">Publicações</h3>
                <p className="text-xs text-ink-soft">Marque até 4 para comparar lado a lado.</p>
              </div>
              <div className="w-48">
                <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as MetricKey)} aria-label="Ordenar por">
                  <option value="engagement_rate">Ordenar: engajamento</option>
                  {METRICS.map((m) => <option key={m.key} value={m.key}>Ordenar: {m.label.toLowerCase()}</option>)}
                </Select>
              </div>
            </div>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-y border-line bg-canvas/60 text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className="w-10 px-4 py-2.5" />
                    <th className="px-2 py-2.5">Publicação</th>
                    {METRICS.slice(0, 6).map((m) => <th key={m.key} className="px-2 py-2.5 text-right">{m.label}</th>)}
                    <th className="px-2 py-2.5 text-right">Engaj.</th>
                    <th className="w-20 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sorted.map((r) => (
                    <tr key={r.id} className={cn("transition hover:bg-canvas/60", compare.includes(r.id) && "bg-brand-50/50")}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={compare.includes(r.id)} aria-label={`Comparar ${r.title}`}
                          disabled={!compare.includes(r.id) && compare.length >= 4}
                          onChange={() => setCompare((c) => (c.includes(r.id) ? c.filter((x) => x !== r.id) : [...c, r.id]))} />
                      </td>
                      <td className="max-w-[260px] px-2 py-3">
                        <p className="truncate font-semibold">{r.title}</p>
                        <p className="text-xs text-ink-soft">{fmtDate(r.published_on)} · {platformLabel(r.platform)} · {formatLabel(r.format)}{r.topic && ` · ${r.topic}`}</p>
                      </td>
                      {METRICS.slice(0, 6).map((m) => <td key={m.key} className="px-2 py-3 text-right tabular-nums">{fmtNumber(r[m.key])}</td>)}
                      <td className="px-2 py-3 text-right font-bold tabular-nums text-positive">{r.engagement_rate === null ? "—" : `${Number(r.engagement_rate).toFixed(2)}%`}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-0.5">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm text-ink-soft">
        <BarChart3 className="h-5 w-5 text-brand-500" />
        <p className="flex-1">Integrações oficiais com as APIs das redes (Instagram Graph, YouTube Analytics, TikTok) estão preparadas na arquitetura: métricas importadas chegam aqui marcadas como “API”.</p>
      </Card>

      <MetricsModal record={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir registro de métricas?"
        onConfirm={async () => { await remove.mutateAsync(deleting!.id); setDeleting(null); setCompare((c) => c.filter((x) => x !== deleting!.id)); }} />
    </div>
  );
}

function MetricsModal({ record, onClose }: { record: Partial<AnalyticsRecord> | null; onClose: () => void }) {
  const posts = useProjectRows<CalendarPost>("calendar_posts", { order: "scheduled_date", eq: ["status", "publicado"], enabled: Boolean(record) });
  const { create, update } = useTableMutations<AnalyticsRecord>("analytics");
  const [draft, setDraft] = useState<Partial<AnalyticsRecord>>({});
  const [lastRecord, setLastRecord] = useState<typeof record>(null);
  if (record !== lastRecord) { setLastRecord(record); setDraft(record ?? {}); }
  const set = <K extends keyof AnalyticsRecord>(k: K, v: AnalyticsRecord[K] | null) => setDraft((d) => ({ ...d, [k]: v }));

  const pickPost = (id: string) => {
    const p = posts.data?.find((x) => x.id === id);
    if (!p) return set("post_id", null);
    setDraft((d) => ({
      ...d, post_id: p.id, title: p.title, platform: p.platform, format: p.format, topic: p.content_pillar ?? d.topic ?? "",
      published_on: p.published_at ? toISODate(new Date(p.published_at)) : p.scheduled_date,
    }));
  };

  const save = async () => {
    if (!draft.title?.trim()) return toast.error("Informe o título da publicação.");
    const values = {
      post_id: draft.post_id ?? null, title: draft.title.trim(), platform: draft.platform, format: draft.format, topic: draft.topic ?? "",
      published_on: draft.published_on,
      ...Object.fromEntries(METRICS.map((m) => [m.key, Math.max(m.key === "followers_gained" ? -1e9 : 0, Number(draft[m.key] ?? 0) || 0)])),
    } as Partial<AnalyticsRecord>;
    if (draft.id) await update.mutateAsync({ id: draft.id, ...values });
    else await create.mutateAsync(values);
    toast.success("Métricas salvas");
    onClose();
  };

  return (
    <Modal open={Boolean(record)} onClose={onClose} title={draft.id ? "Editar métricas" : "Registrar métricas"} size="lg"
      description="Copie os números do painel da rede social. O engajamento é calculado automaticamente."
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={create.isPending || update.isPending}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Publicação do calendário (opcional)" className="sm:col-span-4">
          <Select value={draft.post_id ?? ""} onChange={(e) => pickPost(e.target.value)}>
            <option value="">Preencher manualmente</option>
            {(posts.data ?? []).map((p) => <option key={p.id} value={p.id}>{fmtDate(p.scheduled_date, "dd/MM")} · {p.title}</option>)}
          </Select>
        </Field>
        <Field label="Título" className="sm:col-span-4"><Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Data"><Input type="date" value={draft.published_on ?? ""} onChange={(e) => set("published_on", e.target.value)} /></Field>
        <Field label="Plataforma"><Select value={draft.platform} onChange={(e) => set("platform", e.target.value)}>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Formato"><Select value={draft.format} onChange={(e) => set("format", e.target.value)}>{FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></Field>
        <Field label="Tema"><Input value={draft.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder="Ex.: dívidas" /></Field>
        {METRICS.map((m) => (
          <Field key={m.key} label={m.label}>
            <Input type="number" inputMode="numeric" min={m.key === "followers_gained" ? undefined : 0} value={draft[m.key] ?? ""}
              onChange={(e) => set(m.key, e.target.value === "" ? null : Number(e.target.value))} placeholder="0" />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
