import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Lightbulb, Sparkles, Type, Zap } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { topicSuggestions } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import { ListeningBar, MicButton, useVoiceAppend } from "./Voice";

const ACTIONS = [
  { tool: "script", label: "Roteiro", icon: FileText },
  { tool: "ideas", label: "Ideias", icon: Lightbulb },
  { tool: "caption", label: "Legenda", icon: Type },
  { tool: "hooks", label: "Ganchos", icon: Zap },
] as const;

/** Criação rápida: fale ou digite e escolha o que gerar. */
export function QuickCreate({ greeting }: { greeting: string }) {
  const { project } = useWorkspace();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const dictation = useVoiceAppend(topic, setTopic);
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  const chips = topicSuggestions(project?.niche ?? "", seed, 3);

  const go = (tool: string, subject = topic) => {
    if (!subject.trim()) return toast.error("Fale ou digite um assunto — ou toque numa sugestão.");
    dictation.stop();
    navigate(`/estudio?ferramenta=${tool}&tema=${encodeURIComponent(subject.trim())}&auto=1`);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#13102A] p-6 text-white sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-brand-500/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-10 h-64 w-64 rounded-full bg-[#20B486]/20 blur-3xl" />
      <div className="relative">
        <p className="text-sm font-semibold text-white/60">{greeting}</p>
        <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">O que vamos criar hoje?</h2>
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 pl-4 backdrop-blur focus-within:border-brand-300 focus-within:bg-white/15">
          <Sparkles className="h-5 w-5 shrink-0 text-brand-200" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go("script")}
            placeholder="Ex.: como organizar as finanças ganhando pouco" aria-label="Assunto"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-white outline-none placeholder:text-white/40" />
          {dictation.supported && <MicButton listening={dictation.listening} onClick={dictation.toggle} className={cn(!dictation.listening && "bg-white/15 text-white hover:bg-white/25")} />}
        </div>
        {dictation.listening && <ListeningBar interim={dictation.interim} />}
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button key={a.tool} onClick={() => go(a.tool)}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#13102A] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(151,117,222,.9)]">
              <a.icon className="h-4 w-4 text-brand-600" />{a.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="py-1 text-white/45">Sugestões:</span>
          {chips.map((c) => (
            <button key={c} onClick={() => go("script", c)} className="rounded-full border border-white/15 px-3 py-1 text-white/75 transition hover:border-white/40 hover:text-white">{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
