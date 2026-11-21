// Cliente Google Gemini. A chave fica apenas no servidor (secret GEMINI_API_KEY).
// Modelo padrão: gemini-flash-latest (Flash mais recente, com plano gratuito na
// API). Troque com o secret GEMINI_MODEL.
import { ApiError, GoogleGenAI } from "npm:@google/genai@~2.31.0";
import type { ChatOptions, GenerateOptions, GenerateResult, StreamResult } from "./ai.ts";
import { HttpError, requireEnv } from "./http.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
// Modelo reserva quando o principal está sobrecarregado (comum no plano gratuito).
const GEMINI_FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-lite-latest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const overloaded = (err: unknown) => err instanceof ApiError && (err.status === 503 || err.status === 500 || err.status === 502 || err.status === 504);

/** Tenta o modelo principal (com 2 novas tentativas) e depois o modelo reserva. */
async function withRetry<T>(call: (model: string) => Promise<T>): Promise<{ value: T; model: string }> {
  const plan = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter((m, i, a) => m !== GEMINI_FALLBACK_MODEL || a.indexOf(m) === i);
  let last: unknown;
  for (let i = 0; i < plan.length; i++) {
    try {
      return { value: await call(plan[i]!), model: plan[i]! };
    } catch (err) {
      last = err;
      if (!overloaded(err)) throw err;
      console.warn(`Gemini ${plan[i]} sobrecarregado (tentativa ${i + 1})`);
      if (i < plan.length - 1) await sleep(800 * (i + 1));
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
    const out = await withRetry((model) => getClient().models.generateContent({
      model,
      contents: opts.images?.length
        ? [{ role: "user", parts: [{ text: opts.prompt }, ...opts.images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } }))] }]
        : opts.prompt,
      config: {
        systemInstruction: `${opts.system}\n\n${opts.context}`,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        maxOutputTokens: opts.maxTokens,
      },
    }));
    response = out.value;
    usedModel = out.model;
  } catch (err) {
    if (err instanceof ApiError) {
      console.error("Gemini API error", err.status, err.message);
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
    const { value: stream, model } = await withRetry((m) => getClient().models.generateContentStream({
      model: m,
      contents: opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: { systemInstruction: `${opts.system}\n\n${opts.context}`, maxOutputTokens: opts.maxTokens },
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
