import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AiTool =
  | "ideas" | "script" | "caption" | "hooks" | "cta" | "hashtags"
  | "plan" | "analytics_insights" | "suggestions" | "topics" | "content_review";

export class AiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
  get needsUpgrade() {
    return this.code === "plan_feature" || this.code === "monthly_limit" || this.code === "tool_limit";
  }
}

export interface AiResponse<T> {
  data: T;
  usage: { used: number; limit: number };
}

/** Chama a Edge Function ai-generate. A chave da IA fica somente no servidor. */
export async function generate<T>(tool: AiTool, projectId: string, input: Record<string, unknown> = {}): Promise<AiResponse<T>> {
  const { data, error } = await supabase.functions.invoke("ai-generate", {
    body: { tool, projectId, input },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null) as { error?: { code: string; message: string } } | null;
      if (body?.error) throw new AiError(body.error.code, body.error.message);
    }
    throw new AiError("network", "Não foi possível falar com a IA. Verifique sua conexão.");
  }
  return data as AiResponse<T>;
}

// ---- formatos de resposta de cada ferramenta ----
export interface IdeaResult { title: string; type: string; approach: string; audience: string; objective: string }
export interface ScriptResult {
  title: string; hook: string; development: string; core_message: string; conclusion: string; cta: string;
  full_script: string; estimated_seconds: number; recording_tips: string[];
}
export interface CaptionResult { captions: { label: string; text: string }[] }
export interface HookResult { hooks: { category: string; text: string; why_it_works: string }[] }
export interface CtaResult { ctas: { goal: string; text: string }[] }
export interface HashtagResult { groups: { label: string; hashtags: string[] }[]; notes: string }
export interface InsightsResult {
  summary: string;
  observations: { title: string; detail: string; evidence: string }[];
  next_steps: string[];
  data_caveats: string;
}
export interface SuggestionsResult {
  ideas: { title: string; format: string; pillar: string; why: string }[];
  recommendations: { title: string; detail: string }[];
}
export interface TopicsResult {
  topics: { title: string; angle: string; pillar: string; format: string; hook: string }[];
}
export type ReviewCriterion = "gancho" | "clareza" | "naturalidade" | "valor_entregue" | "adequacao_ao_publico" | "cta" | "legenda" | "capa_visual" | "hashtags";
export interface ContentReviewResult {
  summary: string;
  overall_score: number;
  audience_fit: { score: number; analysis: string; who_it_reaches: string; who_it_should_reach: string };
  scores: { criterion: ReviewCriterion; score: number; comment: string }[];
  strengths: { title: string; detail: string }[];
  improvements: { title: string; problem: string; suggestion: string; example: string }[];
  rewrites: { hooks: string[]; opening_script: string; caption: string; cta: string; hashtags: string[] };
  natural_language_tips: string[];
  metrics_reading: string;
  next_content_ideas: { title: string; why: string }[];
  data_caveats: string;
}
