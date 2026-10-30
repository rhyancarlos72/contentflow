import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookMarked, Copy, Download, ExternalLink, FileText, Hash, Link2, Megaphone, Plus, Search, Trash2, Type, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, EmptyState, Skeleton, Tabs } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { UpgradeGate } from "@/components/UpgradeGate";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { friendlyError, STORAGE_BUCKET, supabase } from "@/lib/supabase";
import { copyText, fmtBytes, fmtDate, uid } from "@/lib/utils";
import type { LibraryItem, LibraryKind } from "@/types";

const KINDS: { value: LibraryKind; label: string; icon: typeof Type }[] = [
  { value: "texto", label: "Texto", icon: Type }, { value: "legenda", label: "Legenda", icon: Type },
  { value: "gancho", label: "Gancho", icon: Zap }, { value: "cta", label: "CTA", icon: Megaphone },
  { value: "hashtags", label: "Hashtags", icon: Hash }, { value: "roteiro", label: "Roteiro", icon: FileText },
  { value: "arquivo", label: "Arquivo", icon: Upload }, { value: "link", label: "Link", icon: Link2 },
];
const kindMeta = (k: string) => KINDS.find((x) => x.value === k) ?? KINDS[0]!;

export default function Library() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Biblioteca de Conteúdo</h1>
        <p className="page-subtitle">Seus melhores textos, ganchos, CTAs, arquivos e referências do projeto, prontos para reutilizar.</p>
      </div>
      <UpgradeGate feature="library"><LibraryWorkspace /></UpgradeGate>
    </div>
  );
}

function LibraryWorkspace() {
  const items = useProjectRows<LibraryItem>("library_items");
  const { remove } = useTableMutations<LibraryItem>("library_items");
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const id = params.get("id");
    if (id && items.data) {
      setViewing(items.data.find((i) => i.id === id) ?? null);
      params.delete("id");
      setParams(params, { replace: true });
    }
  }, [params, items.data, setParams]);

  const filtered = (items.data ?? []).filter((i) => {
    const q = search.toLowerCase();
    return (kind === "todos" || i.kind === kind) && (!q || i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
  });

  const download = async (item: LibraryItem) => {
    if (!item.file_path) return;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(item.file_path, 60, { download: item.title });
    if (error) return toast.error(friendlyError(error));
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={kind} onChange={setKind} tabs={[{ value: "todos", label: "Todos" }, ...KINDS.map((k) => ({ value: k.value, label: k.label }))]} className="max-w-full" />
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Adicionar</Button>
      </div>

      {items.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : filtered.length === 0 ? (
        <Card><EmptyState icon={<BookMarked className="h-6 w-6" />} title={items.data?.length ? "Nada encontrado" : "Biblioteca vazia"}
          description="Salve resultados do Estúdio de IA com um clique, ou adicione textos, links e arquivos (imagens, vídeos, PDFs)."
          action={<Button onClick={() => setCreating(true)}>Adicionar item</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const meta = kindMeta(item.kind);
            return (
              <Card key={item.id} className="flex flex-col p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600"><meta.icon className="h-4 w-4" /></span>
                  <Badge>{meta.label}</Badge>
                  <span className="ml-auto text-[11px] text-ink-faint">{fmtDate(item.created_at)}</span>
                </div>
                <button onClick={() => setViewing(item)} className="mt-3 text-left">
                  <p className="line-clamp-2 font-semibold">{item.title}</p>
                  {item.content && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-ink-soft">{item.content}</p>}
                  {item.file_size && <p className="mt-1 text-xs text-ink-soft">{item.mime_type} · {fmtBytes(item.file_size)}</p>}
                </button>
                {item.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((t) => <span key={t} className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] text-ink-soft">#{t}</span>)}</div>}
                <div className="mt-auto flex gap-1 pt-3">
                  {item.content && <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await copyText(item.content); toast.success("Copiado"); }}>Copiar</Button>}
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />}>Abrir</Button></a>}
                  {item.file_path && <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => download(item)}>Baixar</Button>}
                  <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setDeleting(item)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateModal open={creating} onClose={() => setCreating(false)} />
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} size="lg"
        footer={viewing?.content ? <Button icon={<Copy className="h-4 w-4" />} onClick={async () => { await copyText(viewing.content); toast.success("Copiado"); }}>Copiar texto</Button> : undefined}>
        <p className="prose-script">{viewing?.content || viewing?.url || "Arquivo sem pré-visualização. Use “Baixar” no card."}</p>
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir item da biblioteca?"
        onConfirm={async () => {
          if (deleting!.file_path) await supabase.storage.from(STORAGE_BUCKET).remove([deleting!.file_path]);
          await remove.mutateAsync(deleting!.id);
          setDeleting(null);
        }} />
    </div>
  );
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { projectId } = useWorkspace();
  const { create } = useTableMutations<LibraryItem>("library_items");
  const [kind, setKind] = useState<LibraryKind>("texto");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setTitle(""); setContent(""); setUrl(""); setTags(""); setFile(null); setKind("texto"); };

  const save = async () => {
    if (kind === "arquivo" && !file) return toast.error("Escolha um arquivo.");
    if (kind === "link" && !/^https?:\/\//.test(url)) return toast.error("Informe um link válido (https://…).");
    const finalTitle = title.trim() || file?.name || url || content.slice(0, 60);
    if (!finalTitle) return toast.error("Dê um título ao item.");
    setSaving(true);
    try {
      let file_path: string | null = null;
      if (file) {
        if (file.size > 50 * 1024 * 1024) throw new Error("O arquivo passa de 50 MB.");
        file_path = `${user!.id}/${projectId}/biblioteca/${uid()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(file_path, file, { contentType: file.type });
        if (error) throw error;
      }
      await create.mutateAsync({
        kind, title: finalTitle.slice(0, 200), content, url: kind === "link" ? url : null, file_path,
        file_size: file?.size ?? null, mime_type: file?.type || null,
        tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
      });
      toast.success("Adicionado à biblioteca");
      reset();
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Adicionar à biblioteca"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as LibraryKind)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {kind === "arquivo" ? (
          <Field label="Arquivo" hint="Imagens, vídeos, PDFs e documentos de até 50 MB.">
            <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line px-4 py-8 text-sm text-ink-soft transition hover:border-brand-300 hover:bg-brand-50/40">
              <Upload className="mb-2 h-6 w-6 text-brand-500" />
              {file ? <span className="font-semibold text-ink">{file.name} · {fmtBytes(file.size)}</span> : "Clique para escolher um arquivo"}
            </button>
          </Field>
        ) : kind === "link" ? (
          <Field label="Link"><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
        ) : null}
        {kind !== "arquivo" && <Field label={kind === "link" ? "Anotações" : "Conteúdo"}><Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></Field>}
        <Field label="Tags" hint="Separe por vírgula ou espaço"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lançamento, black-friday" /></Field>
      </div>
    </Modal>
  );
}
