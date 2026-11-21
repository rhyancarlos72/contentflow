-- =============================================================================
-- Agenda o envio dos lembretes (push + e-mail) a cada hora.
-- pg_cron chama a Edge Function send-notification-emails via pg_net, com a senha
-- gerada em public.app_secrets ('cron_secret').
-- Em outro projeto, troque SEU_REF na URL (ou rode o bloco do README).
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis: agende o envio externamente (ver README).';
    return;
  end if;
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'contentflow-dispatch') then
    perform cron.schedule('contentflow-dispatch', '7 * * * *', $job$
      select net.http_post(
        url := 'https://slnrnndioeiaibyyazzh.supabase.co/functions/v1/send-notification-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000)
    $job$);
  end if;
end $$;
