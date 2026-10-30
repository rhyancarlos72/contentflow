import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Sparkles, TrendingUp } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SLOGAN } from "@/lib/constants";

export function AuthShell({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-8 sm:px-12">
        <Link to="/"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-[26px] font-bold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-[#2A1A5C] lg:block">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-[#20B486]/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center px-14 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">ContentFlow AI</p>
          <h2 className="mt-4 max-w-md text-4xl font-extrabold leading-tight">{SLOGAN}</h2>
          <div className="mt-10 space-y-3">
            {[
              { icon: Sparkles, t: "Estrategista, roteirista e organizador num só lugar" },
              { icon: CalendarDays, t: "Planeje um mês de conteúdo em minutos" },
              { icon: TrendingUp, t: "Aprenda com os resultados reais das suas publicações" },
            ].map(({ icon: Icon, t }) => (
              <div key={t} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <Icon className="h-5 w-5 text-white/80" />
                <span className="text-sm font-medium">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
