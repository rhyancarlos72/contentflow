import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { friendlyError, googleAuthEnabled, supabase } from "@/lib/supabase";
import { AuthShell, GoogleIcon } from "./AuthShell";
import { signInWithGoogle } from "./Login";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    if (data.session) navigate("/onboarding");
    else setSent(true); // confirmação de e-mail ativada
  };

  if (sent) {
    return (
      <AuthShell title="Confirme seu e-mail" footer={<Link to="/entrar" className="font-semibold text-brand-600">Voltar para o login</Link>}>
        <div className="flex gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm">
          <MailCheck className="h-5 w-5 shrink-0 text-brand-600" />
          <p>Enviamos um link para <strong>{email}</strong>. Clique nele para ativar sua conta e começar o onboarding.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crie sua conta grátis" subtitle="Comece a planejar com estratégia em menos de 2 minutos."
      footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-brand-600 hover:underline">Entrar</Link></>}>
      {googleAuthEnabled && (
        <>
          <Button variant="secondary" className="w-full" icon={<GoogleIcon />} onClick={signInWithGoogle}>Continuar com Google</Button>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome" htmlFor="name">
          <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como devemos te chamar?" />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </Field>
        <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres.">
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>Criar conta</Button>
        <p className="text-center text-xs text-ink-soft">Ao criar a conta você concorda com os Termos de Uso e a Política de Privacidade.</p>
      </form>
    </AuthShell>
  );
}
