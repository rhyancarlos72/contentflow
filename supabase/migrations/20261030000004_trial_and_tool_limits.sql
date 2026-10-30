-- =============================================================================
-- Teste grátis de 7 dias (Pro) para novas contas + limites por ferramenta.
-- O teste usa a própria tabela subscriptions (status 'trialing' com
-- current_period_end); effective_plan() já volta a 'free' quando ele vence.
-- =============================================================================

alter table public.plan_limits
  add column if not exists tool_limits jsonb not null default '{}'::jsonb;

-- Plano gratuito: roteiros com IA liberados, com limite mensal próprio.
update public.plan_limits
   set features = array(select distinct unnest(features || array['ai_scripts'])),
       tool_limits = '{"script": 5}'::jsonb
 where plan = 'free';

-- Contas novas começam com 7 dias de Pro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.subscriptions (user_id, plan, status, current_period_end)
  values (new.id, 'pro', 'trialing', now() + interval '7 days');
  return new;
end $$;

-- Contas já existentes que nunca assinaram também ganham o teste.
update public.subscriptions
   set plan = 'pro', status = 'trialing', current_period_end = now() + interval '7 days'
 where plan = 'free' and provider is null and provider_subscription_id is null;

-- Status do plano agora inclui o uso por ferramenta no mês e o fim do teste.
create or replace function public.my_plan_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plan', public.effective_plan(auth.uid()),
    'limits', (select row_to_json(l) from public.plan_limits l where l.plan = public.effective_plan(auth.uid())),
    'ai_used_this_month', (
      select count(*) from public.ai_usage
      where user_id = auth.uid() and success and created_at >= date_trunc('month', now())
    ),
    'tool_usage', coalesce((
      select json_object_agg(tool, n) from (
        select tool, count(*) as n from public.ai_usage
        where user_id = auth.uid() and success and created_at >= date_trunc('month', now())
        group by tool
      ) t
    ), '{}'::json),
    'projects_count', (select count(*) from public.projects where user_id = auth.uid() and not archived),
    'trial_ends_at', (
      select current_period_end from public.subscriptions
      where user_id = auth.uid() and status = 'trialing' and current_period_end > now()
    ),
    'subscription', (select row_to_json(s) from (
      select plan, status, current_period_end, cancel_at_period_end, provider
      from public.subscriptions where user_id = auth.uid()) s)
  );
$$;
