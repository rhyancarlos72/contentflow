import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PlanStatus, Project } from "@/types";
import { useAuth } from "./AuthContext";

interface WorkspaceState {
  projects: Project[];
  project: Project | null;
  projectId: string;
  setProject: (id: string) => Promise<void>;
  plan: PlanStatus | null;
  hasFeature: (feature: string) => boolean;
  refetchPlan: () => void;
  refetchProjects: () => void;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, profile, updateProfile } = useAuth();

  const projectsQuery = useQuery({
    queryKey: ["projects", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*")
        .eq("archived", false).order("created_at");
      if (error) throw error;
      return data as Project[];
    },
  });

  const planQuery = useQuery({
    queryKey: ["plan", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_plan_status");
      if (error) throw error;
      return data as PlanStatus;
    },
  });

  const projects = projectsQuery.data ?? [];
  const project = projects.find((p) => p.id === profile?.active_project_id) ?? projects[0] ?? null;

  // Mantém o projeto ativo persistido no perfil.
  useEffect(() => {
    if (project && profile && profile.active_project_id !== project.id) {
      updateProfile({ active_project_id: project.id }).catch(() => undefined);
    }
  }, [project, profile, updateProfile]);

  const value: WorkspaceState = {
    projects,
    project,
    projectId: project?.id ?? "",
    setProject: (id) => updateProfile({ active_project_id: id }),
    plan: planQuery.data ?? null,
    hasFeature: (f) => planQuery.data?.limits.features.includes(f) ?? false,
    refetchPlan: () => void planQuery.refetch(),
    refetchProjects: () => void projectsQuery.refetch(),
    loading: projectsQuery.isLoading || planQuery.isLoading,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace fora do WorkspaceProvider");
  return ctx;
}
