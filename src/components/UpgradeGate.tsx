import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { FEATURE_LABELS, minimumPlanFor, PLAN_INFO } from "@/lib/constants";
import { Button } from "./ui/Button";

/** Mostra o conteúdo se o plano tiver o recurso; senão, um convite de upgrade. */
export function UpgradeGate({ feature, children, compact }: { feature: string; children: ReactNode; compact?: boolean }) {
  const { hasFeature, plan } = useWorkspace();
  if (!plan) return null;
  if (hasFeature(feature)) return <>{children}</>;
  return <UpgradeCard feature={feature} compact={compact} />;
}

export function UpgradeCard({ feature, compact, message }: { feature?: string; compact?: boolean; message?: string }) {
  const target = feature ? minimumPlanFor(feature) : "creator";
  const info = PLAN_INFO[target];
  return (
    <div className={compact ? "rounded-2xl border border-brand-100 bg-brand-50/60 p-4" : "card overflow-hidden"}>
      <div className={compact ? "flex flex-wrap items-center gap-3" : "relative px-6 py-12 text-center"}>
        {!compact && <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-brand-50 to-transparent" />}
        <div className={compact ? "grid h-9 w-9 place-items-center rounded-xl bg-white text-brand-600" : "relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand-600 shadow-card"}>
          <Lock className="h-5 w-5" />
        </div>
        <div className={compact ? "flex-1" : "relative"}>
          <h3 className="font-bold">
            {feature ? `${FEATURE_LABELS[feature] ?? "Recurso"} está no plano ${info.name}` : "Recurso premium"}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            {message ?? `A partir de R$ ${info.price.toFixed(2).replace(".", ",")}/mês. Cancele quando quiser.`}
          </p>
        </div>
        <Link to="/precos" className={compact ? "" : "relative mt-5 inline-block"}>
          <Button size={compact ? "sm" : "md"} icon={<Sparkles className="h-4 w-4" />}>Ver planos</Button>
        </Link>
      </div>
    </div>
  );
}
