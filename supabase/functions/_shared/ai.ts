// Camada de IA independente de provedor. Escolha com o secret AI_PROVIDER:
//   "gemini"    → Google Gemini (tem plano gratuito; secret GEMINI_API_KEY)
//   "anthropic" → Claude (pago; secret ANTHROPIC_API_KEY)
// Sem AI_PROVIDER, usa o Gemini se GEMINI_API_KEY existir; senão, o Claude.
import { HttpError } from "./http.ts";

export type Effort = "low" | "medium" | "high";

export interface GenerateOptions {
  system: string;
  context: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: Effort;
}

export interface GenerateResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function aiProvider(): "gemini" | "anthropic" {
  const explicit = Deno.env.get("AI_PROVIDER")?.toLowerCase();
  if (explicit === "gemini" || explicit === "anthropic") return explicit;
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  throw new HttpError(503, "ai_not_configured",
    "IA não configurada: adicione o secret GEMINI_API_KEY (gratuito) ou ANTHROPIC_API_KEY no Supabase.");
}

export async function generateStructured<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  if (aiProvider() === "gemini") {
    const { generateWithGemini } = await import("./gemini.ts");
    return generateWithGemini<T>(opts);
  }
  const { generateWithClaude } = await import("./claude.ts");
  return generateWithClaude<T>(opts);
}
