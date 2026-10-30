import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookMarked, CalendarDays, CornerDownLeft, FileText, FolderKanban, Lightbulb, Search } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/misc";
import { NAV_ITEMS } from "./Sidebar";

interface Result { kind: string; id: string; title: string; subtitle: string; project_id: string }

const KIND_META: Record<string, { label: string; icon: typeof Search; href: (id: string) => string }> = {
  post: { label: "Publicação", icon: CalendarDays, href: (id) => `/calendario?post=${id}` },
  idea: { label: "Ideia", icon: Lightbulb, href: (id) => `/ideias?id=${id}` },
  script: { label: "Roteiro", icon: FileText, href: (id) => `/roteiros/${id}` },
  task: { label: "Tarefa", icon: FolderKanban, href: (id) => `/producao?task=${id}` },
  library: { label: "Biblioteca", icon: BookMarked, href: (id) => `/biblioteca?id=${id}` },
};

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { projects, setProject, projectId } = useWorkspace();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => { if (!open) setTerm(""); }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("global_search", { p_query: debounced });
      if (error) throw error;
      return data as Result[];
    },
  });

  const pages = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(t)).slice(0, 4) : NAV_ITEMS.slice(0, 6);
  }, [term]);

  const items = [
    ...pages.map((p) => ({ key: p.to, label: p.label, sub: "Ir para página", icon: p.icon, go: () => navigate(p.to) })),
    ...(data ?? []).map((r) => {
      const meta = KIND_META[r.kind]!;
      const project = projects.find((p) => p.id === r.project_id);
      return {
        key: r.kind + r.id, label: r.title,
        sub: [meta.label, r.subtitle, projects.length > 1 ? project?.name : null].filter(Boolean).join(" · "),
        icon: meta.icon,
        go: async () => {
          if (r.project_id !== projectId) await setProject(r.project_id);
          navigate(meta.href(r.id));
        },
      };
    }),
  ];

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    item.go();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="-mx-1 flex items-center gap-3 border-b border-line pb-3">
        <Search className="h-5 w-5 text-ink-soft" />
        <input autoFocus value={term} placeholder="Buscar publicações, ideias, roteiros, tarefas…"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          onChange={(e) => { setTerm(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === "Enter") choose(cursor);
          }} />
        {isFetching && <Spinner className="h-4 w-4" />}
      </div>
      <ul className="-mx-2 mt-2 space-y-0.5">
        {items.map((item, i) => (
          <li key={item.key}>
            <button onMouseEnter={() => setCursor(i)} onClick={() => choose(i)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", i === cursor && "bg-brand-50")}>
              <item.icon className="h-4 w-4 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.label}</p>
                <p className="truncate text-xs text-ink-soft">{item.sub}</p>
              </div>
              {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 text-ink-faint" />}
            </button>
          </li>
        ))}
        {debounced.length >= 2 && !isFetching && data?.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-soft">Nada encontrado para “{debounced}”.</li>
        )}
      </ul>
    </Modal>
  );
}
