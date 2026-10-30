// Edge Function: billing-portal
// Abre o portal do cliente Stripe (trocar cartão, cancelar, mudar de plano).
import { HttpError, json, serve } from "../_shared/http.ts";
import { appUrl, getStripe } from "../_shared/stripe.ts";
import { admin, authenticate } from "../_shared/supabase.ts";

serve(async (req) => {
  const { user } = await authenticate(req);
  const { data, error } = await admin.from("subscriptions")
    .select("provider_customer_id").eq("user_id", user.id).single();
  if (error) throw error;
  if (!data.provider_customer_id) {
    throw new HttpError(400, "no_customer", "Você ainda não possui uma assinatura paga.");
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: data.provider_customer_id,
    return_url: appUrl("/configuracoes?tab=plano"),
  });
  return json({ url: session.url });
});
