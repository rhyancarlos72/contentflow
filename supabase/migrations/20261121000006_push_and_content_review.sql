-- =============================================================================
-- Notificações push (PWA no iPhone/Android/desktop) e análise de conteúdo.
-- =============================================================================

-- Assinaturas Web Push de cada aparelho do usuário.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: dono" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Controle de envio por push (o e-mail já usa emailed_at).
alter table public.notifications add column if not exists pushed_at timestamptz;
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Preferência de push ligada por padrão para quem ativar no aparelho.
update public.profiles
   set notification_prefs = notification_prefs || jsonb_build_object('push', true)
 where not (notification_prefs ? 'push');
alter table public.profiles alter column notification_prefs set default jsonb_build_object(
  'in_app', true, 'email', false, 'push', true, 'whatsapp', false, 'recording_reminders', true,
  'scheduled_posts', true, 'overdue_tasks', true, 'weekly_planning', true, 'goals', true, 'weekly_report', true
);

-- Análises de conteúdo publicadas (link + texto + capa → diagnóstico da IA).
create table public.content_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  url text,
  platform text,
  title text not null default 'Análise de conteúdo' check (char_length(title) between 1 and 200),
  thumbnail_url text,
  audience text not null default '',
  input jsonb not null default '{}'::jsonb,
  result jsonb not null,
  overall_score int check (overall_score between 0 and 100),
  created_at timestamptz not null default now()
);
create index content_analyses_project_idx on public.content_analyses (project_id, created_at desc);

alter table public.content_analyses enable row level security;
create policy "content_analyses: dono" on public.content_analyses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_project(project_id));

-- Análise de conteúdo em todos os planos; no gratuito, 3 por mês.
update public.plan_limits
   set features = array(select distinct unnest(features || array['ai_review']));
update public.plan_limits
   set tool_limits = tool_limits || '{"content_review": 3}'::jsonb
 where plan = 'free';

-- Segredos gerados pelo próprio servidor (chaves VAPID do push, senha do agendamento).
-- RLS ligado e nenhuma política: só o service role (Edge Functions) lê e grava.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value)
values ('cron_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
