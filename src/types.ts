// Tipos de domínio espelhando o schema do banco (supabase/migrations).

export type PlanTier = "free" | "creator" | "pro";

export type PostStatus =
  | "ideia" | "planejado" | "roteiro_pronto" | "gravacao_pendente"
  | "em_edicao" | "aprovado" | "agendado" | "publicado";

export type ProductionStage =
  | "ideias" | "planejamento" | "roteiro" | "gravacao" | "edicao" | "revisao" | "publicado";

export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export type MemoryKind =
  | "estilo" | "tom_de_voz" | "publico" | "assunto_abordado" | "conteudo_aprovado"
  | "preferencia" | "objetivo" | "palavra_evitar";

export type Pillar = "educativo" | "emocional" | "informativo" | "entretenimento" | "vendas" | "autoridade" | "comunidade";

export interface NotificationPrefs {
  in_app: boolean;
  email: boolean;
  whatsapp: boolean;
  recording_reminders: boolean;
  scheduled_posts: boolean;
  overdue_tasks: boolean;
  weekly_planning: boolean;
  goals: boolean;
  weekly_report: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  niche: string | null;
  communication_style: string | null;
  preferred_language: string;
  weekly_goal: number;
  onboarding_completed: boolean;
  tutorial_completed: boolean;
  active_project_id: string | null;
  notification_prefs: NotificationPrefs;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  kind: string;
  niche: string;
  audience: string;
  voice: string;
  platforms: string[];
  goals: string[];
  posts_per_week: number;
  color: string;
  logo_url: string | null;
  archived: boolean;
  created_at: string;
}

export interface PlanLimits {
  plan: PlanTier;
  max_projects: number;
  monthly_ai_generations: number;
  max_plan_days: number;
  features: string[];
  tool_limits?: Record<string, number>;
}

export interface PlanStatus {
  plan: PlanTier;
  limits: PlanLimits;
  ai_used_this_month: number;
  tool_usage?: Record<string, number>;
  trial_ends_at?: string | null;
  projects_count: number;
  subscription: {
    plan: PlanTier;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    provider: string | null;
  } | null;
}

export interface SocialAccount {
  id: string;
  project_id: string;
  platform: string;
  handle: string;
  profile_url: string | null;
  followers: number | null;
  connection_type: "manual" | "oauth";
}

export interface IdeaCategory {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

export interface ContentIdea {
  id: string;
  project_id: string;
  category_id: string | null;
  title: string;
  description: string;
  niche: string;
  format: string | null;
  reference: string;
  inspiration_url: string | null;
  notes: string;
  is_favorite: boolean;
  source: "manual" | "ai";
  converted_script_id: string | null;
  converted_post_id: string | null;
  created_at: string;
}

export interface PlanItem {
  id: string;
  date: string;
  platform: string;
  format: string;
  theme: string;
  pillar: Pillar;
  strategic_goal: string;
  hook: string;
  script: string;
  caption: string;
  cta: string;
  hashtags: string[];
  post_id?: string | null;
}

export interface ContentPlan {
  id: string;
  project_id: string;
  title: string;
  days: 7 | 15 | 30;
  start_date: string;
  briefing: Record<string, unknown>;
  strategy_summary: string;
  items: PlanItem[];
  created_at: string;
}

export interface ScriptFolder {
  id: string;
  project_id: string;
  name: string;
}

export type ScriptStatus = "rascunho" | "em_revisao" | "aprovado" | "gravado" | "arquivado";

export interface Script {
  id: string;
  project_id: string;
  folder_id: string | null;
  idea_id: string | null;
  title: string;
  content: string;
  notes: string;
  duration_seconds: number | null;
  platform: string | null;
  format: string | null;
  status: ScriptStatus;
  source: "manual" | "ai";
  created_at: string;
  updated_at: string;
}

export interface CalendarPost {
  id: string;
  project_id: string;
  plan_id: string | null;
  script_id: string | null;
  idea_id: string | null;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  platform: string;
  format: string;
  status: PostStatus;
  content_pillar: Pillar | null;
  strategic_goal: string;
  hook: string;
  script_outline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  notes: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem { id: string; text: string; done: boolean }
export interface Attachment { path: string; name: string; size: number; type: string }

export interface ProductionTask {
  id: string;
  project_id: string;
  post_id: string | null;
  title: string;
  stage: ProductionStage;
  position: number;
  assignee: string;
  due_date: string | null;
  platform: string | null;
  priority: TaskPriority;
  notes: string;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsRecord {
  id: string;
  project_id: string;
  post_id: string | null;
  title: string;
  platform: string;
  format: string;
  topic: string;
  published_on: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  clicks: number;
  engagement_rate: number | null;
  source: "manual" | "api";
  created_at: string;
}

export interface MemoryEntry {
  id: string;
  project_id: string;
  kind: MemoryKind;
  content: string;
  source: "manual" | "onboarding" | "auto";
  created_at: string;
}

export type LibraryKind = "texto" | "legenda" | "gancho" | "cta" | "hashtags" | "roteiro" | "arquivo" | "link";

export interface LibraryItem {
  id: string;
  project_id: string;
  kind: LibraryKind;
  title: string;
  content: string;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  tags: string[];
  created_at: string;
}

export interface AppNotification {
  id: string;
  project_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
