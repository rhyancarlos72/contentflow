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
  /** Imagens opcionais (capa/print do conteúdo), em base64. */
  images?: { mediaType: string; data: string }[];
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

const KEYS: Record<Provider, string> = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
const hasKey = (p: Provider) => Boolean(Deno.env.get(KEYS[p]));

/**
 * Ordem de provedores: o escolhido em AI_PROVIDER primeiro, depois os demais
 * com chave configurada (OpenAI → Gemini → Claude). Se um falhar por
 * indisponibilidade, a mesma geração segue para o próximo automaticamente.
 */
export function providerChain(): Provider[] {
  const explicit = Deno.env.get("AI_PROVIDER")?.toLowerCase() as Provider | undefined;
  const order: Provider[] = ["openai", "gemini", "anthropic"];
  const chain = [...(explicit && order.includes(explicit) ? [explicit] : []), ...order]
    .filter((p, i, a) => a.indexOf(p) === i && hasKey(p));
  if (!chain.length) {
    throw new HttpError(503, "ai_not_configured",
      "IA não configurada: adicione no Supabase o secret OPENAI_API_KEY (GPT) ou GEMINI_API_KEY.");
  }
  return chain;
}

export const aiProvider = (): Provider => providerChain()[0]!;

/** Falhas em que vale tentar outro provedor (indisponível, sobrecarga, chave inválida, erro do serviço). */
const retryable = (err: unknown) => err instanceof HttpError && err.status >= 500;

/** Geração com resposta em JSON validado pelo schema. */
export async function generateStructured<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  const chain = providerChain();
  let last: unknown;
  for (const provider of chain) {
    try {
      switch (provider) {
        case "openai": return await (await import("./openai.ts")).generateWithOpenAI<T>(opts);
        case "gemini": return await (await import("./gemini.ts")).generateWithGemini<T>(opts);
        case "anthropic": return await (await import("./claude.ts")).generateWithClaude<T>(opts);
      }
    } catch (err) {
      last = err;
      if (!retryable(err)) throw err;
      console.warn(`Provedor ${provider} falhou; tentando o próximo.`, (err as Error).message);
    }
  }
  throw last;
}

function streamFrom(provider: Provider, opts: ChatOptions, result: StreamResult): Promise<AsyncGenerator<string>> {
  switch (provider) {
    case "openai": return import("./openai.ts").then((m) => m.streamWithOpenAI(opts, result));
    case "gemini": return import("./gemini.ts").then((m) => m.streamWithGemini(opts, result));
    case "anthropic": return import("./claude.ts").then((m) => m.streamWithClaude(opts, result));
  }
}

/**
 * Conversa com resposta em texto, entregue aos pedaços (streaming).
 * Se um provedor falhar antes de enviar o primeiro pedaço, tenta o próximo.
 */
export async function streamChat(opts: ChatOptions, result: StreamResult): Promise<AsyncGenerator<string>> {
  const chain = providerChain();
  return (async function* () {
    let last: unknown;
    for (const provider of chain) {
      let started = false;
      try {
        for await (const delta of await streamFrom(provider, opts, result)) {
          started = true;
          yield delta;
        }
        return;
      } catch (err) {
        last = err;
        if (started || !retryable(err)) throw err;
        console.warn(`Provedor ${provider} falhou no chat; tentando o próximo.`, (err as Error).message);
      }
    }
    throw last;
  })();
}
