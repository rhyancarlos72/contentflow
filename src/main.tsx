// Ponto de entrada: garante a configuração pública antes de carregar o app.
// Ordem de prioridade: embutida no HTML pelo server.js → /__config do servidor → build.
type PublicEnv = Record<string, string>;
const w = window as { __ENV__?: PublicEnv };

// Guarda o convite de instalação (Android/Chrome/Edge) para o botão "Instalar app".
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as { __installPrompt?: Event }).__installPrompt = e;
  window.dispatchEvent(new Event("cf:installable"));
});

async function start() {
  const hasKey = Boolean(w.__ENV__?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (!hasKey) {
    try {
      const res = await fetch("/__config", { cache: "no-store" });
      if (res.ok && res.headers.get("content-type")?.includes("json")) {
        w.__ENV__ = { ...(w.__ENV__ ?? {}), ...((await res.json()) as PublicEnv) };
      }
    } catch {
      // Sem servidor Node (hospedagem estática): vale a configuração do build.
    }
  }
  await import("./bootstrap");
  // Service worker: notificações push e instalação do app (PWA).
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }
}

void start();
