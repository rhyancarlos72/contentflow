import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, BellOff, CalendarCheck, CheckCheck, FileBarChart, Target, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn, fmtRelative } from "@/lib/utils";
import type { AppNotification } from "@/types";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/misc";

const ICONS: Record<string, typeof Bell> = {
  gravacao: Video, publicacao: CalendarCheck, tarefa_atrasada: AlarmClock,
  planejamento_semanal: Target, meta: Target, relatorio_semanal: FileBarChart,
};

export function NotificationsMenu() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as AppNotification[];
    },
  });
  const unread = data.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Dropdown className="w-[min(92vw,380px)] p-0"
      trigger={() => (
        <button className="relative grid h-10 w-10 place-items-center rounded-xl text-ink-soft transition hover:bg-brand-50 hover:text-brand-700" aria-label="Notificações">
          <Bell className="h-[19px] w-[19px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}>
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">Notificações</p>
            {unread > 0 && (
              <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />}
                onClick={() => markRead.mutate(data.filter((n) => !n.read_at).map((n) => n.id))}>
                Marcar todas
              </Button>
            )}
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto p-1.5">
            {data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-ink-soft">
                <BellOff className="h-6 w-6 text-ink-faint" />
                Nenhuma notificação por enquanto. Lembretes de gravação, publicações e tarefas aparecem aqui.
              </div>
            ) : data.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <button key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate([n.id]);
                    if (n.link) navigate(n.link);
                    close();
                  }}
                  className={cn("flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas", !n.read_at && "bg-brand-50/50")}>
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand-600 shadow-card">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-ink-faint">{fmtRelative(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
