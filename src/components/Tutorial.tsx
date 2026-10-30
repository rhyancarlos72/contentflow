import { useState } from "react";
import { CalendarDays, FolderKanban, Lightbulb, Rocket, Target, Wand2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

const STEPS = [
  { icon: Rocket, title: "Bem-vindo ao ContentFlow AI", text: "Seu primeiro projeto já está pronto. Vamos dar uma volta rápida pelas principais áreas — leva menos de um minuto." },
  { icon: Target, title: "Planejamento Inteligente", text: "Conte seu objetivo e a IA monta 7, 15 ou 30 dias de conteúdo equilibrado, com gancho, roteiro, legenda, CTA e hashtags." },
  { icon: CalendarDays, title: "Calendário Editorial", text: "Visualize por mês, semana ou lista. Arraste publicações para outras datas e acompanhe o status de cada uma." },
  { icon: Wand2, title: "Estúdio de IA", text: "Gere ideias, roteiros, legendas, ganchos, CTAs e hashtags que respeitam o tom de voz do seu projeto." },
  { icon: Lightbulb, title: "Banco de Ideias e Roteiros", text: "Guarde inspirações, transforme ideias em roteiros e roteiros em publicações com um clique." },
  { icon: FolderKanban, title: "Produção e Analytics", text: "Organize gravação, edição e revisão no Kanban. Registre métricas reais e receba análises da IA sobre o que funciona." },
];

export function Tutorial() {
  const { updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const finish = () => updateProfile({ tutorial_completed: true });
  const s = STEPS[step]!;
  return (
    <Modal open onClose={finish} size="sm">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-glow">
          <s.icon className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">{s.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.text}</p>
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-brand-500" : "w-1.5 bg-line"}`} />
          ))}
        </div>
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" onClick={finish}>Pular</Button>
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep(step + 1)}>Próximo</Button>
            : <Button onClick={finish}>Começar a criar</Button>}
        </div>
      </div>
    </Modal>
  );
}
