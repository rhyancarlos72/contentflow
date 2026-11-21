import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Palette, Plus } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { styleInstruction, WRITING_STYLES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Dropdown } from "./ui/misc";

export interface StyleChoice { key: string; label: string; instruction: string }

export const DEFAULT_STYLE: StyleChoice = { key: "", label: "Estilo do projeto", instruction: "" };

/** Estilos de escrita do projeto (memória "estilo") — os personalizados do usuário. */
export function useProjectStyles() {
  const { projectId } = useWorkspace();
  return useQuery({
    queryKey: ["project-styles", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_memory").select("id, content")
        .eq("project_id", projectId).eq("kind", "estilo").order("created_at");
      if (error) throw error;
      return (data ?? []) as { id: string; content: string }[];
    },
  });
}

/** Seletor de estilo de escrita: predefinidos + estilos próprios do projeto. */
export function StylePicker({ value, onChange, dark }: { value: StyleChoice; onChange: (s: StyleChoice) => void; dark?: boolean }) {
  const custom = useProjectStyles();
  const preset = WRITING_STYLES.find((s) => s.value === value.key);
  return (
    <Dropdown align="left" className="w-[300px] p-2"
      trigger={(open) => (
        <button type="button" className={cn("flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition",
          dark ? "border-white/15 text-white/80 hover:border-white/40 hover:text-white" : "border-line text-ink-soft hover:border-brand-300 hover:text-brand-700",
          value.key && !dark && "border-brand-300 bg-brand-50 text-brand-700")}>
          <Palette className="h-3.5 w-3.5" />
          {preset ? `${preset.emoji} ${preset.label}` : value.label}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
        </button>
      )}>
      {(close) => (
        <div className="max-h-[360px] overflow-y-auto">
          <button onClick={() => { onChange(DEFAULT_STYLE); close(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50">
            <span className="flex-1"><span className="font-semibold">Estilo do projeto</span><span className="block text-xs text-ink-soft">Usa o tom de voz salvo na memória</span></span>
            {!value.key && <Check className="h-4 w-4 text-brand-600" />}
          </button>
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Estilos prontos</p>
          {WRITING_STYLES.map((s) => (
            <button key={s.value} onClick={() => { onChange({ key: s.value, label: s.label, instruction: styleInstruction(s.label, s.desc) }); close(); }}
              className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
              <span className="text-base leading-5">{s.emoji}</span>
              <span className="flex-1"><span className="text-sm font-semibold">{s.label}</span><span className="block text-xs leading-snug text-ink-soft">{s.desc}</span></span>
              {value.key === s.value && <Check className="mt-0.5 h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Seus estilos</p>
          {(custom.data ?? []).map((s) => (
            <button key={s.id} onClick={() => { onChange({ key: `custom:${s.id}`, label: s.content.slice(0, 28), instruction: s.content }); close(); }}
              className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
              <span className="text-base leading-5">🖋️</span>
              <span className="flex-1 text-sm">{s.content}</span>
              {value.key === `custom:${s.id}` && <Check className="mt-0.5 h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <Link to="/projetos?memoria=estilo" onClick={close} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> Criar meu estilo
          </Link>
        </div>
      )}
    </Dropdown>
  );
}
