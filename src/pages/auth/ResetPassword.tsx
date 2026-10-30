import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyError, supabase } from "@/lib/supabase";
import { AuthShell } from "./AuthShell";

export default function ResetPassword() {
  const { session, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Senha atualizada!");
    navigate("/app");
  };

  if (!authLoading && !session) {
    return (
      <AuthShell title="Link inválido ou expirado" subtitle="Solicite um novo link de recuperação."
        footer={<Link to="/recuperar-senha" className="font-semibold text-brand-600">Solicitar novo link</Link>}>
        <span />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Crie uma nova senha">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" htmlFor="p1"><Input id="p1" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirmar senha" htmlFor="p2"><Input id="p2" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>Salvar nova senha</Button>
      </form>
    </AuthShell>
  );
}
