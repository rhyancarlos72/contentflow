import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Minus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/lib/supabase";
import { cn, fmtCurrency } from "@/lib/utils";
import type { PlanTier } from "@/types";

export const PLANS: { id: PlanTier; name: string; price: number; tagline: string; highlights: string[] }[] = [
  { id: "free", name: "Gratuito", price: 0, tagline: "Para começar com organização",
    highlights: ["1 projeto", "Calendário editorial", "Banco de ideias", "20 gerações de IA/mês", "5 roteiros com IA por mês", "Ditado por voz e teleprompter"] },
  { id: "creator", name: "Creator", price: 19.9, tagline: "Para quem publica toda semana",
    highlights: ["Até 3 projetos", "Planejamento inteligente (7 e 15 dias)", "150 gerações de IA/mês", "Gerador de roteiros", "Legendas e CTAs", "Analytics manual", "Biblioteca de conteúdo"] },
  { id: "pro", name: "Pro", price: 39.9, tagline: "Para profissionais e agências",
    highlights: ["Até 15 projetos", "600 gerações de IA/mês", "Planejamento de 30 dias", "Memória estratégica avançada", "Analytics avançado com IA", "Relatórios exportáveis", "Recursos colaborativos (em breve)"] },
];

const ROWS: [string, (string | boolean)[]][] = [
  ["Projetos", ["1", "3", "15"]],
  ["Gerações de IA por mês", ["20", "150", "600"]],
  ["Calendário editorial", [true, true, true]],
  ["Banco de ideias", [true, true, true]],
  ["Kanban de produção", [true, true, true]],
  ["Roteiros manuais", [true, true, true]],
  ["Ideias, ganchos e hashtags com IA", [true, true, true]],
  ["Planejamento inteligente", [false, "7 e 15 dias", "7, 15 e 30 dias"]],
  ["Gerador de roteiros com IA", ["5/mês", "Ilimitado*", "Ilimitado*"]],
  ["Ditado por voz e teleprompter", [true, true, true]],
  ["Legendas e CTAs com IA", [false, true, true]],
  ["Analytics manual", [false, true, true]],
  ["Análise de resultados com IA", [false, true, true]],
  ["Biblioteca de conteúdo", [false, true, true]],
  ["Memória estratégica avançada", [false, false, true]],
  ["Relatórios exportáveis", [false, false, true]],
];

export default function Pricing() {
  const { user } = useAuth();
  const { plan } = useWorkspace();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<PlanTier | null>(null);

  const choose = async (id: PlanTier) => {
    if (!user) return navigate("/cadastro");
    if (id === "free" || id === plan?.plan) return navigate("/app");
    setLoading(id);
    const { data, error } = await supabase.functions.invoke("billing-checkout", { body: { plan: id } });
    setLoading(null);
    if (error || !data?.url) return toast.error("Pagamentos ainda não estão configurados. Tente novamente mais tarde.");
    window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#EDE6FB,transparent_55%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to={user ? "/app" : "/"}><Logo /></Link>
        <Link to={user ? "/app" : "/entrar"}><Button variant="secondary">{user ? "Voltar ao app" : "Entrar"}</Button></Link>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold sm:text-5xl">Planos simples, sem surpresa</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">Toda conta nova ganha <strong className="text-brand-700">7 dias grátis do plano Pro</strong>, sem cartão. Depois, continue no gratuito ou escolha um plano. Cancele quando quiser.</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p) => {
            const current = plan?.plan === p.id;
            const featured = p.id === "creator";
            return (
              <div key={p.id} className={cn("card relative flex flex-col p-7", featured && "border-brand-300 shadow-pop ring-4 ring-brand-100")}>
                {featured && <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">Mais escolhido</span>}
                <h2 className="text-xl font-bold">{p.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">{p.tagline}</p>
                <p className="mt-5"><span className="text-4xl font-extrabold">{p.price ? fmtCurrency(p.price) : "R$ 0"}</span><span className="text-ink-soft">/mês</span></p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.highlights.map((h) => <li key={h} className="flex gap-2.5 text-sm"><Check className="h-4 w-4 shrink-0 text-positive" />{h}</li>)}
                </ul>
                <Button className="mt-7 w-full" size="lg" variant={featured ? "primary" : "secondary"} loading={loading === p.id} disabled={current}
                  icon={p.id !== "free" && !current ? <Sparkles className="h-4 w-4" /> : undefined} onClick={() => choose(p.id)}>
                  {current ? "Plano atual" : p.id === "free" ? "Começar grátis" : `Assinar ${p.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="card mt-14 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line">
              <th className="px-6 py-4 text-left font-bold">Comparação de recursos</th>
              {PLANS.map((p) => <th key={p.id} className="px-4 py-4 text-center font-bold">{p.name}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {ROWS.map(([label, values]) => (
                <tr key={label}>
                  <td className="px-6 py-3 text-ink-soft">{label}</td>
                  {values.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      {v === true ? <Check className="mx-auto h-4 w-4 text-positive" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-ink-faint" /> : <span className="font-semibold">{v}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-center text-xs text-ink-soft">Pagamento recorrente mensal em reais. Os recursos premium são liberados automaticamente após a confirmação do pagamento. *Dentro do total de gerações de IA do plano.</p>
      </main>
    </div>
  );
}
