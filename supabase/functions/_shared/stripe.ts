import Stripe from "stripe";
import { requireEnv } from "./http.ts";

let stripe: Stripe | null = null;
export function getStripe(): Stripe {
  stripe ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripe;
}

export type PaidPlan = "creator" | "pro";

/** IDs de preço recorrente (BRL) configurados como secrets. */
export function priceIdFor(plan: PaidPlan): string {
  return requireEnv(plan === "creator" ? "STRIPE_PRICE_CREATOR" : "STRIPE_PRICE_PRO");
}

export function planForPrice(priceId: string | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === Deno.env.get("STRIPE_PRICE_CREATOR")) return "creator";
  if (priceId === Deno.env.get("STRIPE_PRICE_PRO")) return "pro";
  return null;
}

export function appUrl(path: string): string {
  return new URL(path, requireEnv("APP_URL")).toString();
}
