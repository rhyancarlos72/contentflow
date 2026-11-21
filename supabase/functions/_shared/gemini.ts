// Cliente Google Gemini. A chave fica apenas no servidor (secret GEMINI_API_KEY).
// Modelo padrão: gemini-flash-latest (Flash mais recente, com plano gratuito na
// API). Troque com o secret GEMINI_MODEL.
import { ApiError, GoogleGenAI, ThinkingLevel } from "npm:@google/genai@~2.31.0";
import type { ChatOptions, GenerateOptions, GenerateResult, StreamResult } from "./ai.ts";
import { HttpError, requireEnv } from "./http.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
// Modelo reserva quando o principal está sobrecarregado (comum no plano gratuito).
const GEMINI_FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-lite-latest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const overloaded = (err: unknown) => err instanceof ApiError && (err.status === 503 || err.status === 500 || err.status === 502 || err.status === 504);

// Raciocínio interno baixo deixa a resposta bem mais rápida; se o modelo não
// aceitar o parâmetro, as próximas chamadas seguem sem ele.
let thinkingSupported = true;
const thinking = () => (thinkingSupported ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {});

/**
 * Tenta o modelo principal e depois o modelo reserva, respeitando o prazo:
 * só faz nova tentativa se ainda houver tempo de sobra.
 */
async function withRetry<T>(deadline: number | undefined, call: (model: string, signal: AbortSignal) => Promise<T>): Promise<{ value: T; model: string }> {
  const plan = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter((m, i, a) => m !== GEMINI_FALLBACK_MODEL || a.indexOf(m) === i);
  const left = () => (deadline ? deadline - Date.now() : 120_000);
  let last: unknown;
  for (let i = 0; i < plan.length; i++) {
    if (i > 0 && left() < 40_000) break;
    const signal = AbortSignal.timeout(Math.max(5000, left() - 3000));
    try {
      return { value: await call(plan[i]!, signal), model: plan[i]! };
    } catch (err) {
      last = err;
      if (err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message) && thinkingSupported) {
        thinkingSupported = false;
        i--;
        continue;
      }
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new HttpError(504, "ai_timeout", "O Gemini demorou demais para responder.");
      }
      if (!overloaded(err)) throw err;
      console.warn(`Gemini ${plan[i]} sobrecarregado (tentativa ${i + 1})`);
      if (i < plan.length - 1) await sleep(700 * (i + 1));
    }
  }
  throw last;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}

export async function generateWithGemini<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  let response;
  let usedModel = GEMINI_MODEL;
  try {
    const out = await withRetry(opts.deadline, (model, signal) => getClient().models.generateContent({
      model,
      contents: opts.images?.length
        ? [{ role: "user", parts: [{ text: opts.prompt }, ...opts.images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } }))] }]
        : opts.prompt,
      config: {
        systemInstruction: `${opts.system}\n\n${opts.context}`,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        maxOutputTokens: opts.maxTokens,
        abortSignal: signal,
        ...thinking(),
      },
    }));
    response = out.value;
    usedModel = out.model;
  } catch (err) {
    if (err instanceof ApiError) {
      console.error("Gemini API error", err.status, err.message);
      if (err.status === 429 && /quota|billing|exceeded your current/i.test(err.message)) {
        throw new HttpError(503, "ai_quota", "O limite gratuito do Gemini acabou por hoje.");
      }
      if (err.status === 429) {
        throw new HttpError(503, "ai_busy",
          "Limite gratuito da IA atingido no momento. Aguarde um minuto e tente de novo.");
      }
      if (overloaded(err)) {
        throw new HttpError(503, "ai_busy", "O Gemini está sobrecarregado agora. Tente novamente em instantes.");
      }
      if (err.status === 400 && /api key/i.test(err.message)) {
        throw new HttpError(503, "ai_not_configured", "Chave do Gemini inválida. Confira o secret GEMINI_API_KEY.");
      }
      if (err.status === 401 || err.status === 403) {
        throw new HttpError(503, "ai_not_configured", "Chave do Gemini sem permissão. Confira o secret GEMINI_API_KEY.");
      }
      throw new HttpError(502, "ai_error", "A IA não conseguiu responder agora. Tente novamente.");
    }
    throw err;
  }

  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") {
    throw new HttpError(502, "ai_truncated", "A resposta ficou longa demais. Tente um pedido menor.");
  }
  const text = response.text;
  if (!text) {
    throw new HttpError(422, "ai_refused", "A IA não pôde gerar este conteúdo. Reformule o pedido.");
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, "ai_invalid", "A IA retornou um formato inesperado. Tente novamente.");
  }
  return {
    data,
    model: usedModel,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** Conversa em streaming com o Gemini. */
export async function* streamWithGemini(opts: ChatOptions, result: StreamResult): AsyncGenerator<string> {
  result.model = GEMINI_MODEL;
  try {
    const { value: stream, model } = await withRetry(opts.deadline, (m, signal) => getClient().models.generateContentStream({
      model: m,
      contents: opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: { systemInstruction: `${opts.system}\n\n${opts.context}`, maxOutputTokens: opts.maxTokens, abortSignal: signal, ...thinking() },
    }));
    result.model = model;
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
      if (chunk.usageMetadata) {
        result.inputTokens = chunk.usageMetadata.promptTokenCount ?? result.inputTokens;
        result.outputTokens = chunk.usageMetadata.candidatesTokenCount ?? result.outputTokens;
      }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      console.error("Gemini API error", err.status, err.message);
      if (err.status === 429 || overloaded(err)) throw new HttpError(503, "ai_busy", "O Gemini está sobrecarregado ou no limite gratuito. Tente em instantes.");
      throw new HttpError(502, "ai_error", "A IA não conseguiu responder agora. Tente novamente.");
    }
    throw err;
  }
}
