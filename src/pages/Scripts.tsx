import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Folder, FolderPlus, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/Modal";
import { UpgradeCard } from "@/components/UpgradeGate";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AiError, generate, type ScriptResult } from "@/lib/ai";
import { platformLabel, PLATFORMS } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { cn, fmtRelative } from "@/lib/utils";
import type { Script, ScriptFolder, ScriptStatus } from "@/types";

export const SCRIPT_STATUSES: { value: ScriptStatus; label: string; color: string }[] = [
  { value: "rascunho", label: "Rascunho", color: "#858399" },
  { value: "em_revisao", label: "Em revisão", color: "#E8A33D" },
  { value: "aprovado", label: "Aprovado", color: "#20B486" },
  { value: "gravado", label: "Gravado", color: "#4F7BE8" },
  { value: "arquivado", label: "Arquivado", color: "#B9B7C9" },
];

export default function Scripts() {
  const scripts = useProjectRows<Script>("scripts", { order: "updated_at" });
  const folders = useProjectRows<ScriptFolder>("script_folders", { order: "name", ascending: true });
  const scriptMut = useTableMutations<Script>("scripts");
  const folderMut = useTableMutations<ScriptFolder>("script_folders");
  const navigate = useNavigate();
  const [folder, setFolder] = useState<string>("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const filtered = (scripts.data ?? []).filter((s) => {
    const q = search.toLowerCase();
    return (!folder || (folder === "none" ? !s.folder_id : s.folder_id === folder))
      && (!status || s.status === status)
      && (!q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
  });

  const createManual = async () => {
    const [s] = await scriptMut.create.mutateAsync({ title: "Novo roteiro", folder_id: folder && folder !== "none" ? folder : null });
    navigate(`/roteiros/${s!.id}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Meus Roteiros</h1>
          <p className="page-subtitle">Escreva, organize em pastas e transforme roteiros em publicações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAiOpen(true)}>Gerar com IA</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={createManual} loading={scriptMut.create.isPending}>Novo roteiro</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {[{ id: "", name: "Todos os roteiros" }, { id: "none", name: "Sem pasta" }, ...(folders.data ?? [])].map((f) => (
            <div key={f.id} className={cn("group flex items-center gap-2 rounded-xl px-3 py-2", folder === f.id ? "bg-brand-50 text-brand-700" : "hover:bg-canvas")}>
              <button onClick={() => setFolder(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold">
                {f.id === "" ? <FileText className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-ink-faint">
                  {(scripts.data ?? []).filter((s) => f.id === "" || (f.id === "none" ? !s.folder_id : s.folder_id === f.id)).length}
                </span>
              </button>
              {f.id && f.id !== "none" && (
                <button onClick={() => { folderMut.remove.mutate(f.id); if (folder === f.id) setFolder(""); }}
                  className="hidden text-ink-faint hover:text-[#D93A4A] group-hover:block" aria-label={`Excluir pasta ${f.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {newFolder === null ? (
            <button onClick={() => setNewFolder("")} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-canvas hover:text-brand-600">
              <FolderPlus className="h-4 w-4" /> Nova pasta
            </button>
          ) : (
            <form className="mt-1 p-1" onSubmit={async (e) => {
              e.preventDefault();
              if (!newFolder.trim()) return setNewFolder(null);
              await folderMut.create.mutateAsync({ name: newFolder.trim() });
              setNewFolder(null);
            }}>
              <Input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder && setNewFolder(null)} placeholder="Nome da pasta" />
            </form>
          )}
        </Card>

        <div className="min-w-0 space-y-3">
          <Card className="flex flex-wrap gap-2 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input className="pl-9" placeholder="Buscar por título ou texto…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="w-full sm:w-48">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Todos os status</option>
                {SCRIPT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
          </Card>

          {scripts.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : filtered.length === 0 ? (
            <Card><EmptyState icon={<FileText className="h-6 w-6" />} title={scripts.data?.length ? "Nenhum roteiro encontrado" : "Nenhum roteiro ainda"}
              description="Escreva do zero ou peça para a IA criar um roteiro natural, com gancho, desenvolvimento e CTA."
              action={<div className="flex gap-2"><Button onClick={createManual}>Escrever roteiro</Button><Button variant="secondary" onClick={() => setAiOpen(true)}>Gerar com IA</Button></div>} /></Card>
          ) : (
            <Card className="divide-y divide-line">
              {filtered.map((s) => {
                const st = SCRIPT_STATUSES.find((x) => x.value === s.status)!;
                const f = folders.data?.find((x) => x.id === s.folder_id);
                return (
                  <button key={s.id} onClick={() => navigate(`/roteiros/${s.id}`)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-canvas">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.title}</p>
                      <p className="truncate text-xs text-ink-soft">
                        {[s.platform && platformLabel(s.platform), s.duration_seconds && `${s.duration_seconds}s`, f?.name, `editado ${fmtRelative(s.updated_at)}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {s.source === "ai" && <Badge color="#5935A8" className="hidden sm:inline-flex">IA</Badge>}
                    <Badge color={st.color}>{st.label}</Badge>
                  </button>
                );
              })}
            </Card>
          )}
        </div>
      </div>
      <GenerateScriptModal open={aiOpen} onClose={() => setAiOpen(false)} folderId={folder && folder !== "none" ? folder : null} />
    </div>
  );
}

function GenerateScriptModal({ open, onClose, folderId }: { open: boolean; onClose: () => void; folderId: string | null }) {
  const { project, hasFeature, refetchPlan } = useWorkspace();
  const { create } = useTableMutations<Script>("scripts");
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("camera");
  const [duration, setDuration] = useState("30");
  const [platform, setPlatform] = useState(project?.platforms[0] ?? "instagram");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!topic.trim()) return toast.error("Descreva o tema do roteiro.");
    setLoading(true);
    try {
      const res = await generate<ScriptResult>("script", project!.id, { topic, type, duration: Number(duration), platform: platformLabel(platform) });
      const [s] = await create.mutateAsync({
        title: res.data.title, content: res.data.full_script, duration_seconds: Number(duration), platform, format: type,
        source: "ai", folder_id: folderId, notes: res.data.recording_tips.map((t) => `• ${t}`).join("\n"),
      });
      refetchPlan();
      onClose();
      navigate(`/roteiros/${s!.id}`);
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : "Erro ao gerar roteiro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Gerar roteiro com IA" description="O roteiro é salvo automaticamente em Meus Roteiros."
      footer={hasFeature("ai_scripts") && <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button icon={<Wand2 className="h-4 w-4" />} loading={loading} onClick={run}>Gerar roteiro</Button></>}>
      {!hasFeature("ai_scripts") ? <UpgradeCard feature="ai_scripts" compact /> : (
        <div className="space-y-4">
          <Field label="Tema"><Textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: 3 hábitos que fazem você gastar mais sem perceber" /></Field>
          <Field label="Tipo"><Chips value={[type]} onChange={(v) => setType(v[0] ?? "camera")} options={[
            { value: "camera", label: "Falando para a câmera" }, { value: "reels_narrado", label: "Reels narrado" }, { value: "react", label: "React" },
            { value: "tiktok", label: "TikTok" }, { value: "shorts", label: "Shorts" }, { value: "motivacional", label: "Motivacional" },
            { value: "educativo", label: "Educativo" }, { value: "vendas", label: "Vendas" },
          ]} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Duração"><Chips value={[duration]} onChange={(v) => setDuration(v[0] ?? "30")} options={["15", "30", "45", "60", "90"].map((d) => ({ value: d, label: `${d}s` }))} /></Field>
            <Field label="Plataforma"><Select value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
