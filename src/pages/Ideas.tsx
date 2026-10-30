import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, ExternalLink, FileText, Lightbulb, Pencil, Plus, Search, Star, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { emptyPost, PostEditorModal, type PostDraft } from "@/components/PostEditorModal";
import { Button } from "@/components/ui/Button";
import { VoiceInput, VoiceTextarea } from "@/components/Voice";
import { Field, Input, Select } from "@/components/ui/Field";
import { Badge, Card, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { FORMATS } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { cn, fmtDate } from "@/lib/utils";
import type { ContentIdea, IdeaCategory, Script } from "@/types";

const COLORS = ["#7952D6", "#4F7BE8", "#20B486", "#E8A33D", "#E8743D", "#D6337A", "#2BA7C2", "#858399"];

export default function Ideas() {
  const { project } = useWorkspace();
  const ideas = useProjectRows<ContentIdea>("content_ideas");
  const categories = useProjectRows<IdeaCategory>("idea_categories", { order: "name", ascending: true });
  const ideaMut = useTableMutations<ContentIdea>("content_ideas");
  const scriptMut = useTableMutations<Script>("scripts");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [editing, setEditing] = useState<Partial<ContentIdea> | null>(null);
  const [deleting, setDeleting] = useState<ContentIdea | null>(null);
  const [scheduling, setScheduling] = useState<{ idea: ContentIdea; draft: PostDraft } | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);

  useEffect(() => {
    const id = params.get("id");
    if (id && ideas.data) {
      const found = ideas.data.find((i) => i.id === id);
      if (found) setEditing(found);
      params.delete("id");
      setParams(params, { replace: true });
    }
  }, [params, ideas.data, setParams]);

  const catMap = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const filtered = (ideas.data ?? []).filter((i) => {
    const q = search.toLowerCase();
    return (!q || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q))
      && (!category || i.category_id === category) && (!favorites || i.is_favorite);
  });

  const toScript = async (idea: ContentIdea) => {
    const [script] = await scriptMut.create.mutateAsync({
      title: idea.title, idea_id: idea.id, format: idea.format,
      content: `GANCHO\n\n\nDESENVOLVIMENTO\n${idea.description}\n\n\nMENSAGEM CENTRAL\n\n\nCTA\n`,
      notes: [idea.notes, idea.reference && `Referência: ${idea.reference}`, idea.inspiration_url].filter(Boolean).join("\n"),
    });
    await ideaMut.update.mutateAsync({ id: idea.id, converted_script_id: script!.id });
    toast.success("Roteiro criado a partir da ideia");
    navigate(`/roteiros/${script!.id}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Banco de Ideias</h1>
          <p className="page-subtitle">Guarde tudo que pode virar conteúdo. Transforme em roteiro ou agende com um clique.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Tags className="h-4 w-4" />} onClick={() => setManagingCategories(true)}>Categorias</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ niche: project?.niche ?? "" })}>Nova ideia</Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Buscar ideias…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-52">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <button onClick={() => setFavorites((f) => !f)} className={cn("chip h-[42px] rounded-xl", favorites && "chip-active")}>
          <Star className={cn("h-4 w-4", favorites && "fill-current")} /> Favoritas
        </button>
      </Card>

      {ideas.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<Lightbulb className="h-6 w-6" />}
          title={ideas.data?.length ? "Nenhuma ideia com esses filtros" : "Seu banco de ideias está vazio"}
          description={ideas.data?.length ? "Tente outra busca." : "Anote inspirações aqui ou gere ideias no Estúdio de IA."}
          action={!ideas.data?.length && <div className="flex gap-2">
            <Button onClick={() => setEditing({ niche: project?.niche ?? "" })}>Anotar ideia</Button>
            <Button variant="secondary" onClick={() => navigate("/estudio")}>Gerar com IA</Button>
          </div>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((idea) => {
            const cat = idea.category_id ? catMap.get(idea.category_id) : undefined;
            return (
              <Card key={idea.id} className="group flex flex-col p-4 transition hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {cat && <Badge color={cat.color}>{cat.name}</Badge>}
                    {idea.source === "ai" && <Badge color="#5935A8">IA</Badge>}
                    {idea.converted_script_id && <Badge color="#2F57B8" bg="#ECF2FE">Virou roteiro</Badge>}
                    {idea.converted_post_id && <Badge color="#127757" bg="#E3F6EF">No calendário</Badge>}
                  </div>
                  <button onClick={() => ideaMut.update.mutate({ id: idea.id, is_favorite: !idea.is_favorite })}
                    aria-label={idea.is_favorite ? "Remover dos favoritos" : "Favoritar"}
                    className={cn("rounded-lg p-1 transition", idea.is_favorite ? "text-[#E8A33D]" : "text-ink-faint hover:text-[#E8A33D]")}>
                    <Star className={cn("h-[18px] w-[18px]", idea.is_favorite && "fill-current")} />
                  </button>
                </div>
                <button className="mt-2 text-left" onClick={() => setEditing(idea)}>
                  <h3 className="font-bold leading-snug">{idea.title}</h3>
                  {idea.description && <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{idea.description}</p>}
                </button>
                {idea.inspiration_url && (
                  <a href={idea.inspiration_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 truncate text-xs font-semibold text-brand-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Inspiração
                  </a>
                )}
                <p className="mt-auto pt-3 text-[11px] text-ink-faint">{fmtDate(idea.created_at)}{idea.niche && ` · ${idea.niche}`}</p>
                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
                  <Button size="sm" variant="soft" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => toScript(idea)} loading={scriptMut.create.isPending}>Roteiro</Button>
                  <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-3.5 w-3.5" />}
                    onClick={() => setScheduling({ idea, draft: { ...emptyPost(undefined, project?.platforms[0]), title: idea.title, idea_id: idea.id, script_outline: idea.description, notes: idea.notes } })}>Agendar</Button>
                  <div className="ml-auto flex">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(idea)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(idea)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <IdeaModal idea={editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />
      <CategoriesModal open={managingCategories} onClose={() => setManagingCategories(false)} categories={categories.data ?? []} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir ideia?"
        onConfirm={async () => { await ideaMut.remove.mutateAsync(deleting!.id); setDeleting(null); toast.success("Ideia excluída"); }} />
      <PostEditorModal open={Boolean(scheduling)} initial={scheduling?.draft ?? null} onClose={() => setScheduling(null)}
        onSaved={(post) => scheduling && ideaMut.update.mutate({ id: scheduling.idea.id, converted_post_id: post.id })} />
    </div>
  );
}

function IdeaModal({ idea, categories, onClose }: { idea: Partial<ContentIdea> | null; categories: IdeaCategory[]; onClose: () => void }) {
  const [draft, setDraft] = useState<Partial<ContentIdea>>({});
  const { create, update } = useTableMutations<ContentIdea>("content_ideas");
  useEffect(() => { if (idea) setDraft(idea); }, [idea]);
  const set = <K extends keyof ContentIdea>(k: K, v: ContentIdea[K] | null) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.title?.trim()) return toast.error("Dê um título para a ideia.");
    const values = {
      title: draft.title.trim(), description: draft.description ?? "", niche: draft.niche ?? "", category_id: draft.category_id || null,
      format: draft.format || null, reference: draft.reference ?? "", inspiration_url: draft.inspiration_url || null, notes: draft.notes ?? "",
    };
    if (draft.id) await update.mutateAsync({ id: draft.id, ...values });
    else await create.mutateAsync(values);
    toast.success(draft.id ? "Ideia atualizada" : "Ideia salva");
    onClose();
  };

  return (
    <Modal open={Boolean(idea)} onClose={onClose} title={draft.id ? "Editar ideia" : "Nova ideia"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={create.isPending || update.isPending}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" className="sm:col-span-2"><VoiceInput autoFocus value={draft.title ?? ""} onValueChange={(v) => set("title", v)} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><VoiceTextarea rows={3} value={draft.description ?? ""} onValueChange={(v) => set("description", v)} /></Field>
        <Field label="Categoria">
          <Select value={draft.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Formato">
          <Select value={draft.format ?? ""} onChange={(e) => set("format", e.target.value || null)}>
            <option value="">Indefinido</option>
            {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </Field>
        <Field label="Nicho"><Input value={draft.niche ?? ""} onChange={(e) => set("niche", e.target.value)} /></Field>
        <Field label="Referência"><Input value={draft.reference ?? ""} onChange={(e) => set("reference", e.target.value)} placeholder="Ex.: perfil @fulano, livro X" /></Field>
        <Field label="Link de inspiração" className="sm:col-span-2"><Input type="url" value={draft.inspiration_url ?? ""} onChange={(e) => set("inspiration_url", e.target.value)} placeholder="https://" /></Field>
        <Field label="Anotações" className="sm:col-span-2"><VoiceTextarea rows={3} value={draft.notes ?? ""} onValueChange={(v) => set("notes", v)} /></Field>
        {draft.created_at && <p className="text-xs text-ink-faint sm:col-span-2">Criada em {fmtDate(draft.created_at, "dd/MM/yyyy 'às' HH:mm")}</p>}
      </div>
    </Modal>
  );
}

function CategoriesModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: IdeaCategory[] }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const { create, remove } = useTableMutations<IdeaCategory>("idea_categories");
  const add = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
  };
  return (
    <Modal open={open} onClose={onClose} title="Categorias de ideias" description="Organize o banco do seu jeito." size="sm">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} loading={create.isPending} icon={<Plus className="h-4 w-4" />} aria-label="Adicionar" />
      </div>
      <div className="mt-3 flex gap-1.5">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} className={cn("h-6 w-6 rounded-full ring-offset-2 transition", color === c && "ring-2 ring-ink")} style={{ background: c }} />
        ))}
      </div>
      <div className="mt-4 space-y-1">
        {categories.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Nenhuma categoria ainda.</p>}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-canvas">
            <Dot color={c.color} className="h-2.5 w-2.5" /><span className="flex-1 text-sm font-semibold">{c.name}</span>
            <button onClick={() => remove.mutate(c.id)} className="text-ink-faint hover:text-[#D93A4A]" aria-label={`Excluir ${c.name}`}><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
