// Contexto do projeto para a IA: dados do projeto, memória estratégica
// (isolada por projeto) e histórico recente para evitar repetição.
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.118.0";
import { HttpError } from "./http.ts";
import type { PlanInfo } from "./supabase.ts";

const MEMORY_LABELS: Record<string, string> = {
  estilo: "Estilo de escrita",
  tom_de_voz: "Tom de voz",
  publico: "Público-alvo",
  assunto_abordado: "Assuntos já abordados (não repetir)",
  conteudo_aprovado: "Conteúdos aprovados pelo usuário (referência de qualidade)",
  preferencia: "Preferências do usuário",
  objetivo: "Objetivos",
  palavra_evitar: "Palavras e expressões proibidas",
};

export interface Project {
  id: string;
  name: string;
  kind: string;
  description: string;
  niche: string;
  audience: string;
  voice: string;
  platforms: string[];
  goals: string[];
  posts_per_week: number;
}

export async function loadProject(db: SupabaseClient, projectId: string): Promise<Project> {
  const { data, error } = await db.from("projects")
    .select("id, name, kind, description, niche, audience, voice, platforms, goals, posts_per_week")
    .eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "project_not_found", "Projeto não encontrado.");
  return data as Project;
}

export async function buildContext(db: SupabaseClient, project: Project, plan: PlanInfo): Promise<string> {
  const advanced = plan.features.includes("advanced_memory");
  const [memory, posts, ideas, top] = await Promise.all([
    db.from("ai_memory").select("kind, content").eq("project_id", project.id)
      .order("updated_at", { ascending: false }).limit(advanced ? 250 : 60),
    db.from("calendar_posts").select("title, format, content_pillar").eq("project_id", project.id)
      .order("scheduled_date", { ascending: false }).limit(advanced ? 120 : 50),
    db.from("content_ideas").select("title").eq("project_id", project.id)
      .order("created_at", { ascending: false }).limit(advanced ? 80 : 30),
    advanced
      ? db.from("analytics").select("title, format, topic, engagement_rate, saves, views")
        .eq("project_id", project.id).not("engagement_rate", "is", null)
        .order("engagement_rate", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  for (const r of [memory, posts, ideas, top]) if (r.error) throw r.error;

  const grouped = new Map<string, string[]>();
  for (const m of memory.data ?? []) {
    grouped.set(m.kind, [...(grouped.get(m.kind) ?? []), m.content]);
  }

  const lines: (string | null)[] = [
    `# Projeto: ${project.name}`,
    `Tipo: ${project.kind}`,
    project.description ? `Descrição: ${project.description}` : null,
    `Nicho: ${project.niche || "não informado"}`,
    `Público: ${project.audience || "não informado"}`,
    `Identidade de comunicação: ${project.voice || "não informada"}`,
    `Plataformas: ${project.platforms.join(", ") || "não informadas"}`,
    `Objetivos: ${project.goals.join(", ") || "não informados"}`,
    "",
    "# Memória estratégica do projeto",
  ];
  if (grouped.size === 0) lines.push("(vazia)");
  for (const [kind, items] of grouped) {
    lines.push(`## ${MEMORY_LABELS[kind] ?? kind}`, ...items.map((i) => `- ${i}`));
  }
  const postTitles = (posts.data ?? []).map((p) => `- ${p.title}${p.format ? ` (${p.format})` : ""}`);
  if (postTitles.length) lines.push("", "# Conteúdos já planejados ou publicados (evite repetir)", ...postTitles);
  const ideaTitles = (ideas.data ?? []).map((i) => `- ${i.title}`);
  if (ideaTitles.length) lines.push("", "# Ideias já salvas no banco (evite duplicar)", ...ideaTitles);
  if (top.data?.length) {
    lines.push("", "# Publicações com melhor engajamento registrado (dados reais do usuário)");
    for (const t of top.data) {
      lines.push(`- ${t.title} · ${t.format} · engajamento ${t.engagement_rate}% · ${t.saves} salvamentos · ${t.views} views`);
    }
  }
  return lines.filter((l) => l !== null).join("\n");
}
