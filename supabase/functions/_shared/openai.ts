// Cliente OpenAI (GPT) via Responses API. A chave fica apenas no servidor
// (secret OPENAI_API_KEY). Modelo padrão: gpt-5.5 — troque com OPENAI_MODEL
// (ex.: gpt-5.4-mini, mais barato).
import OpenAI from "npm:openai@~7.57.0";
import type { ChatOptions, GenerateOptions, GenerateResult, StreamResult } from "./ai.ts";
import { HttpError, requireEnv } from "./http.ts";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.5";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), maxRetries: 2 });
  return client;
}

const requestOptions = (deadline?: number) => {
  const left = deadline ? deadline - Date.now() - 3000 : 120_000;
  return { signal: AbortSignal.timeout(Math.max(5000, left)), maxRetries: left > 60_000 ? 1 : 0 };
};

function toHttpError(err: unknown): unknown {
  if (err instanceof OpenAI.APIUserAbortError || err instanceof OpenAI.APIConnectionTimeoutError ||
    (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))) {
    return new HttpError(504, "ai_timeout", "A OpenAI demorou demais para responder.");
  }
  if (err instanceof OpenAI.APIError) {
    console.error("OpenAI API error", err.status, err.message);
    if (err.status === 429 && (err.code === "insufficient_quota" || /credit|quota|billing/i.test(err.message))) {
      return new HttpError(503, "ai_quota", "A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com.");
    }
    if (err.status === 429) {
      return new HttpError(503, "ai_busy", "A OpenAI está com alta demanda. Tente em instantes.");
    }
    if (err.status === 401 || err.status === 403) {
      return new HttpError(503, "ai_not_configured", "Chave da OpenAI inválida ou sem permissão. Confira o secret OPENAI_API_KEY.");
    }
    if (err.status === 404) {
      return new HttpError(503, "ai_not_configured", `Modelo "${OPENAI_MODEL}" indisponível na sua conta OpenAI. Ajuste o secret OPENAI_MODEL.`);
    }
    return new HttpError(502, "ai_error", "A IA não conseguiu responder agora. Tente novamente.");
  }
  return err;
}

export async function generateWithOpenAI<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  let response: OpenAI.Responses.Response;
  try {
    response = await getClient().responses.create({
      model: OPENAI_MODEL,
      instructions: `${opts.system}\n\n${opts.context}`,
      input: opts.images?.length
        ? [{
          role: "user",
          content: [
            { type: "input_text", text: opts.prompt },
            ...opts.images.map((img) => ({ type: "input_image" as const, image_url: `data:${img.mediaType};base64,${img.data}`, detail: "auto" as const })),
          ],
        }]
        : opts.prompt,
      max_output_tokens: opts.maxTokens,
      reasoning: { effort: opts.effort },
      text: { format: { type: "json_schema", name: "resultado", schema: opts.schema, strict: true } },
    }, requestOptions(opts.deadline));
  } catch (err) {
    throw toHttpError(err);
  }

  if (response.status === "incomplete") {
    if (response.incomplete_details?.reason === "content_filter") {
      throw new HttpError(422, "ai_refused", "A IA não pôde gerar este conteúdo. Reformule o pedido.");
    }
    throw new HttpError(502, "ai_truncated", "A resposta ficou longa demais. Tente um pedido menor.");
  }
  const text = response.output_text;
  if (!text) throw new HttpError(422, "ai_refused", "A IA não pôde gerar este conteúdo. Reformule o pedido.");

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, "ai_invalid", "A IA retornou um formato inesperado. Tente novamente.");
  }
  return {
    data,
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

export async function* streamWithOpenAI(opts: ChatOptions, result: StreamResult): AsyncGenerator<string> {
  let stream;
  try {
    stream = await getClient().responses.create({
      model: OPENAI_MODEL,
      instructions: `${opts.system}\n\n${opts.context}`,
      input: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: opts.maxTokens,
      reasoning: { effort: "low" },
      stream: true,
    }, requestOptions(opts.deadline));
  } catch (err) {
    throw toHttpError(err);
  }
  result.model = OPENAI_MODEL;
  try {
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
      else if (event.type === "response.completed") {
        result.model = event.response.model;
        result.inputTokens = event.response.usage?.input_tokens ?? 0;
        result.outputTokens = event.response.usage?.output_tokens ?? 0;
      } else if (event.type === "error") {
        throw new HttpError(502, "ai_error", "A IA interrompeu a resposta. Tente novamente.");
      }
    }
  } catch (err) {
    throw toHttpError(err);
  }
}
