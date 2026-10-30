import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card min-w-0", className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon }: {
  title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, color, bg, className }: { children: ReactNode; color?: string; bg?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold", className)}
      style={{ color: color ?? "#5935A8", background: bg ?? (color ? `${color}14` : "#F4F0FC") }}>
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-500", className)} />;
}

export function PageLoader() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function EmptyState({ icon, title, description, action, className }: {
  icon: ReactNode; title: string; description?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-100/60 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-brand-100 bg-white text-brand-500 shadow-card">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: readonly { value: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cn("scrollbar-thin flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1", className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
            value === t.value ? "bg-brand-500 text-white shadow-sm" : "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
          )}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  );
}

/** Menu suspenso simples com fechamento ao clicar fora. */
export function Dropdown({ trigger, children, align = "right", className }: {
  trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cn(
          "absolute top-full z-40 mt-2 min-w-[220px] animate-scale-in rounded-2xl border border-line bg-white p-1.5 shadow-pop",
          align === "right" ? "right-0" : "left-0", className,
        )}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn(
      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
      danger ? "text-[#D93A4A] hover:bg-red-50" : "text-ink hover:bg-brand-50 hover:text-brand-700",
    )}>
      {icon && <span className="text-ink-soft [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

export function ProgressBar({ value, max, color = "#7952D6", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
