// Edge Function: billing-checkout
// Cria uma sessão de checkout de assinatura recorrente no Stripe.
import { HttpError, json, serve } from "../_shared/http.ts";
import { appUrl, getStripe, type PaidPlan, priceIdFor } from "../_shared/stripe.ts";
import { admin, authenticate } from "../_shared/supabase.ts";

serve(async (req) => {
  const { user } = await authenticate(req);
  const { plan } = await req.json().catch(() => ({})) as { plan?: PaidPlan };
  if (plan !== "creator" && plan !== "pro") throw new HttpError(400, "invalid_plan", "Plano inválido.");

  const stripe = getStripe();
  const { data: sub, error } = await admin.from("subscriptions")
    .select("provider_customer_id, plan, status").eq("user_id", user.id).single();
  if (error) throw error;

  let customerId = sub.provider_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("subscriptions").update({ provider: "stripe", provider_customer_id: customerId })
      .eq("user_id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    locale: "pt-BR",
    success_url: appUrl("/configuracoes?tab=plano&checkout=sucesso"),
    cancel_url: appUrl("/precos?checkout=cancelado"),
  });

  return json({ url: session.url });
});
