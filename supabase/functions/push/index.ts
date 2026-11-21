// Edge Function: push
// - { action: "config" } → chave pública VAPID para o navegador assinar.
// - { action: "test" }   → envia uma notificação de teste para os aparelhos do usuário.
import { HttpError, json, serve } from "../_shared/http.ts";
import { getVapidKeys, sendPushToUser } from "../_shared/push.ts";
import { authenticate } from "../_shared/supabase.ts";

serve(async (req) => {
  const { user } = await authenticate(req);
  const { action } = await req.json().catch(() => ({})) as { action?: string };

  if (action === "config") {
    const { publicKey } = await getVapidKeys();
    return json({ publicKey, configured: true });
  }
  if (action === "test") {
    const delivered = await sendPushToUser(user.id, {
      title: "ContentFlow AI 🎉",
      body: "Notificações ativadas! Você vai receber lembretes de gravação, publicações e metas aqui.",
      url: "/app",
      tag: "teste",
    });
    if (!delivered) throw new HttpError(404, "no_devices", "Nenhum aparelho ativo encontrado. Ative as notificações neste aparelho.");
    return json({ delivered });
  }
  throw new HttpError(400, "invalid_action", "Ação inválida.");
});
