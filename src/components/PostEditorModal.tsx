import { useEffect, useState } from "react";
import { Copy, FolderKanban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FORMATS, PILLARS, PLATFORMS, POST_STATUSES } from "@/lib/constants";
import { useTableMutations } from "@/lib/queries";
import { toISODate } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { CalendarPost, ProductionStage, ProductionTask } from "@/types";
import { Button } from "./ui/Button";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { ConfirmDialog, Modal } from "./ui/Modal";

export type PostDraft = Partial<CalendarPost>;

const STATUS_TO_STAGE: Record<string, ProductionStage> = {
  ideia: "ideias", planejado: "planejamento", roteiro_pronto: "roteiro", gravacao_pendente: "gravacao",
  em_edicao: "edicao", aprovado: "revisao", agendado: "revisao", publicado: "publicado",
};

/** Remove campos controlados pelo servidor antes de gravar. */
function writable(p: PostDraft): PostDraft {
  const { id: _id, created_at: _c, updated_at: _u, published_at: _p, ...rest } = p;
  return rest;
}

export function emptyPost(date?: string, platform?: string): PostDraft {
  return {
    title: "", scheduled_date: date ?? toISODate(new Date()), scheduled_time: null,
    platform: platform ?? "instagram", format: "reels", status: "planejado", content_pillar: null,
    strategic_goal: "", hook: "", script_outline: "", caption: "", cta: "", hashtags: [], notes: "",
  };
}

/** Criação e edição de publicações do calendário (usado em várias telas). */
export function PostEditorModal({ open, onClose, initial, onSaved }: {
  open: boolean; onClose: () => void; initial: PostDraft | null; onSaved?: (post: CalendarPost) => void;
}) {
  const { project } = useWorkspace();
  const [draft, setDraft] = useState<PostDraft>(initial ?? emptyPost());
  const [hashtags, setHashtags] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { create, update, remove } = useTableMutations<CalendarPost>("calendar_posts");
  const tasks = useTableMutations<ProductionTask>("production_tasks");

  useEffect(() => {
    if (open) {
      const base = initial ?? emptyPost(undefined, project?.platforms[0]);
      setDraft(base);
      setHashtags((base.hashtags ?? []).join(" "));
    }
  }, [open, initial, project]);

  const set = <K extends keyof CalendarPost>(k: K, v: CalendarPost[K] | null) => setDraft((d) => ({ ...d, [k]: v }));
  const isEdit = Boolean(draft.id);

  const payload = (): PostDraft => ({
    ...draft,
    title: draft.title?.trim(),
    scheduled_time: draft.scheduled_time || null,
    hashtags: hashtags.split(/[\s,]+/).filter(Boolean).map((h) => "#" + h.replace(/^#+/, "")),
  });

  const save = async () => {
    if (!draft.title?.trim()) return toast.error("Dê um título para a publicação.");
    if (!draft.scheduled_date) return toast.error("Escolha uma data.");
    const rest = writable(payload());
    const saved = draft.id ? await update.mutateAsync({ id: draft.id, ...rest }) : (await create.mutateAsync(rest))[0]!;
    toast.success(isEdit ? "Publicação atualizada" : "Publicação adicionada ao calendário");
    onSaved?.(saved);
    onClose();
  };

  const duplicate = async () => {
    const rest = writable(payload());
    await create.mutateAsync({ ...rest, title: `${rest.title} (cópia)`, status: "planejado" });
    toast.success("Publicação duplicada");
    onClose();
  };

  const sendToProduction = async () => {
    if (!draft.id) return;
    await tasks.create.mutateAsync({
      title: draft.title, post_id: draft.id, platform: draft.platform ?? null,
      stage: STATUS_TO_STAGE[draft.status ?? "planejado"], due_date: draft.scheduled_date ?? null,
      notes: [draft.hook && `Gancho: ${draft.hook}`, draft.script_outline].filter(Boolean).join("\n\n"),
    });
    toast.success("Card criado no Kanban de produção");
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={isEdit ? "Editar publicação" : "Nova publicação"}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {isEdit && (
              <>
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Excluir</Button>
                <Button variant="ghost" size="sm" icon={<Copy className="h-4 w-4" />} onClick={duplicate}>Duplicar</Button>
                <Button variant="ghost" size="sm" icon={<FolderKanban className="h-4 w-4" />} onClick={sendToProduction} loading={tasks.create.isPending}>Enviar para produção</Button>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={save} loading={create.isPending || update.isPending}>Salvar</Button>
            </div>
          </div>
        }>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Título" className="sm:col-span-6">
            <Input autoFocus value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Sobre o que é esta publicação?" />
          </Field>
          <Field label="Data" className="sm:col-span-2">
            <Input type="date" value={draft.scheduled_date ?? ""} onChange={(e) => set("scheduled_date", e.target.value)} />
          </Field>
          <Field label="Horário" className="sm:col-span-2">
            <Input type="time" value={draft.scheduled_time?.slice(0, 5) ?? ""} onChange={(e) => set("scheduled_time", e.target.value || null)} />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <Select value={draft.status} onChange={(e) => set("status", e.target.value as CalendarPost["status"])}>
              {POST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Plataforma" className="sm:col-span-2">
            <Select value={draft.platform} onChange={(e) => set("platform", e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Formato" className="sm:col-span-2">
            <Select value={draft.format} onChange={(e) => set("format", e.target.value)}>
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              {draft.format && !FORMATS.some((f) => f.value === draft.format) && <option value={draft.format}>{draft.format}</option>}
            </Select>
          </Field>
          <Field label="Pilar de conteúdo" className="sm:col-span-2">
            <Select value={draft.content_pillar ?? ""} onChange={(e) => set("content_pillar", (e.target.value || null) as CalendarPost["content_pillar"])}>
              <option value="">Sem pilar</option>
              {PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Objetivo estratégico" className="sm:col-span-6">
            <Input value={draft.strategic_goal ?? ""} onChange={(e) => set("strategic_goal", e.target.value)} placeholder="Ex.: gerar salvamentos e mostrar autoridade" />
          </Field>
          <Field label="Gancho inicial" className="sm:col-span-6">
            <Input value={draft.hook ?? ""} onChange={(e) => set("hook", e.target.value)} placeholder="A primeira frase que prende a atenção" />
          </Field>
          <Field label="Roteiro ou estrutura" className="sm:col-span-6">
            <Textarea rows={5} value={draft.script_outline ?? ""} onChange={(e) => set("script_outline", e.target.value)} />
          </Field>
          <Field label="Legenda" className="sm:col-span-6">
            <Textarea rows={4} value={draft.caption ?? ""} onChange={(e) => set("caption", e.target.value)} />
          </Field>
          <Field label="CTA" className="sm:col-span-3">
            <Input value={draft.cta ?? ""} onChange={(e) => set("cta", e.target.value)} placeholder="Ex.: Salve para consultar depois" />
          </Field>
          <Field label="Hashtags" className="sm:col-span-3" hint="Separe por espaço">
            <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#financas #investimentos" />
          </Field>
          <Field label="Anotações" className="sm:col-span-6">
            <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir publicação?"
        loading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync(draft.id!);
          toast.success("Publicação excluída");
          setConfirmDelete(false);
          onClose();
        }} />
    </>
  );
}
