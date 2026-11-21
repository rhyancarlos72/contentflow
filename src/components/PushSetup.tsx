import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Download, Share, Smartphone, SquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushState, sendTestPush, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { cn, fmtRelative } from "@/lib/utils";
import { Button } from "./ui/Button";

interface Device { id: string; device_label: string | null; created_at: string; last_success_at: string | null; endpoint: string }
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() => ((window as { __installPrompt?: InstallPrompt }).__installPrompt ?? null));
  useEffect(() => {
    const on = () => setPrompt((window as { __installPrompt?: InstallPrompt }).__installPrompt ?? null);
    window.addEventListener("cf:installable", on);
    return () => window.removeEventListener("cf:installable", on);
  }, []);
  return prompt;
}

/** Ativação de notificações push neste aparelho, com instruções para iPhone. */
export function PushSetup({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [state, setState] = useState<PushState>(() => pushState());
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const install = useInstallPrompt();

  useEffect(() => { currentSubscription().then((s) => setThisEndpoint(s?.endpoint ?? null)); }, []);

  const devices = useQuery({
    queryKey: ["push-devices", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("push_subscriptions").select("id, device_label, created_at, last_success_at, endpoint").order("created_at");
      if (error) throw error;
      return data as Device[];
    },
  });
  const activeHere = Boolean(thisEndpoint && devices.data?.some((d) => d.endpoint === thisEndpoint));

  const enable = async () => {
    setBusy(true);
    const res = await enablePush(user!.id);
    setBusy(false);
    setState(pushState());
    if (!res.ok) return toast.error(res.message);
    const sub = await currentSubscription();
    setThisEndpoint(sub?.endpoint ?? null);
    qc.invalidateQueries({ queryKey: ["push-devices"] });
    toast.success("Notificações ativadas neste aparelho!");
    const err = await sendTestPush();
    if (err) toast.message("Ativado. O teste falhou: " + err);
  };

  if (state === "needs-install") {
    return (
      <div className={cn("rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5", compact && "p-4")}>
        <p className="flex items-center gap-2 font-bold"><Smartphone className="h-5 w-5 text-brand-600" />Receba lembretes no iPhone</p>
        <p className="mt-1 text-sm text-ink-soft">No iPhone, as notificações funcionam com o app instalado na Tela de Início (iOS 16.4 ou mais novo):</p>
        <ol className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">1</span>No Safari, toque em <Share className="mx-0.5 inline h-4 w-4 text-brand-600" /> <strong>Compartilhar</strong></li>
          <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">2</span>Escolha <SquarePlus className="mx-0.5 inline h-4 w-4 text-brand-600" /> <strong>Adicionar à Tela de Início</strong></li>
          <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">3</span>Abra o ContentFlow pelo ícone e ative aqui</li>
        </ol>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5", compact && "p-4")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", activeHere ? "bg-positive-soft text-positive" : "bg-brand-50 text-brand-600")}>
          {activeHere ? <CheckCircle2 className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{activeHere ? "Notificações ativas neste aparelho" : "Notificações no celular e no computador"}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {state === "unsupported" ? "Este navegador não suporta notificações push. Use Chrome, Edge, Firefox ou Safari atualizado."
              : state === "denied" ? "As notificações foram bloqueadas. Libere nas configurações do navegador/celular para este site e tente de novo."
              : "Lembretes de gravação, publicações do dia, tarefas atrasadas, metas e relatório semanal."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {install && !isStandalone() && !isIOS() && (
            <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />}
              onClick={async () => { await install.prompt(); await install.userChoice; (window as { __installPrompt?: unknown }).__installPrompt = undefined; }}>
              Instalar app
            </Button>
          )}
          {state !== "unsupported" && (activeHere ? (
            <>
              <Button size="sm" variant="soft" loading={busy} onClick={async () => { setBusy(true); const e = await sendTestPush(); setBusy(false); if (e) toast.error(e); else toast.success("Notificação de teste enviada!"); }}>Enviar teste</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await disablePush(); setThisEndpoint(null); qc.invalidateQueries({ queryKey: ["push-devices"] }); toast.success("Desativado neste aparelho"); }}>Desativar</Button>
            </>
          ) : (
            <Button size="sm" loading={busy} icon={<BellRing className="h-4 w-4" />} onClick={enable} disabled={state === "denied"}>Ativar notificações</Button>
          ))}
        </div>
      </div>
      {!compact && (devices.data?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-line pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Aparelhos que recebem</p>
          {devices.data!.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
              <Smartphone className="h-4 w-4 text-ink-soft" />
              <span className="flex-1">{d.device_label ?? "Aparelho"}{d.endpoint === thisEndpoint && <span className="ml-1.5 text-xs font-semibold text-positive">(este)</span>}</span>
              <span className="text-xs text-ink-faint">{d.last_success_at ? `último envio ${fmtRelative(d.last_success_at)}` : `ativado ${fmtRelative(d.created_at)}`}</span>
              <button onClick={async () => { await supabase.from("push_subscriptions").delete().eq("id", d.id); qc.invalidateQueries({ queryKey: ["push-devices"] }); }}
                className="text-ink-faint hover:text-[#D93A4A]" aria-label="Remover aparelho"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Convite no Dashboard: aparece até a pessoa ativar ou dispensar. */
export function PushPrompt() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("cf:push-dismissed") === "1"; } catch { return false; }
  });
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => { currentSubscription().then((s) => setActive(Boolean(s))); }, []);
  const state = pushState();
  if (hidden || active !== false || state === "unsupported" || state === "denied") return null;
  return (
    <div className="relative">
      <PushSetup compact />
      <button onClick={() => { try { localStorage.setItem("cf:push-dismissed", "1"); } catch { /* sem storage */ } setHidden(true); }}
        className="absolute right-2 top-2 rounded-lg px-2 py-1 text-xs font-semibold text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Dispensar">Agora não</button>
    </div>
  );
}
