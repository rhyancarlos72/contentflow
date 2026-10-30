import { createClient } from "@supabase/supabase-js";

// Configuração em tempo de execução (server.js → /env-config.js) tem prioridade sobre a do build.
const runtimeEnv = (window as { __ENV__?: Record<string, string> }).__ENV__ ?? {};
const env = (key: string) => runtimeEnv[key] || (import.meta.env[key] as string | undefined) || undefined;

const url = env("VITE_SUPABASE_URL");
const anonKey = env("VITE_SUPABASE_ANON_KEY");

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const googleAuthEnabled = env("VITE_GOOGLE_AUTH_ENABLED") === "true";

export const STORAGE_BUCKET = "content-files";

/** Traduz mensagens de erro do Supabase/Postgres para o usuário. */
export function friendlyError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? String(error);
  if (message.includes("PLAN_LIMIT_PROJECTS")) return message.replace(/^.*PLAN_LIMIT_PROJECTS:\s*/, "") + " Faça upgrade para criar mais.";
  if (message.includes("row-level security")) return "Este recurso não está disponível no seu plano atual.";
  if (message.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.includes("User already registered")) return "Já existe uma conta com este e-mail.";
  if (message.includes("Password should be")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (message.includes("Failed to fetch")) return "Sem conexão com o servidor. Verifique sua internet.";
  if (message.includes("duplicate key")) return "Já existe um item com esses dados.";
  return message || "Algo deu errado. Tente novamente.";
}
