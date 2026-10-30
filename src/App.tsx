import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/ui/misc";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";
import SetupRequired from "@/pages/SetupRequired";

const Landing = lazy(() => import("@/pages/Landing"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Signup = lazy(() => import("@/pages/auth/Signup"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Planning = lazy(() => import("@/pages/Planning"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Studio = lazy(() => import("@/pages/Studio"));
const Ideas = lazy(() => import("@/pages/Ideas"));
const Scripts = lazy(() => import("@/pages/Scripts"));
const ScriptEditor = lazy(() => import("@/pages/ScriptEditor"));
const Production = lazy(() => import("@/pages/Production"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Projects = lazy(() => import("@/pages/Projects"));
const Library = lazy(() => import("@/pages/Library"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? <Navigate to="/app" replace /> : <>{children}</>;
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/precos" element={<Pricing />} />
        <Route path="/entrar" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/cadastro" element={<PublicOnly><Signup /></PublicOnly>} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppLayout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/planejamento" element={<Planning />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/estudio" element={<Studio />} />
          <Route path="/ideias" element={<Ideas />} />
          <Route path="/roteiros" element={<Scripts />} />
          <Route path="/roteiros/:id" element={<ScriptEditor />} />
          <Route path="/producao" element={<Production />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/projetos" element={<Projects />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
