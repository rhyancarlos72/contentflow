// Cliente do assistente (Edge Function ai-chat) com resposta em streaming NDJSON.
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { AiError } from "./ai";

export interface ChatEvents {
  onStart?: (conversationId: string, isNew: boolean) => void;
  onDelta: (text: string) => void;
  onDone?: (conversationId: string) => void;
}

export async function sendChatMessage(
  body: { projectId: string; conversationId?: string; message: string; style?: string },
  events: ChatEvents,
  signal?: AbortSignal,
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("unauthorized", "Sua sessão expirou. Entre novamente.");

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    throw new AiError("network", "Não foi possível falar com a IA. Verifique sua conexão.");
  }

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null) as { error?: { code: string; message: string } } | null;
    throw new AiError(err?.error?.code ?? "unknown", err?.error?.message ?? "A IA não conseguiu responder agora.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as { type: string; text?: string; conversationId?: string; isNew?: boolean; code?: string; message?: string };
        if (ev.type === "start") events.onStart?.(ev.conversationId!, Boolean(ev.isNew));
        else if (ev.type === "delta") events.onDelta(ev.text ?? "");
        else if (ev.type === "done") events.onDone?.(ev.conversationId!);
        else if (ev.type === "error") throw new AiError(ev.code ?? "ai_error", ev.message ?? "A IA não conseguiu responder.");
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    throw e;
  }
}
