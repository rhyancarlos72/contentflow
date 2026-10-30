import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@^2.118.0";
import { HttpError } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Cliente com privilégios de serviço (ignora RLS). Usar só no servidor. */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Autentica a requisição pelo JWT do usuário e devolve um cliente que age em
 * nome dele — toda leitura feita com `db` passa pelas políticas RLS.
 */
export async function authenticate(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "unauthorized", "Sessão inválida.");
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Sessão expirada. Entre novamente.");
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user: data.user, db };
}

export interface PlanInfo {
  plan: "free" | "creator" | "pro";
  max_projects: number;
  monthly_ai_generations: number;
  max_plan_days: number;
  features: string[];
}

/** Plano efetivo validado no banco (assinatura ativa e dentro do período). */
export async function getPlan(userId: string): Promise<PlanInfo> {
  const { data: plan, error } = await admin.rpc("effective_plan", { p_user_id: userId });
  if (error) throw error;
  const { data: limits, error: limitsError } = await admin
    .from("plan_limits").select("*").eq("plan", plan).single();
  if (limitsError) throw limitsError;
  return limits as PlanInfo;
}
