// Cliente Google Gemini. A chave fica apenas no servidor (secret GEMINI_API_KEY).
// Modelo padrão: gemini-flash-latest (Flash mais recente, com plano gratuito na
// API). Troque com o secret GEMINI_MODEL.
import { ApiError, GoogleGenAI } from "@google/genai";
import type { GenerateOptions, GenerateResult } from "./ai.ts";
import { HttpError, requireEnv } from "./http.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}

export async function generateWithGemini<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  let response;
  try {
    response = await getClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: opts.prompt,
      config: {
        systemInstruction: `${opts.system}\n\n${opts.context}`,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        maxOutputTokens: opts.maxTokens,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      console.error("Gemini API error", err.status, err.message);
      if (err.status === 429) {
        throw new HttpError(503, "ai_busy",
          "Limite gratuito da IA atingido no momento. Aguarde um minuto e tente de novo.");
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
    model: GEMINI_MODEL,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
