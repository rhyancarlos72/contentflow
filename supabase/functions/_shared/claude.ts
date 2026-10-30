// Cliente Claude usado pelas Edge Functions. A chave fica apenas no servidor
// (secret ANTHROPIC_API_KEY) e nunca chega ao navegador.
import Anthropic from "npm:@anthropic-ai/sdk@^1.3.0";
import { HttpError, requireEnv } from "./http.ts";

const CLAUDE_MODEL = Deno.env.get("AI_MODEL") ?? "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY"), maxRetries: 2 });
  return client;
}

import type { GenerateOptions, GenerateResult } from "./ai.ts";

/**
 * Gera uma resposta estruturada (JSON validado pelo schema).
 * - O prompt de sistema fixo vai primeiro com cache_control para reaproveitar cache.
 * - O contexto do projeto (memória, histórico) vem em seguida, por ser variável.
 * - Fallback de servidor ativado: se o modelo recusar, a API reprocessa em outro modelo.
 */
export async function generateWithClaude<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  const anthropic = getClient();
  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = anthropic.beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: opts.effort,
        format: { type: "json_schema", schema: opts.schema },
      },
      system: [
        { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.context },
      ],
      messages: [{ role: "user", content: opts.prompt }],
    });
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpError(503, "ai_busy", "A IA está com alta demanda. Tente em alguns instantes.");
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new HttpError(503, "ai_not_configured", "Integração de IA não configurada corretamente.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      throw new HttpError(502, "ai_error", "A IA não conseguiu responder agora. Tente novamente.");
    }
    throw err;
  }

  if (message.stop_reason === "refusal") {
    throw new HttpError(422, "ai_refused", "A IA não pôde gerar este conteúdo. Reformule o pedido.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new HttpError(502, "ai_truncated", "A resposta ficou longa demais. Tente um pedido menor.");
  }

  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, "ai_invalid", "A IA retornou um formato inesperado. Tente novamente.");
  }

  return {
    data,
    model: message.model,
    inputTokens: (message.usage.input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens ?? 0,
  };
}
