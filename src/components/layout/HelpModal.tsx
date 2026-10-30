import { useNavigate } from "react-router-dom";
import { GraduationCap, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const FAQ = [
  ["Por onde começo?", "Crie um planejamento em Planejamento Inteligente: em poucos minutos a IA monta 7, 15 ou 30 dias de conteúdo com gancho, roteiro, legenda e CTA. Depois envie os itens para o calendário."],
  ["Como a IA aprende meu estilo?", "Cada projeto tem uma memória estratégica (Projetos e Clientes → Memória). Ela guarda tom de voz, público, palavras a evitar e, automaticamente, os assuntos que você já aprovou ou publicou para não repetir temas."],
  ["As métricas são reais?", "Sim. O Analytics mostra apenas os números que você registra (ou que vierem de integrações oficiais). A IA só analisa dados existentes e avisa quando a amostra é pequena."],
  ["Como funcionam os limites de IA?", "Cada plano tem um número de gerações por mês. O contador aparece na barra lateral e reinicia todo dia 1º."],
  ["Posso usar para clientes?", "Sim. Crie um projeto por cliente: cada um tem calendário, biblioteca e memória separados, sem misturar informações."],
];

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updateProfile } = useAuth();
  const navigate = useNavigate();
  return (
    <Modal open={open} onClose={onClose} title="Central de ajuda" description="Respostas rápidas para tirar o máximo do ContentFlow AI.">
      <div className="space-y-2">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-line px-4 py-3 open:bg-canvas">
            <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">{q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="soft" icon={<GraduationCap className="h-4 w-4" />}
          onClick={async () => { await updateProfile({ tutorial_completed: false }); onClose(); navigate("/app"); }}>
          Rever tutorial
        </Button>
        <a href="mailto:suporte@contentflow.ai">
          <Button variant="secondary" icon={<Mail className="h-4 w-4" />}>Falar com o suporte</Button>
        </a>
      </div>
    </Modal>
  );
}
