import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, CheckSquare, Flag, FolderKanban, Paperclip, Plus, Trash2, Upload, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Dot, ProgressBar, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { platformLabel, PLATFORMS, PRIORITIES, STAGES } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { friendlyError, STORAGE_BUCKET, supabase } from "@/lib/supabase";
import { cn, fmtBytes, fmtDate, toISODate, uid } from "@/lib/utils";
import type { Attachment, ProductionStage, ProductionTask } from "@/types";

export default function Production() {
  const tasks = useProjectRows<ProductionTask>("production_tasks", { order: "position", ascending: true });
  const { create, update } = useTableMutations<ProductionTask>("production_tasks");
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Partial<ProductionTask> | null>(null);
  const [dragOver, setDragOver] = useState<ProductionStage | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ stage: ProductionStage; title: string } | null>(null);
  const today = toISODate(new Date());

  useEffect(() => {
    const id = params.get("task");
    if (id && tasks.data) {
      const t = tasks.data.find((x) => x.id === id);
      if (t) setEditing(t);
      params.delete("task");
      setParams(params, { replace: true });
    }
  }, [params, tasks.data, setParams]);

  const columns = useMemo(() => STAGES.map((s) => ({
    ...s, items: (tasks.data ?? []).filter((t) => t.stage === s.value).sort((a, b) => a.position - b.position),
  })), [tasks.data]);

  const total = tasks.data?.length ?? 0;
  const done = columns.find((c) => c.value === "publicado")?.items.length ?? 0;

  const moveTo = (id: string, stage: ProductionStage) => {
    const col = columns.find((c) => c.value === stage)!;
    const position = (col.items.at(-1)?.position ?? 0) + 1;
    update.mutate({ id, stage, position });
  };

  const addQuick = async () => {
    if (!quickAdd?.title.trim()) return setQuickAdd(null);
    const col = columns.find((c) => c.value === quickAdd.stage)!;
    await create.mutateAsync({ title: quickAdd.title.trim(), stage: quickAdd.stage, position: (col.items.at(-1)?.position ?? 0) + 1 });
    setQuickAdd({ stage: quickAdd.stage, title: "" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Produção de Conteúdo</h1>
          <p className="page-subtitle">Acompanhe cada conteúdo da ideia à publicação. Arraste os cards entre as etapas.</p>
        </div>
        <div className="flex items-center gap-4">
          {total > 0 && (
            <div className="w-40">
              <p className="mb-1 text-xs font-semibold text-ink-soft">{done} de {total} publicados</p>
              <ProgressBar value={done} max={total} color="#20B486" />
            </div>
          )}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ stage: "ideias", priority: "media" })}>Nova tarefa</Button>
        </div>
      </div>

      {tasks.isLoading ? <Skeleton className="h-[480px] rounded-2xl" /> : (
        <div className="scrollbar-thin -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {columns.map((col) => (
            <div key={col.value}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.value); }}
              onDragLeave={() => setDragOver((d) => (d === col.value ? null : d))}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/task-id"); if (id) moveTo(id, col.value); }}
              className={cn("flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-white/60 transition",
                dragOver === col.value && "border-brand-300 bg-brand-50 ring-4 ring-brand-100")}>
              <div className="flex items-center gap-2 px-3.5 py-3">
                <Dot color={col.color} className="h-2.5 w-2.5" />
                <h3 className="text-sm font-bold">{col.label}</h3>
                <span className="rounded-full bg-canvas px-2 text-xs font-bold text-ink-soft">{col.items.length}</span>
                <button onClick={() => setQuickAdd({ stage: col.value, title: "" })} className="ml-auto rounded-lg p-1 text-ink-soft hover:bg-brand-50 hover:text-brand-700" aria-label={`Adicionar em ${col.label}`}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2.5 pb-3">
                {quickAdd?.stage === col.value && (
                  <form onSubmit={(e) => { e.preventDefault(); addQuick(); }}>
                    <Input autoFocus value={quickAdd.title} placeholder="Nome do conteúdo e Enter"
                      onChange={(e) => setQuickAdd({ ...quickAdd, title: e.target.value })}
                      onBlur={() => !quickAdd.title && setQuickAdd(null)} onKeyDown={(e) => e.key === "Escape" && setQuickAdd(null)} />
                  </form>
                )}
                {col.items.map((t) => {
                  const pr = PRIORITIES.find((p) => p.value === t.priority)!;
                  const checked = t.checklist.filter((c) => c.done).length;
                  const late = t.due_date && t.due_date < today && t.stage !== "publicado";
                  return (
                    <button key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)} onClick={() => setEditing(t)}
                      className="w-full cursor-grab rounded-xl border border-line bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card active:cursor-grabbing">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-semibold leading-snug">{t.title}</p>
                        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: pr.color }} aria-label={`Prioridade ${pr.label}`} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
                        {t.platform && <Badge color="#5E5C73" bg="#F3F2F8">{platformLabel(t.platform)}</Badge>}
                        {t.due_date && <span className={cn("flex items-center gap-1", late && "font-bold text-[#D93A4A]")}><CalendarClock className="h-3 w-3" />{fmtDate(t.due_date, "dd/MM")}</span>}
                        {t.checklist.length > 0 && <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3" />{checked}/{t.checklist.length}</span>}
                        {t.attachments.length > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{t.attachments.length}</span>}
                        {t.assignee && <span className="ml-auto flex items-center gap-1"><User className="h-3 w-3" />{t.assignee}</span>}
                      </div>
                      {t.checklist.length > 0 && <ProgressBar value={checked} max={t.checklist.length} className="mt-2 h-1" color={col.color} />}
                    </button>
                  );
                })}
                {col.items.length === 0 && quickAdd?.stage !== col.value && (
                  <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-6 text-center text-xs text-ink-faint">
                    <span><FolderKanban className="mx-auto mb-1 h-4 w-4" />Arraste cards para cá</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskModal task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TaskModal({ task, onClose }: { task: Partial<ProductionTask> | null; onClose: () => void }) {
  const { user } = useAuth();
  const { projectId } = useWorkspace();
  const { create, update, remove } = useTableMutations<ProductionTask>("production_tasks");
  const [draft, setDraft] = useState<Partial<ProductionTask>>({});
  const [newItem, setNewItem] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (task) setDraft({ checklist: [], attachments: [], ...task }); }, [task]);
  const set = <K extends keyof ProductionTask>(k: K, v: ProductionTask[K] | null) => setDraft((d) => ({ ...d, [k]: v }));
  const checklist = draft.checklist ?? [];
  const attachments = draft.attachments ?? [];

  const values = () => ({
    title: draft.title?.trim(), stage: draft.stage, assignee: draft.assignee ?? "", due_date: draft.due_date || null,
    platform: draft.platform || null, priority: draft.priority, notes: draft.notes ?? "", checklist, attachments,
  });

  // Anexos e checklist em tarefas existentes são salvos na hora.
  const persist = async (patch: Partial<ProductionTask>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (draft.id) await update.mutateAsync({ id: draft.id, ...patch });
  };

  const save = async () => {
    if (!draft.title?.trim()) return toast.error("Dê um nome ao conteúdo.");
    if (draft.id) await update.mutateAsync({ id: draft.id, ...values() });
    else await create.mutateAsync({ ...values(), position: Date.now() });
    toast.success("Tarefa salva");
    onClose();
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} passa de 50 MB.`); continue; }
        const path = `${user!.id}/${projectId}/tarefas/${uid()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type });
        if (error) throw error;
        added.push({ path, name: file.name, size: file.size, type: file.type });
      }
      await persist({ attachments: [...attachments, ...added] });
      if (added.length) toast.success(`${added.length} arquivo(s) anexado(s)`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const open = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(a.path, 60);
    if (error) return toast.error(friendlyError(error));
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const detach = async (a: Attachment) => {
    await supabase.storage.from(STORAGE_BUCKET).remove([a.path]);
    await persist({ attachments: attachments.filter((x) => x.path !== a.path) });
  };

  return (
    <>
      <Modal open={Boolean(task)} onClose={onClose} size="lg" title={draft.id ? "Detalhes da tarefa" : "Nova tarefa"}
        footer={<div className="flex w-full gap-2">
          {draft.id && <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Excluir</Button>}
          <div className="ml-auto flex gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={create.isPending || update.isPending}>Salvar</Button></div>
        </div>}>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Nome do conteúdo" className="sm:col-span-6"><Input autoFocus value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Etapa" className="sm:col-span-2">
            <Select value={draft.stage} onChange={(e) => set("stage", e.target.value as ProductionStage)}>{STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
          </Field>
          <Field label="Prioridade" className="sm:col-span-2">
            <Select value={draft.priority} onChange={(e) => set("priority", e.target.value as ProductionTask["priority"])}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>
          </Field>
          <Field label="Prazo" className="sm:col-span-2"><Input type="date" value={draft.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></Field>
          <Field label="Responsável" className="sm:col-span-3"><Input value={draft.assignee ?? ""} onChange={(e) => set("assignee", e.target.value)} placeholder="Ex.: Ana (edição)" /></Field>
          <Field label="Plataforma" className="sm:col-span-3">
            <Select value={draft.platform ?? ""} onChange={(e) => set("platform", e.target.value || null)}>
              <option value="">Não definida</option>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Anotações" className="sm:col-span-6"><Textarea rows={4} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>

          <div className="sm:col-span-6">
            <p className="label flex items-center gap-2">Checklist {checklist.length > 0 && <span className="text-xs font-semibold text-ink-soft">{checklist.filter((c) => c.done).length}/{checklist.length}</span>}</p>
            {checklist.length > 0 && <ProgressBar value={checklist.filter((c) => c.done).length} max={checklist.length} className="mb-2" />}
            <div className="space-y-1">
              {checklist.map((c) => (
                <div key={c.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-canvas">
                  <input type="checkbox" checked={c.done} className="h-4 w-4 accent-brand-500"
                    onChange={() => persist({ checklist: checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                  <span className={cn("flex-1 text-sm", c.done && "text-ink-soft line-through")}>{c.text}</span>
                  <button onClick={() => persist({ checklist: checklist.filter((x) => x.id !== c.id) })} className="hidden text-ink-faint hover:text-[#D93A4A] group-hover:block" aria-label="Remover item"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              persist({ checklist: [...checklist, { id: uid(), text: newItem.trim(), done: false }] });
              setNewItem("");
            }}>
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Adicionar item (ex.: gravar take 2)" />
              <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} aria-label="Adicionar item" />
            </form>
          </div>

          <div className="sm:col-span-6">
            <p className="label">Arquivos anexados</p>
            {!draft.id ? <p className="hint">Salve a tarefa para anexar arquivos.</p> : (
              <>
                <div className="space-y-1.5">
                  {attachments.map((a) => (
                    <div key={a.path} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <Paperclip className="h-4 w-4 text-brand-500" />
                      <button onClick={() => open(a)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-brand-600">{a.name}</button>
                      <span className="text-xs text-ink-faint">{fmtBytes(a.size)}</span>
                      <button onClick={() => detach(a)} className="text-ink-faint hover:text-[#D93A4A]" aria-label={`Remover ${a.name}`}><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
                <Button className="mt-2" variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>Anexar arquivos</Button>
              </>
            )}
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir tarefa?"
        onConfirm={async () => {
          if (attachments.length) await supabase.storage.from(STORAGE_BUCKET).remove(attachments.map((a) => a.path));
          await remove.mutateAsync(draft.id!);
          setConfirmDelete(false);
          onClose();
        }} />
    </>
  );
}
