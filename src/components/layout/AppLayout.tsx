import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, CreditCard, HelpCircle, LogOut, Menu, Plus, Search, Settings, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PLAN_INFO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar, Dot, Dropdown, MenuItem, PageLoader } from "../ui/misc";
import { Tutorial } from "../Tutorial";
import { GlobalSearch } from "./GlobalSearch";
import { HelpModal } from "./HelpModal";
import { NotificationsMenu } from "./NotificationsMenu";
import { Sidebar } from "./Sidebar";

const readCollapsed = () => {
  try { return localStorage.getItem("cf:sidebar") === "1"; } catch { return false; }
};

export function AppLayout() {
  const { user, profile, loading, signOut } = useAuth();
  const { project, projects, setProject, plan, loading: wsLoading } = useWorkspace();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try { localStorage.setItem("cf:sidebar", collapsed ? "1" : "0"); } catch { /* sem storage */ }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (loading || (user && wsLoading)) return <PageLoader />;
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  if (profile && (!profile.onboarding_completed || projects.length === 0)) return <Navigate to="/onboarding" replace />;

  const name = profile?.full_name || user.email || "";

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-[78px]" : "lg:pl-[268px]")}>
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-white/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-brand-50 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>

          <Dropdown align="left" trigger={(open) => (
            <button className="flex max-w-[200px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold transition hover:border-brand-200 sm:max-w-[240px]" data-tour="project">
              <Dot color={project?.color ?? "#7952D6"} className="h-2.5 w-2.5" />
              <span className="truncate">{project?.name ?? "Projeto"}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-soft transition", open && "rotate-180")} />
            </button>
          )}>
            {(close) => (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Seus projetos</p>
                {projects.map((p) => (
                  <MenuItem key={p.id} icon={<Dot color={p.color} className="h-2.5 w-2.5" />} onClick={() => { setProject(p.id); close(); }}>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === project?.id && <Check className="h-4 w-4 text-brand-600" />}
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-line" />
                <MenuItem icon={<Plus />} onClick={() => { navigate("/projetos?novo=1"); close(); }}>Novo projeto</MenuItem>
              </>
            )}
          </Dropdown>

          <button onClick={() => setSearchOpen(true)} data-tour="search"
            className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-sm text-ink-soft transition hover:border-brand-200 md:ml-2 md:w-72 lg:w-80">
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Buscar em tudo…</span>
            <kbd className="ml-auto hidden rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-semibold md:inline">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-1 md:ml-auto">
            <NotificationsMenu />
            <button onClick={() => setHelpOpen(true)} className="hidden h-10 w-10 place-items-center rounded-xl text-ink-soft transition hover:bg-brand-50 hover:text-brand-700 sm:grid" aria-label="Ajuda">
              <HelpCircle className="h-[19px] w-[19px]" />
            </button>
            <Dropdown trigger={() => (
              <button className="ml-1 flex items-center gap-2 rounded-full p-0.5 transition hover:ring-4 hover:ring-brand-50" aria-label="Menu do perfil">
                <Avatar name={name} url={profile?.avatar_url} size={36} />
              </button>
            )}>
              {(close) => (
                <>
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-bold">{profile?.full_name || "Sua conta"}</p>
                    <p className="truncate text-xs text-ink-soft">{user.email}</p>
                    {plan && <span className="mt-2 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">Plano {PLAN_INFO[plan.plan].name}</span>}
                  </div>
                  <div className="my-1 border-t border-line" />
                  <Link to="/configuracoes?tab=perfil" onClick={close}><MenuItem icon={<User />}>Meu perfil</MenuItem></Link>
                  <Link to="/configuracoes?tab=plano" onClick={close}><MenuItem icon={<CreditCard />}>Plano e assinatura</MenuItem></Link>
                  <Link to="/configuracoes" onClick={close}><MenuItem icon={<Settings />}>Configurações</MenuItem></Link>
                  <MenuItem icon={<HelpCircle />} onClick={() => { setHelpOpen(true); close(); }}>Ajuda</MenuItem>
                  <div className="my-1 border-t border-line" />
                  <MenuItem icon={<LogOut />} danger onClick={async () => { await signOut(); navigate("/entrar"); }}>Sair</MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div key={location.pathname} className="animate-fade-in"><Outlet /></div>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      {profile && !profile.tutorial_completed && location.pathname === "/app" && <Tutorial />}
    </div>
  );
}
