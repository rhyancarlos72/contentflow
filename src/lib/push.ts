// Notificações push no navegador/celular (Web Push + service worker).
// iPhone/iPad: só funciona com o app instalado na Tela de Início (iOS 16.4+).
import { supabase } from "./supabase";

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export type PushState = "unsupported" | "needs-install" | "denied" | "default" | "granted";

export function pushState(): PushState {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const deviceLabel = () => (isIOS() ? "iPhone/iPad" : isAndroid() ? "Android" : /mac/i.test(navigator.userAgent) ? "Mac" : /win/i.test(navigator.userAgent) ? "Windows" : "Navegador");

/** Pede permissão, assina este aparelho e salva no servidor. */
export async function enablePush(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const state = pushState();
  if (state === "needs-install") return { ok: false, message: "No iPhone, instale o app na Tela de Início primeiro." };
  if (state === "unsupported") return { ok: false, message: "Este navegador não suporta notificações push." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Permissão negada. Libere as notificações nas configurações do navegador." };

  const { data: config, error } = await supabase.functions.invoke("push", { body: { action: "config" } });
  if (error || !config?.publicKey) return { ok: false, message: "Notificações ainda não configuradas no servidor." };

  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey as string),
    });
  }
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error: saveError } = await supabase.from("push_subscriptions").upsert({
    user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300), device_label: deviceLabel(), failure_count: 0,
  }, { onConflict: "endpoint" });
  if (saveError) return { ok: false, message: "Não foi possível salvar este aparelho. Tente novamente." };
  return { ok: true };
}

/** Desativa as notificações neste aparelho. */
export async function disablePush() {
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function sendTestPush(): Promise<string | null> {
  const { error } = await supabase.functions.invoke("push", { body: { action: "test" } });
  if (!error) return null;
  const body = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Não foi possível enviar o teste.";
}
