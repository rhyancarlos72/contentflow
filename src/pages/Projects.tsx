import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Brain, Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, Dot, EmptyState } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { GOALS, MEMORY_KINDS, platformLabel, PLATFORMS, PROJECT_KINDS } from "@/lib/constants";
import { friendlyError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { MemoryEntry, MemoryKind, Project } from "@/types";

const COLORS = ["#7952D6", "#4F7BE8", "#20B486", "#E8A33D", "#E8743D", "#D6337A", "#2BA7C2", "#202033"];

export default function Projects() {
  const { projects, project: active, setProject, refetchProjects, refetchPlan, plan } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const [memoryFor, setMemoryFor] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (params.get("novo")) {
      setEditing({ color: COLORS[projects.length % COLORS.length], platforms: [], goals: [], posts_per_week: 3, kind: "marca_pessoal" });
      params.delete("novo");
      setParams(params, { replace: true });
    }
  }, [params, setParams, projects.length]);

  const counts = useQuery({
    queryKey: ["project-counts", projects.map((p) => p.id).join()],
    enabled: projects.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("calendar_posts").select("project_id, status");
      if (error) throw error;
      const map = new Map<string, { total: number; published: number }>();
      for (const r of data as { project_id: string; status: string }[]) {
        const c = map.get(r.project_id) ?? { total: 0, published: 0 };
        c.total += 1;
        if (r.status === "publicado") c.published += 1;
        map.set(r.project_id, c);
      }
      return map;
    },
  });

  const limit = plan?.limits.max_projects ?? 1;
  const refresh = () => { refetchProjects(); refetchPlan(); qc.invalidateQueries({ queryKey: ["rows"] }); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Projetos e Clientes</h1>
          <p className="page-subtitle">Cada projeto tem calendário, biblioteca e memória de IA próprios — nada se mistura.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-soft">{projects.length} de {limit} projetos</span>
          <Button icon={<Plus className="h-4 w-4" />}
            onClick={() => projects.length >= limit
              ? toast.error(`Seu plano permite ${limit} projeto(s). Faça upgrade para criar mais.`, { action: { label: "Ver planos", onClick: () => navigate("/precos") } })
              : setEditing({ color: COLORS[projects.length % COLORS.length], platforms: [], goals: [], posts_per_week: 3, kind: "marca_pessoal" })}>
            Novo projeto
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const c = counts.data?.get(p.id);
          return (
            <Card key={p.id} className={cn("flex flex-col p-5 transition", p.id === active?.id && "ring-2 ring-brand-300")}>
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white" style={{ background: p.color }}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold">{p.name}</h3>
                  <p className="text-xs text-ink-soft">{PROJECT_KINDS.find((k) => k.value === p.kind)?.label} · {p.niche || "sem nicho"}</p>
                </div>
                {p.id === active?.id && <Badge color="#127757" bg="#E3F6EF"><Check className="h-3 w-3" />Ativo</Badge>}
              </div>
              {p.description && <p className="mt-3 line-clamp-2 text-sm text-ink-soft">{p.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.platforms.map((pl) => <Badge key={pl} color="#5E5C73" bg="#F3F2F8">{platformLabel(pl)}</Badge>)}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-canvas py-2"><p className="font-extrabold">{c?.total ?? 0}</p><p className="text-[11px] text-ink-soft">conteúdos</p></div>
                <div className="rounded-xl bg-canvas py-2"><p className="font-extrabold">{c?.published ?? 0}</p><p className="text-[11px] text-ink-soft">publicados</p></div>
                <div className="rounded-xl bg-canvas py-2"><p className="font-extrabold">{p.posts_per_week}</p><p className="text-[11px] text-ink-soft">por semana</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {p.id !== active?.id && <Button size="sm" variant="soft" onClick={() => { setProject(p.id); toast.success(`Projeto “${p.name}” ativado`); }}>Usar este projeto</Button>}
                <Button size="sm" variant="ghost" icon={<Brain className="h-4 w-4" />} onClick={() => setMemoryFor(p)}>Memória da IA</Button>
                <div className="ml-auto flex">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(p)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                  {projects.length > 1 && <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <ProjectModal project={editing} onClose={() => setEditing(null)} onSaved={(p, isNew) => { refresh(); if (isNew) setProject(p.id); }} />
      <MemoryModal project={memoryFor} onClose={() => setMemoryFor(null)} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Excluir “${deleting?.name}”?`}
        description="Todo o conteúdo do projeto (calendário, ideias, roteiros, tarefas, métricas, memória e biblioteca) será apagado. Se preferir guardar o histórico, arquive."
        onConfirm={async () => {
          const { error } = await supabase.from("projects").delete().eq("id", deleting!.id);
          if (error) return toast.error(friendlyError(error));
          if (deleting!.id === active?.id) await setProject(projects.find((p) => p.id !== deleting!.id)!.id);
          setDeleting(null);
          refresh();
          toast.success("Projeto excluído");
        }} />
    </div>
  );
}

function ProjectModal({ project, onClose, onSaved }: { project: Partial<Project> | null; onClose: () => void; onSaved: (p: Project, isNew: boolean) => void }) {
  const { user } = useAuth();
  const { projects } = useWorkspace();
  const [draft, setDraft] = useState<Partial<Project>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (project) setDraft(project); }, [project]);
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.name?.trim()) return toast.error("Dê um nome ao projeto.");
    setSaving(true);
    const values = {
      name: draft.name.trim(), description: draft.description ?? "", kind: draft.kind ?? "marca_pessoal", niche: draft.niche ?? "",
      audience: draft.audience ?? "", voice: draft.voice ?? "", platforms: draft.platforms ?? [], goals: draft.goals ?? [],
      posts_per_week: draft.posts_per_week ?? 3, color: draft.color ?? "#7952D6",
    };
    const q = draft.id
      ? supabase.from("projects").update(values).eq("id", draft.id).select().single()
      : supabase.from("projects").insert({ ...values, user_id: user!.id }).select().single();
    const { data, error } = await q;
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(draft.id ? "Projeto atualizado" : "Projeto criado");
    onSaved(data as Project, !draft.id);
    onClose();
  };

  const archive = async () => {
    if (!draft.id) return;
    if (projects.length <= 1) return toast.error("Você precisa de pelo menos um projeto ativo.");
    const { error } = await supabase.from("projects").update({ archived: true }).eq("id", draft.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("Projeto arquivado");
    onSaved(draft as Project, false);
    onClose();
  };

  return (
    <Modal open={Boolean(project)} onClose={onClose} size="lg" title={draft.id ? "Editar projeto" : "Novo projeto"}
      footer={<div className="flex w-full gap-2">
        {draft.id && <Button variant="ghost" size="sm" icon={<Archive className="h-4 w-4" />} onClick={archive}>Arquivar</Button>}
        <div className="ml-auto flex gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></div>
      </div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input autoFocus value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Clínica Sorriso" /></Field>
        <Field label="Tipo"><Select value={draft.kind} onChange={(e) => set("kind", e.target.value)}>{PROJECT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Descrição" className="sm:col-span-2"><Textarea rows={2} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Nicho"><Input value={draft.niche ?? ""} onChange={(e) => set("niche", e.target.value)} /></Field>
        <Field label="Publicações por semana"><Input type="number" min={0} max={50} value={draft.posts_per_week ?? 3} onChange={(e) => set("posts_per_week", Number(e.target.value))} /></Field>
        <Field label="Público" className="sm:col-span-2"><Textarea rows={2} value={draft.audience ?? ""} onChange={(e) => set("audience", e.target.value)} /></Field>
        <Field label="Identidade de comunicação" className="sm:col-span-2" hint="Como esta marca fala. A IA segue isso em todas as gerações.">
          <Textarea rows={2} value={draft.voice ?? ""} onChange={(e) => set("voice", e.target.value)} placeholder="Ex.: acolhedora, técnica sem ser fria, usa “você”, sem gírias" />
        </Field>
        <Field label="Plataformas" className="sm:col-span-2"><Chips multiple options={PLATFORMS} value={draft.platforms ?? []} onChange={(v) => set("platforms", v)} /></Field>
        <Field label="Objetivos" className="sm:col-span-2"><Chips multiple options={GOALS.map((g) => ({ value: g, label: g }))} value={draft.goals ?? []} onChange={(v) => set("goals", v)} /></Field>
        <Field label="Cor do projeto" className="sm:col-span-2">
          <div className="flex gap-2">
            {COLORS.map((c) => <button key={c} onClick={() => set("color", c)} aria-label={`Cor ${c}`} className={cn("h-8 w-8 rounded-xl ring-offset-2 transition", draft.color === c && "ring-2 ring-ink")} style={{ background: c }} />)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function MemoryModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { user } = useAuth();
  const { hasFeature } = useWorkspace();
  const qc = useQueryClient();
  const [kind, setKind] = useState<MemoryKind>("estilo");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const key = ["memory", project?.id];

  const memory = useQuery({
    queryKey: key,
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_memory").select("*").eq("project_id", project!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as MemoryEntry[];
    },
  });
  const grouped = useMemo(() => MEMORY_KINDS.map((k) => ({ ...k, items: (memory.data ?? []).filter((m) => m.kind === k.value) })), [memory.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const add = async () => {
    if (!content.trim()) return;
    const { error } = await supabase.from("ai_memory").insert({ user_id: user!.id, project_id: project!.id, kind, content: content.trim(), source: "manual" });
    if (error) return toast.error(friendlyError(error));
    setContent("");
    refresh();
  };
  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("ai_memory").update({ content: editText.trim() }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    setEditingId(null);
    refresh();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("ai_memory").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    refresh();
  };

  return (
    <Modal open={Boolean(project)} onClose={onClose} size="lg" title={<span className="flex items-center gap-2"><Brain className="h-5 w-5 text-brand-500" />Memória estratégica · {project?.name}</span>}
      description="O que a IA sabe sobre este projeto. Ela consulta essa memória antes de cada geração e nunca usa a memória de outro projeto.">
      <div className="rounded-2xl border border-line bg-canvas/60 p-4">
        <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
          <Select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} aria-label="Tipo de memória">
            {MEMORY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
          <Input value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={MEMORY_KINDS.find((k) => k.value === kind)?.hint} />
          <Button onClick={add} icon={<Plus className="h-4 w-4" />}>Adicionar</Button>
        </div>
        <p className="hint mt-2 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-brand-500" />
          Assuntos e conteúdos aprovados/publicados entram aqui automaticamente.
          {hasFeature("advanced_memory") ? " Memória avançada ativa: a IA considera até 250 itens e seus melhores resultados." : " No plano Pro a IA também aprende com as métricas de melhor desempenho."}
        </p>
      </div>

      {memory.data?.length === 0 ? (
        <EmptyState icon={<Brain className="h-6 w-6" />} title="Memória vazia" description="Adicione estilo de escrita, tom de voz e palavras a evitar para respostas mais personalizadas." />
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.filter((g) => g.items.length).map((g) => (
            <div key={g.value}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{g.label} · {g.items.length}</p>
              <div className="space-y-1.5">
                {g.items.map((m) => (
                  <div key={m.id} className="group flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <Dot color={m.source === "auto" ? "#20B486" : m.source === "onboarding" ? "#4F7BE8" : "#7952D6"} />
                    {editingId === m.id ? (
                      <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); saveEdit(m.id); }}>
                        <Input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <Button type="submit" size="sm">Salvar</Button>
                      </form>
                    ) : (
                      <span className="flex-1 text-sm">{m.content}</span>
                    )}
                    {m.source !== "manual" && editingId !== m.id && <span className="text-[11px] text-ink-faint">{m.source === "auto" ? "automático" : "onboarding"}</span>}
                    {editingId !== m.id && (
                      <div className="flex opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => { setEditingId(m.id); setEditText(m.content); }} className="rounded-md p-1 text-ink-soft hover:text-brand-600" aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => del(m.id)} className="rounded-md p-1 text-ink-soft hover:text-[#D93A4A]" aria-label="Excluir"><X className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
