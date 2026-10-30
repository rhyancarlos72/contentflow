import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { appendDictation, useDictation } from "@/lib/speech";
import { cn } from "@/lib/utils";

/** Botão de microfone com animação de ondas enquanto escuta. */
export function MicButton({ listening, onClick, size = "md", className }: {
  listening: boolean; onClick: () => void; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const dims = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-12 w-12" }[size];
  return (
    <button type="button" onClick={onClick} aria-pressed={listening} title={listening ? "Parar de ditar" : "Ditar por voz"}
      aria-label={listening ? "Parar de ditar" : "Ditar por voz"}
      className={cn("relative grid shrink-0 place-items-center rounded-full transition", dims,
        listening ? "bg-[#E5354B] text-white shadow-[0_0_0_6px_rgba(229,53,75,.15)]" : "bg-brand-50 text-brand-600 hover:bg-brand-100", className)}>
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-[#E5354B]/40" />}
      {listening ? <Square className="relative h-3.5 w-3.5 fill-current" /> : <Mic className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />}
    </button>
  );
}

/** Ditado que acrescenta cada frase ao valor atual do campo. */
export function useVoiceAppend(value: string, onValueChange: (v: string) => void) {
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  return useDictation((t) => {
    valueRef.current = appendDictation(valueRef.current, t);
    onValueChange(valueRef.current);
  }, (m) => toast.error(m));
}

/** Faixa que mostra em tempo real o que está sendo falado. */
export function ListeningBar({ interim }: { interim: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#FDECEE] px-3 py-2 text-xs font-medium text-[#B42335]">
      <span className="flex h-3 items-end gap-0.5">
        {[0, 1, 2, 3].map((i) => <span key={i} className="w-0.5 animate-[voice_0.9s_ease-in-out_infinite] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />)}
      </span>
      <span className="truncate">{interim || "Ouvindo… fale naturalmente"}</span>
    </div>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onValueChange: (v: string) => void };

/** Textarea com ditado por voz embutido. */
export const VoiceTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ value, onValueChange, className, rows = 4, ...props }, ref) => {
  const d = useVoiceAppend(value, onValueChange);
  return (
    <div>
      <div className="relative">
        <textarea ref={ref} rows={rows} value={value} onChange={(e) => onValueChange(e.target.value)}
          className={cn("input resize-y pr-12 leading-relaxed", className)} {...props} />
        {d.supported && <MicButton size="sm" listening={d.listening} onClick={d.toggle} className="absolute bottom-2.5 right-2.5" />}
      </div>
      {d.listening && <ListeningBar interim={d.interim} />}
    </div>
  );
});
VoiceTextarea.displayName = "VoiceTextarea";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onValueChange: (v: string) => void };

/** Input com ditado por voz embutido. */
export const VoiceInput = forwardRef<HTMLInputElement, InputProps>(({ value, onValueChange, className, ...props }, ref) => {
  const d = useVoiceAppend(value, onValueChange);
  return (
    <div>
      <div className="relative">
        <input ref={ref} value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("input pr-12", className)} {...props} />
        {d.supported && <MicButton size="sm" listening={d.listening} onClick={d.toggle} className="absolute right-1.5 top-1/2 -translate-y-1/2" />}
      </div>
      {d.listening && <ListeningBar interim={d.interim} />}
    </div>
  );
});
VoiceInput.displayName = "VoiceInput";
