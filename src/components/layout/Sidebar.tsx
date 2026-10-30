import { NavLink } from "react-router-dom";
import {
  BarChart3, BookMarked, CalendarDays, ChevronsLeft, FileText, FolderKanban, Lightbulb,
  LayoutDashboard, Settings, Sparkles, Target, Wand2, X,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PLAN_INFO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { LogoMark } from "../Logo";

export const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/estudio", label: "Estúdio de IA", icon: Wand2, highlight: true },
  { to: "/planejamento", label: "Planejamento Inteligente", icon: Target },
  { to: "/calendario", label: "Calendário Editorial", icon: CalendarDays },
  { to: "/ideias", label: "Banco de Ideias", icon: Lightbulb },
  { to: "/roteiros", label: "Meus Roteiros", icon: FileText },
  { to: "/producao", label: "Produção de Conteúdo", icon: FolderKanban },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/projetos", label: "Projetos e Clientes", icon: Sparkles },
  { to: "/biblioteca", label: "Biblioteca de Conteúdo", icon: BookMarked },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: {
  collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const { plan } = useWorkspace();
  const trialDays = plan?.trial_ends_at ? Math.max(0, Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null;
  const pct = plan ? Math.min(100, (plan.ai_used_this_month / plan.limits.monthly_ai_generations) * 100) : 0;
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-[#0E0B1E]/50 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden bg-[#13102A] text-white transition-all duration-300",
        collapsed ? "lg:w-[78px]" : "lg:w-[268px]",
        mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0",
      )}>
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-[#20B486]/15 blur-3xl" />

        <div className="relative flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            {(!collapsed || mobileOpen) && <span className="whitespace-nowrap text-[17px] font-extrabold tracking-tight">ContentFlow <span className="text-brand-300">AI</span></span>}
          </div>
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 lg:hidden" aria-label="Fechar menu"><X className="h-5 w-5" /></button>
        </div>

        <nav className="scrollbar-thin relative flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, highlight }) => (
            <NavLink key={to} to={to} end={end} onClick={onCloseMobile} title={collapsed ? label : undefined}
              className={({ isActive }) => cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition",
                isActive ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" : "text-white/55 hover:bg-white/5 hover:text-white",
                collapsed && "lg:justify-center lg:px-0",
              )}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-300 to-brand-500 shadow-[0_0_12px_#9775DE]" />}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand-300" : highlight ? "text-brand-300/80" : "text-white/40 group-hover:text-white/70")} />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
                  {highlight && !collapsed && <span className="ml-auto rounded-md bg-gradient-to-r from-brand-400 to-[#B05BD8] px-1.5 py-0.5 text-[10px] font-bold text-white">IA</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {plan && !collapsed && (
          <div className="relative mx-3 mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-white/90">{trialDays !== null ? `Teste Pro · ${trialDays} dia${trialDays === 1 ? "" : "s"}` : `Plano ${PLAN_INFO[plan.plan].name}`}</span>
              <span className="text-white/50">{plan.ai_used_this_month}/{plan.limits.monthly_ai_generations}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-[#20B486] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-white/40">gerações de IA neste mês</p>
            {(plan.plan !== "pro" || trialDays !== null) && (
              <NavLink to="/precos" className="mt-3 block rounded-xl bg-gradient-to-r from-brand-500 to-[#B05BD8] px-3 py-2 text-center text-[13px] font-bold shadow-glow transition hover:brightness-110">
                {trialDays !== null ? "Garantir meu plano" : "Fazer upgrade"}
              </NavLink>
            )}
          </div>
        )}

        <button onClick={onToggle}
          className="relative hidden h-12 items-center gap-2 border-t border-white/10 px-6 text-[13px] font-semibold text-white/50 transition hover:text-white lg:flex"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && "Recolher"}
        </button>
      </aside>
    </>
  );
}
