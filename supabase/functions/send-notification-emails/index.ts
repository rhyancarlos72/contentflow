// Edge Function: send-notification-emails
// Executada por agendamento (pg_cron + pg_net ou cron externo). Gera as
// notificações do período e envia por e-mail (Resend) para quem ativou o canal.
// Protegida por CRON_SECRET no header Authorization.
// WhatsApp: ponto de extensão — implementar sendWhatsApp() com a API oficial
// (WhatsApp Business Platform) quando houver número aprovado.
import { HttpError, json, requireEnv, serve } from "../_shared/http.ts";
import { admin } from "../_shared/supabase.ts";

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
  if (req.headers.get("Authorization") !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    throw new HttpError(401, "unauthorized", "Não autorizado.");
  }
  const { data: generated, error: genError } = await admin.rpc("generate_notifications");
  if (genError) throw genError;

  if (!Deno.env.get("RESEND_API_KEY")) return json({ generated, emailed: 0, email: "não configurado" });

  const { data: pending, error } = await admin.from("notifications")
    .select("id, user_id, title, body, link, profiles!inner(email, full_name, notification_prefs)")
    .is("emailed_at", null).is("read_at", null)
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .limit(500);
  if (error) throw error;

  type Row = { id: string; user_id: string; title: string; body: string; link: string | null;
    profiles: { email: string | null; full_name: string; notification_prefs: Record<string, boolean> } };
  const byUser = new Map<string, Row[]>();
  for (const n of (pending ?? []) as unknown as Row[]) {
    if (!n.profiles.notification_prefs?.email || !n.profiles.email) continue;
    byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  }

  const appUrl = requireEnv("APP_URL");
  let emailed = 0;
  for (const items of byUser.values()) {
    const { email, full_name } = items[0].profiles;
    const list = items.map((n) =>
      `<li style="margin-bottom:12px"><strong>${escape(n.title)}</strong><br>${escape(n.body)}` +
      (n.link ? `<br><a href="${appUrl}${n.link}" style="color:#7952D6">Abrir no ContentFlow</a>` : "") + "</li>"
    ).join("");
    try {
      await sendEmail(email!, `ContentFlow AI: ${items.length} lembrete(s)`,
        `<div style="font-family:Inter,Arial,sans-serif;color:#202033">
          <p>Olá${full_name ? `, ${escape(full_name.split(" ")[0])}` : ""}!</p>
          <ul style="padding-left:18px">${list}</ul>
          <p style="color:#858399;font-size:12px">Você pode desativar estes e-mails em Configurações → Notificações.</p>
        </div>`);
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() })
        .in("id", items.map((n) => n.id));
      emailed += items.length;
    } catch (err) {
      console.error("Falha ao enviar e-mail", err);
    }
  }
  return json({ generated, emailed });
});
