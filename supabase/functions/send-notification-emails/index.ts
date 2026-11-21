// Edge Function: send-notification-emails (despachante de lembretes)
// Executada por agendamento (pg_cron + pg_net, a cada hora). Gera as
// notificações do período e entrega pelos canais que o usuário ativou:
// - push nos aparelhos (iPhone/Android/desktop) — secrets VAPID_*;
// - e-mail via Resend — secrets RESEND_API_KEY e EMAIL_FROM.
// Protegida por CRON_SECRET no header Authorization.
// WhatsApp: ponto de extensão — implementar com a API oficial (WhatsApp Business Platform).
import { HttpError, json, requireEnv, serve } from "../_shared/http.ts";
import { pushConfigured, sendPushToUser } from "../_shared/push.ts";
import { admin } from "../_shared/supabase.ts";

interface Pending { id: string; user_id: string; title: string; body: string; link: string | null; pushed_at: string | null; emailed_at: string | null }
interface Prefs { email?: boolean; push?: boolean }
interface ProfileRow { id: string; email: string | null; full_name: string; notification_prefs: Prefs }

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: requireEnv("EMAIL_FROM"), to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

serve(async (req) => {
  // Aceita o secret CRON_SECRET ou a senha gerada no banco (app_secrets.cron_secret),
  // usada pelo agendamento pg_cron + pg_net.
  const auth = req.headers.get("Authorization") ?? "";
  const envSecret = Deno.env.get("CRON_SECRET");
  const { data: dbSecret } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  const valid = [envSecret, dbSecret?.value].filter(Boolean).some((s) => auth === `Bearer ${s}`);
  if (!valid) throw new HttpError(401, "unauthorized", "Não autorizado.");
  const { data: generated, error: genError } = await admin.rpc("generate_notifications");
  if (genError) throw genError;

  const emailOn = Boolean(Deno.env.get("RESEND_API_KEY"));
  const pushOn = pushConfigured();
  if (!emailOn && !pushOn) return json({ generated, pushed: 0, emailed: 0, canais: "nenhum configurado" });

  const { data: pending, error } = await admin.from("notifications")
    .select("id, user_id, title, body, link, pushed_at, emailed_at")
    .is("read_at", null)
    .or("pushed_at.is.null,emailed_at.is.null")
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("created_at")
    .limit(1000);
  if (error) throw error;

  const byUser = new Map<string, Pending[]>();
  for (const n of (pending ?? []) as Pending[]) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  if (!byUser.size) return json({ generated, pushed: 0, emailed: 0 });

  const { data: profiles, error: profError } = await admin.from("profiles")
    .select("id, email, full_name, notification_prefs").in("id", [...byUser.keys()]);
  if (profError) throw profError;
  const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const appUrl = Deno.env.get("APP_URL") ?? "";
  let pushed = 0;
  let emailed = 0;

  for (const [userId, items] of byUser) {
    const profile = profileMap.get(userId);
    if (!profile) continue;
    const prefs = profile.notification_prefs ?? {};

    // Push: uma notificação por lembrete (até 3); acima disso, um resumo.
    const toPush = items.filter((n) => !n.pushed_at);
    if (pushOn && prefs.push !== false && toPush.length) {
      try {
        let delivered = 0;
        if (toPush.length <= 3) {
          for (const n of toPush) {
            delivered += await sendPushToUser(userId, { title: n.title, body: n.body, url: n.link ?? "/app", tag: n.id });
          }
        } else {
          delivered = await sendPushToUser(userId, {
            title: `Você tem ${toPush.length} lembretes`,
            body: toPush.slice(0, 3).map((n) => `• ${n.title}`).join("\n"),
            url: "/app",
            tag: "resumo",
          });
        }
        // Marca como enviado mesmo sem aparelhos, para não reenviar a cada hora.
        await admin.from("notifications").update({ pushed_at: new Date().toISOString() }).in("id", toPush.map((n) => n.id));
        if (delivered) pushed += toPush.length;
      } catch (err) {
        console.error("Falha ao enviar push", err);
      }
    }

    // E-mail: um resumo por usuário que ativou o canal.
    const toEmail = items.filter((n) => !n.emailed_at);
    if (emailOn && prefs.email && profile.email && toEmail.length) {
      const list = toEmail.map((n) =>
        `<li style="margin-bottom:12px"><strong>${escape(n.title)}</strong><br>${escape(n.body)}` +
        (n.link && appUrl ? `<br><a href="${appUrl}${n.link}" style="color:#7952D6">Abrir no ContentFlow</a>` : "") + "</li>"
      ).join("");
      try {
        await sendEmail(profile.email, `ContentFlow AI: ${toEmail.length} lembrete(s)`,
          `<div style="font-family:Inter,Arial,sans-serif;color:#202033">
            <p>Olá${profile.full_name ? `, ${escape(profile.full_name.split(" ")[0]!)}` : ""}!</p>
            <ul style="padding-left:18px">${list}</ul>
            <p style="color:#858399;font-size:12px">Você pode desativar estes e-mails em Configurações → Notificações.</p>
          </div>`);
        await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", toEmail.map((n) => n.id));
        emailed += toEmail.length;
      } catch (err) {
        console.error("Falha ao enviar e-mail", err);
      }
    }
  }
  return json({ generated, pushed, emailed });
});
