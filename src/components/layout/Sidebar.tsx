import { NavLink } from "react-router-dom";
import {
  BarChart3, BookMarked, CalendarDays, ChevronsLeft, FileText, FolderKanban, Lightbulb,
  LayoutDashboard, Settings, Sparkles, Target, Wand2, X,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PLAN_INFO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Logo } from "../Logo";
import { ProgressBar } from "../ui/misc";

export const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/planejamento", label: "Planejamento Inteligente", icon: Target },
  { to: "/calendario", label: "Calendário Editorial", icon: CalendarDays },
  { to: "/estudio", label: "Estúdio de IA", icon: Wand2 },
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
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-[#1A1530]/40 lg:hidden" onClick={onCloseMobile} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-white transition-all duration-300",
        collapsed ? "lg:w-[78px]" : "lg:w-[268px]",
        mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0",
      )}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo collapsed={collapsed && !mobileOpen} />
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-ink-soft hover:bg-brand-50 lg:hidden" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-3" data-tour="sidebar">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onCloseMobile} title={collapsed ? label : undefined}
              className={({ isActive }) => cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition",
                isActive ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-canvas hover:text-ink",
                collapsed && "lg:justify-center lg:px-0",
              )}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand-600" : "text-ink-faint group-hover:text-ink-soft")} />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {plan && !collapsed && (
          <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <span>Plano {PLAN_INFO[plan.plan].name}</span>
              <span>{plan.ai_used_this_month}/{plan.limits.monthly_ai_generations} IA</span>
            </div>
            <ProgressBar value={plan.ai_used_this_month} max={plan.limits.monthly_ai_generations} color="#fff" className="mt-2 bg-white/20" />
            {plan.plan !== "pro" && (
              <NavLink to="/precos" className="mt-3 block rounded-xl bg-white/15 px-3 py-2 text-center text-[13px] font-bold transition hover:bg-white/25">
                Fazer upgrade
              </NavLink>
            )}
          </div>
        )}

        <button onClick={onToggle}
          className="hidden h-12 items-center gap-2 border-t border-line px-6 text-[13px] font-semibold text-ink-soft transition hover:text-brand-600 lg:flex"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && "Recolher"}
        </button>
      </aside>
    </>
  );
}
