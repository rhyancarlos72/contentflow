// Edge Function: delete-account
// Exclui definitivamente a conta: cancela assinatura, remove arquivos e o
// usuário (todas as tabelas têm on delete cascade a partir de auth.users).
import { HttpError, json, serve } from "../_shared/http.ts";
import { getStripe } from "../_shared/stripe.ts";
import { admin, authenticate } from "../_shared/supabase.ts";

serve(async (req) => {
  const { user } = await authenticate(req);
  const { confirmation } = await req.json().catch(() => ({})) as { confirmation?: string };
  if (confirmation !== "EXCLUIR") {
    throw new HttpError(400, "confirmation_required", 'Digite "EXCLUIR" para confirmar.');
  }

  const { data: sub } = await admin.from("subscriptions")
    .select("provider_subscription_id").eq("user_id", user.id).maybeSingle();
  if (sub?.provider_subscription_id && Deno.env.get("STRIPE_SECRET_KEY")) {
    await getStripe().subscriptions.cancel(sub.provider_subscription_id).catch((err) =>
      console.error("Falha ao cancelar assinatura", err)
    );
  }

  // Remove arquivos do usuário no Storage (pasta {user_id}/...), em lotes.
  const bucket = admin.storage.from("content-files");
  const collect = async (prefix: string): Promise<string[]> => {
    const { data } = await bucket.list(prefix, { limit: 1000 });
    const paths: string[] = [];
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await collect(path));
    }
    return paths;
  };
  const files = await collect(user.id);
  for (let i = 0; i < files.length; i += 100) {
    await bucket.remove(files.slice(i, i + 100));
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
});
