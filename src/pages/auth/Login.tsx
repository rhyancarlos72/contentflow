import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { friendlyError, googleAuthEnabled, supabase } from "@/lib/supabase";
import { AuthShell, GoogleIcon } from "./AuthShell";

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) toast.error(friendlyError(error));
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/app";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    navigate(from, { replace: true });
  };

  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Entre para continuar criando."
      footer={<>Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-brand-600 hover:underline">Criar conta grátis</Link></>}>
      {googleAuthEnabled && (
        <>
          <Button variant="secondary" className="w-full" icon={<GoogleIcon />} onClick={signInWithGoogle}>Entrar com Google</Button>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="text-right">
          <Link to="/recuperar-senha" className="text-[13px] font-semibold text-brand-600 hover:underline">Esqueci minha senha</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>Entrar</Button>
      </form>
    </AuthShell>
  );
}
