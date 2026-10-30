-- =============================================================================
-- Notificações e lembretes automáticos
-- generate_notifications() é idempotente (dedupe_key) e pode rodar a cada hora.
-- Respeita as preferências em profiles.notification_prefs.
-- =============================================================================

create or replace function public.generate_notifications()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_rows int;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_week_start date := date_trunc('week', v_today)::date;
begin
  -- 1. Conteúdo que precisa ser gravado (publicação nos próximos 3 dias)
  insert into notifications (user_id, project_id, type, title, body, link, dedupe_key)
  select p.user_id, p.project_id, 'gravacao',
         'Gravação pendente: ' || p.title,
         'Publicação prevista para ' || to_char(p.scheduled_date, 'DD/MM') || ' ainda não foi gravada.',
         '/calendario?post=' || p.id, 'gravacao:' || p.id
    from calendar_posts p join profiles pr on pr.id = p.user_id
   where p.status in ('planejado', 'roteiro_pronto', 'gravacao_pendente')
     and p.scheduled_date between v_today and v_today + 3
     and coalesce((pr.notification_prefs ->> 'recording_reminders')::boolean, true)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 2. Publicação programada para hoje/amanhã
  insert into notifications (user_id, project_id, type, title, body, link, dedupe_key)
  select p.user_id, p.project_id, 'publicacao',
         'Publicação programada: ' || p.title,
         initcap(p.platform) || ' · ' || to_char(p.scheduled_date, 'DD/MM')
           || coalesce(' às ' || to_char(p.scheduled_time, 'HH24:MI'), ''),
         '/calendario?post=' || p.id, 'publicacao:' || p.id || ':' || p.scheduled_date
    from calendar_posts p join profiles pr on pr.id = p.user_id
   where p.status in ('aprovado', 'agendado')
     and p.scheduled_date between v_today and v_today + 1
     and coalesce((pr.notification_prefs ->> 'scheduled_posts')::boolean, true)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 3. Tarefas atrasadas
  insert into notifications (user_id, project_id, type, title, body, link, dedupe_key)
  select t.user_id, t.project_id, 'tarefa_atrasada',
         'Tarefa atrasada: ' || t.title,
         'O prazo era ' || to_char(t.due_date, 'DD/MM') || '.',
         '/producao?task=' || t.id, 'atrasada:' || t.id || ':' || t.due_date
    from production_tasks t join profiles pr on pr.id = t.user_id
   where t.completed_at is null and t.due_date < v_today
     and coalesce((pr.notification_prefs ->> 'overdue_tasks')::boolean, true)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 4. Planejamento semanal (segunda-feira) quando a semana está vazia
  if extract(isodow from v_today) = 1 then
    insert into notifications (user_id, project_id, type, title, body, link, dedupe_key)
    select pj.user_id, pj.id, 'planejamento_semanal',
           'Planeje a semana de ' || pj.name,
           'Ainda não há publicações para esta semana. Que tal gerar um planejamento com a IA?',
           '/planejamento', 'semana:' || pj.id || ':' || v_week_start
      from projects pj join profiles pr on pr.id = pj.user_id
     where not pj.archived
       and coalesce((pr.notification_prefs ->> 'weekly_planning')::boolean, true)
       and not exists (select 1 from calendar_posts p where p.project_id = pj.id
                        and p.scheduled_date between v_week_start and v_week_start + 6)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_rows = row_count; v_count := v_count + v_rows;

    -- 5. Relatório semanal com números reais da semana anterior
    insert into notifications (user_id, type, title, body, link, dedupe_key)
    select pr.id, 'relatorio_semanal', 'Seu resumo da semana',
           format('Semana passada: %s publicação(ões) publicada(s), %s tarefa(s) concluída(s), %s visualização(ões) registrada(s).',
             (select count(*) from calendar_posts p where p.user_id = pr.id and p.status = 'publicado'
                and p.published_at >= v_week_start - 7 and p.published_at < v_week_start),
             (select count(*) from production_tasks t where t.user_id = pr.id
                and t.completed_at >= v_week_start - 7 and t.completed_at < v_week_start),
             (select coalesce(sum(a.views), 0) from analytics a where a.user_id = pr.id
                and a.published_on >= v_week_start - 7 and a.published_on < v_week_start)),
           '/analytics', 'relatorio:' || v_week_start
      from profiles pr
     where pr.onboarding_completed
       and coalesce((pr.notification_prefs ->> 'weekly_report')::boolean, true)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  end if;

  -- 6. Meta semanal (a partir de quinta-feira, se ainda não atingida)
  if extract(isodow from v_today) >= 4 then
    insert into notifications (user_id, type, title, body, link, dedupe_key)
    select pr.id, 'meta', 'Meta semanal em risco',
           format('Você publicou %s de %s conteúdos planejados para esta semana.', s.done, pr.weekly_goal),
           '/calendario', 'meta:' || v_week_start
      from profiles pr
      cross join lateral (
        select count(*) as done from calendar_posts p
         where p.user_id = pr.id and p.status = 'publicado' and p.published_at >= v_week_start
      ) s
     where pr.weekly_goal > 0 and s.done < pr.weekly_goal
       and coalesce((pr.notification_prefs ->> 'goals')::boolean, true)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  end if;

  return v_count;
end $$;

revoke execute on function public.generate_notifications() from public, anon, authenticated;

-- Agenda a geração a cada hora quando pg_cron estiver disponível (Supabase: Database → Extensions).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('contentflow-notifications', '5 * * * *', 'select public.generate_notifications()');
  else
    raise notice 'pg_cron indisponível: agende public.generate_notifications() externamente.';
  end if;
end $$;
