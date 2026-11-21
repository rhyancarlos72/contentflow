// Camada de IA independente de provedor. Escolha com o secret AI_PROVIDER:
//   "openai"    → GPT (secret OPENAI_API_KEY, modelo em OPENAI_MODEL)
//   "gemini"    → Google Gemini (plano gratuito; secret GEMINI_API_KEY)
//   "anthropic" → Claude (secret ANTHROPIC_API_KEY)
// Sem AI_PROVIDER, usa o primeiro com chave configurada, nesta ordem.
import { HttpError } from "./http.ts";

export type Effort = "low" | "medium" | "high";
export type Provider = "openai" | "gemini" | "anthropic";

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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  system: string;
  context: string;
  messages: ChatMessage[];
  maxTokens: number;
}

/** Preenchido pelo provedor durante o streaming (modelo e tokens usados). */
export interface StreamResult {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function aiProvider(): Provider {
  const explicit = Deno.env.get("AI_PROVIDER")?.toLowerCase();
  if (explicit === "openai" || explicit === "gemini" || explicit === "anthropic") return explicit;
  if (Deno.env.get("OPENAI_API_KEY")) return "openai";
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  throw new HttpError(503, "ai_not_configured",
    "IA não configurada: adicione no Supabase o secret OPENAI_API_KEY (GPT), GEMINI_API_KEY ou ANTHROPIC_API_KEY.");
}

/** Geração com resposta em JSON validado pelo schema. */
export async function generateStructured<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  switch (aiProvider()) {
    case "openai": return (await import("./openai.ts")).generateWithOpenAI<T>(opts);
    case "gemini": return (await import("./gemini.ts")).generateWithGemini<T>(opts);
    case "anthropic": return (await import("./claude.ts")).generateWithClaude<T>(opts);
  }
}

/** Conversa com resposta em texto, entregue aos pedaços (streaming). */
export async function streamChat(opts: ChatOptions, result: StreamResult): Promise<AsyncGenerator<string>> {
  switch (aiProvider()) {
    case "openai": return (await import("./openai.ts")).streamWithOpenAI(opts, result);
    case "gemini": return (await import("./gemini.ts")).streamWithGemini(opts, result);
    case "anthropic": return (await import("./claude.ts")).streamWithClaude(opts, result);
  }
}
