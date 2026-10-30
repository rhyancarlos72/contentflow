import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { friendlyError, supabase } from "@/lib/supabase";
import { AuthShell } from "./AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    setSent(true);
  };
  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha."
      footer={<Link to="/entrar" className="font-semibold text-brand-600 hover:underline">Voltar para o login</Link>}>
      {sent ? (
        <div className="flex gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm">
          <MailCheck className="h-5 w-5 shrink-0 text-brand-600" />
          <p>Se existir uma conta com <strong>{email}</strong>, você receberá o link em instantes. Confira também o spam.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>Enviar link</Button>
        </form>
      )}
    </AuthShell>
  );
}
