import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Check, Cloud, Copy, CopyPlus, FileDown, Loader2, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, EmptyState, PageLoader } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/Modal";
import { exportScriptPdf } from "@/lib/pdf";
import { PLATFORMS } from "@/lib/constants";
import { useProjectRows, useRow, useTableMutations } from "@/lib/queries";
import { friendlyError, supabase } from "@/lib/supabase";
import { copyText, estimateSeconds } from "@/lib/utils";
import type { Script, ScriptFolder } from "@/types";
import { SCRIPT_STATUSES } from "./Scripts";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
const EDITABLE: (keyof Script)[] = ["title", "content", "notes", "duration_seconds", "platform", "status", "folder_id"];

export default function ScriptEditor() {
  const { id } = useParams();
  const { data: script, isLoading } = useRow<Script>("scripts", id);
  const folders = useProjectRows<ScriptFolder>("script_folders", { order: "name", ascending: true });
  const { create, remove } = useTableMutations<Script>("scripts");
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Script | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [publishing, setPublishing] = useState<PostDraft | null>(null);
  const lastSaved = useRef<string>("");

  useEffect(() => {
    if (script && script.id !== draft?.id) {
      setDraft(script);
      lastSaved.current = JSON.stringify(pick(script));
    }
  }, [script]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salvamento automático com debounce.
  useEffect(() => {
    if (!draft) return;
    const snapshot = JSON.stringify(pick(draft));
    if (snapshot === lastSaved.current) return;
    setSaveState("pending");
    const t = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase.from("scripts").update(pick(draft)).eq("id", draft.id);
      if (error) {
        setSaveState("error");
        toast.error(friendlyError(error));
      } else {
        lastSaved.current = snapshot;
        setSaveState("saved");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [draft]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (saveState === "pending" || saveState === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  if (isLoading || (script && !draft)) return <PageLoader />;
  if (!script || !draft) {
    return <EmptyState icon={<FileDown className="h-6 w-6" />} title="Roteiro não encontrado" action={<Link to="/roteiros"><Button>Voltar</Button></Link>} />;
  }

  const set = <K extends keyof Script>(k: K, v: Script[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const estimated = estimateSeconds(draft.content);
  const words = draft.content.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/roteiros"><Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>Roteiros</Button></Link>
        <SaveIndicator state={saveState} />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={async () => { await copyText(draft.content); toast.success("Texto copiado"); }}>Copiar</Button>
          <Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => exportScriptPdf({ ...draft, updated_at: new Date().toISOString() })}>PDF</Button>
          <Button size="sm" variant="ghost" icon={<CopyPlus className="h-4 w-4" />} onClick={async () => {
            const [copy] = await create.mutateAsync({ ...pick(draft), title: `${draft.title} (cópia)`, status: "rascunho", source: draft.source });
            toast.success("Roteiro duplicado");
            navigate(`/roteiros/${copy!.id}`);
          }}>Duplicar</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Excluir</Button>
          <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setPublishing({
            ...emptyPost(undefined, draft.platform ?? undefined), title: draft.title, script_id: draft.id,
            script_outline: draft.content, status: "roteiro_pronto", notes: draft.notes,
          })}>Transformar em publicação</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="p-5 sm:p-8">
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Título do roteiro"
            className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-ink-faint" aria-label="Título" />
          <Textarea value={draft.content} onChange={(e) => set("content", e.target.value)} rows={22}
            placeholder={"Comece pelo gancho: a primeira frase que faz a pessoa parar de rolar.\n\nDepois desenvolva, entregue a mensagem central e feche com um CTA."}
            className="prose-script mt-4 min-h-[480px] resize-none border-0 bg-transparent px-0 focus:ring-0" aria-label="Roteiro" />
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-canvas p-3"><p className="text-xl font-extrabold">{words}</p><p className="text-xs text-ink-soft">palavras</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="flex items-center justify-center gap-1 text-xl font-extrabold"><Timer className="h-4 w-4 text-brand-500" />{estimated}s</p><p className="text-xs text-ink-soft">falados (estim.)</p></div>
            </div>
            <Field label="Duração alvo (segundos)">
              <Input type="number" min={5} max={3600} value={draft.duration_seconds ?? ""} onChange={(e) => set("duration_seconds", e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => set("status", e.target.value as Script["status"])}>
                {SCRIPT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Plataforma">
              <Select value={draft.platform ?? ""} onChange={(e) => set("platform", e.target.value || null)}>
                <option value="">Não definida</option>
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Pasta">
              <Select value={draft.folder_id ?? ""} onChange={(e) => set("folder_id", e.target.value || null)}>
                <option value="">Sem pasta</option>
                {(folders.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
          </Card>
          <Card className="p-5">
            <Field label="Observações">
              <Textarea rows={6} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Cenário, figurino, referências, cortes…" />
            </Field>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir roteiro?"
        onConfirm={async () => { await remove.mutateAsync(draft.id); toast.success("Roteiro excluído"); navigate("/roteiros"); }} />
      <PostEditorModal open={Boolean(publishing)} initial={publishing} onClose={() => setPublishing(null)}
        onSaved={() => toast.success("Roteiro enviado ao calendário", { action: { label: "Ver", onClick: () => navigate("/calendario") } })} />
    </div>
  );
}

function pick(s: Script): Partial<Script> {
  return Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as Partial<Script>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map = {
    idle: { icon: <Cloud className="h-3.5 w-3.5" />, text: "Salvamento automático" },
    pending: { icon: <Cloud className="h-3.5 w-3.5" />, text: "Alterações não salvas" },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Salvando…" },
    saved: { icon: <Check className="h-3.5 w-3.5 text-positive" />, text: "Salvo" },
    error: { icon: <Cloud className="h-3.5 w-3.5 text-[#D93A4A]" />, text: "Erro ao salvar" },
  }[state];
  return <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">{map.icon}{map.text}</span>;
}
