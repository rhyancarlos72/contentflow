// Edge Function: billing-webhook
// Recebe eventos do Stripe (assinatura verificada) e sincroniza a tabela
// subscriptions. É a única via pela qual um plano pago é liberado.
// Deploy com --no-verify-jwt: a autenticação é a assinatura do Stripe.
import Stripe from "npm:stripe@~23.0.1";
import { corsHeaders, requireEnv } from "../_shared/http.ts";
import { getStripe, planForPrice } from "../_shared/stripe.ts";
import { admin } from "../_shared/supabase.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  unpaid: "unpaid",
  paused: "past_due",
};

async function syncSubscription(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const plan = planForPrice(item?.price.id);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let userId = subscription.metadata?.user_id;
  if (!userId) {
    const { data } = await admin.from("subscriptions").select("user_id")
      .eq("provider_customer_id", customerId).maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) {
    console.error("Assinatura sem usuário associado", subscription.id);
    return;
  }
  const status = STATUS_MAP[subscription.status] ?? "incomplete";
  const ended = status === "canceled";
  const periodEnd = item?.current_period_end;

  const { error } = await admin.from("subscriptions").update({
    plan: ended || !plan ? "free" : plan,
    status: ended ? "active" : status,
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: ended ? null : subscription.id,
    current_period_end: ended || !periodEnd ? null : new Date(periodEnd * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
  }).eq("user_id", userId);
  if (error) throw error;

  if (!ended && plan) {
    await admin.from("notifications").insert({
      user_id: userId,
      type: "sistema",
      title: `Plano ${plan === "pro" ? "Pro" : "Creator"} ativo`,
      body: "Obrigado por assinar o ContentFlow AI! Seus novos recursos já estão liberados.",
      link: "/configuracoes?tab=plano",
      dedupe_key: `plano:${subscription.id}:${plan}`,
    }).then(() => undefined, () => undefined);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), signature, requireEnv("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider,
    );
  } catch (err) {
    console.error("Assinatura de webhook inválida", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
    }
  } catch (err) {
    console.error("Falha ao processar webhook", event.type, err);
    return new Response("webhook handler failed", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
