import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, className, htmlFor }: {
  label?: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("input", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn("input resize-y leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn("input appearance-none pr-9", className)} {...props}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
    </div>
  ),
);
Select.displayName = "Select";

/** Seleção por chips (única ou múltipla). */
export function Chips<T extends string>({ options, value, onChange, multiple = false }: {
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            aria-pressed={active}
            className={cn("chip", active && "chip-active")}
            onClick={() =>
              onChange(multiple ? (active ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
