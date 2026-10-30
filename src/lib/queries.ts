// Camada de dados: hooks genéricos sobre as tabelas do projeto ativo.
// Todas as consultas passam pelo RLS do Supabase (o usuário só lê o que é dele).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { friendlyError, supabase } from "./supabase";

export type ProjectTable =
  | "calendar_posts" | "content_ideas" | "idea_categories" | "scripts" | "script_folders"
  | "production_tasks" | "analytics" | "ai_memory" | "library_items" | "content_plans" | "social_accounts";

interface ListOptions {
  order?: string;
  ascending?: boolean;
  /** Filtros simples de igualdade/intervalo aplicados no servidor. */
  gte?: [string, string];
  lte?: [string, string];
  eq?: [string, string | boolean];
  limit?: number;
  enabled?: boolean;
}

export function useProjectRows<T>(table: ProjectTable, opts: ListOptions = {}) {
  const { projectId } = useWorkspace();
  return useQuery({
    queryKey: ["rows", table, projectId, opts],
    enabled: Boolean(projectId) && opts.enabled !== false,
    queryFn: async () => {
      let q = supabase.from(table).select("*").eq("project_id", projectId);
      if (opts.gte) q = q.gte(...opts.gte);
      if (opts.lte) q = q.lte(...opts.lte);
      if (opts.eq) q = q.eq(...opts.eq);
      q = q.order(opts.order ?? "created_at", { ascending: opts.ascending ?? false });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return data as T[];
    },
  });
}

export function useRow<T>(table: ProjectTable, id: string | undefined) {
  return useQuery({
    queryKey: ["row", table, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as T | null;
    },
  });
}

/** Mutações com invalidação automática e feedback de erro. */
export function useTableMutations<T extends { id: string }>(table: ProjectTable) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { projectId } = useWorkspace();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rows", table] });
    qc.invalidateQueries({ queryKey: ["row", table] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onError = (e: unknown) => toast.error(friendlyError(e));

  const create = useMutation({
    mutationFn: async (values: Partial<T> | Partial<T>[]) => {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        project_id: projectId, ...v, user_id: user!.id,
      }));
      const { data, error } = await supabase.from(table).insert(rows).select();
      if (error) throw error;
      return data as T[];
    },
    onSuccess: invalidate,
    onError,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<T> & { id: string }) => {
      const { data, error } = await supabase.from(table).update(patch as Record<string, unknown>).eq("id", id).select().single();
      if (error) throw error;
      return data as T;
    },
    // Atualização otimista nas listas (arrastar no calendário/kanban fica instantâneo).
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["rows", table] });
      const snapshots = qc.getQueriesData<T[]>({ queryKey: ["rows", table] });
      for (const [key, rows] of snapshots) {
        if (Array.isArray(rows)) qc.setQueryData(key, rows.map((r) => (r.id === id ? ({ ...r, ...patch } as T) : r)));
      }
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, rows]) => qc.setQueryData(key, rows));
      onError(e);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });

  return { create, update, remove };
}
