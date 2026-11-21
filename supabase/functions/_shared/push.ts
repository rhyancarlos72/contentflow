// Envio de Web Push (VAPID + criptografia aes128gcm via web-push; envio com fetch).
// Chaves VAPID geradas e guardadas pelo servidor (ou via secrets VAPID_*); VAPID_SUBJECT opcional.
import webpush from "npm:web-push@3.6.7";
import { admin } from "./supabase.ts";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface VapidKeys { publicKey: string; privateKey: string }
let cached: VapidKeys | null = null;

/**
 * Chaves VAPID: usa os secrets VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY se existirem;
 * senão, gera um par na primeira vez e guarda em public.app_secrets (só o
 * servidor acessa). Assim o push funciona sem configuração manual.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cached) return cached;
  const envPub = Deno.env.get("VAPID_PUBLIC_KEY");
  const envPriv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (envPub && envPriv) return (cached = { publicKey: envPub, privateKey: envPriv });

  const read = async () => {
    const { data, error } = await admin.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
    if (error) throw error;
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
    return map.get("vapid_public") && map.get("vapid_private")
      ? { publicKey: map.get("vapid_public")!, privateKey: map.get("vapid_private")! }
      : null;
  };
  let keys = await read();
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    await admin.from("app_secrets").upsert([
      { key: "vapid_public", value: generated.publicKey },
      { key: "vapid_private", value: generated.privateKey },
    ], { onConflict: "key", ignoreDuplicates: true });
    keys = await read(); // outra instância pode ter gravado primeiro
  }
  if (!keys) throw new Error("Não foi possível obter as chaves de push.");
  return (cached = keys);
}

export const pushConfigured = () => true;

interface Subscription { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }

/** Envia para todos os aparelhos do usuário; remove assinaturas expiradas. Retorna quantos receberam. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const vapid = await getVapidKeys();
  const { data: subs, error } = await admin.from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  if (error) throw error;

  let delivered = 0;
  for (const sub of (subs ?? []) as Subscription[]) {
    try {
      const details = webpush.generateRequestDetails(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        {
          TTL: 60 * 60 * 24,
          vapidDetails: {
            subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@contentflow.ai",
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
        },
      );
      const res = await fetch(details.endpoint, {
        method: "POST",
        headers: details.headers as Record<string, string>,
        body: details.body,
      });
      if (res.status === 404 || res.status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else if (!res.ok) {
        console.error("push falhou", res.status, await res.text().catch(() => ""));
        if (sub.failure_count >= 9) await admin.from("push_subscriptions").delete().eq("id", sub.id);
        else await admin.from("push_subscriptions").update({ failure_count: sub.failure_count + 1 }).eq("id", sub.id);
      } else {
        delivered++;
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", sub.id);
      }
    } catch (err) {
      console.error("erro ao enviar push", err);
    }
  }
  return delivered;
}
