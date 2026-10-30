-- =============================================================================
-- ContentFlow AI — schema principal
-- Tabelas, relacionamentos, índices, validações, gatilhos e Row Level Security.
-- Toda tabela de domínio carrega user_id para que as políticas RLS sejam simples
-- e rápidas (user_id = auth.uid()); tabelas ligadas a projeto também validam que
-- o projeto pertence ao mesmo usuário.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos auxiliares
-- -----------------------------------------------------------------------------
create type public.plan_tier as enum ('free', 'creator', 'pro');

create type public.post_status as enum (
  'ideia', 'planejado', 'roteiro_pronto', 'gravacao_pendente',
  'em_edicao', 'aprovado', 'agendado', 'publicado'
);

create type public.production_stage as enum (
  'ideias', 'planejamento', 'roteiro', 'gravacao', 'edicao', 'revisao', 'publicado'
);

create type public.task_priority as enum ('baixa', 'media', 'alta', 'urgente');

create type public.memory_kind as enum (
  'estilo', 'tom_de_voz', 'publico', 'assunto_abordado', 'conteudo_aprovado',
  'preferencia', 'objetivo', 'palavra_evitar'
);

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text,
  avatar_url text,
  niche text,
  communication_style text,
  preferred_language text not null default 'pt-BR',
  weekly_goal int not null default 3 check (weekly_goal between 0 and 50),
  onboarding_completed boolean not null default false,
  tutorial_completed boolean not null default false,
  active_project_id uuid,
  notification_prefs jsonb not null default jsonb_build_object(
    'in_app', true,
    'email', false,
    'whatsapp', false,
    'recording_reminders', true,
    'scheduled_posts', true,
    'overdue_tasks', true,
    'weekly_planning', true,
    'goals', true,
    'weekly_report', true
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  kind text not null default 'marca_pessoal'
    check (kind in ('marca_pessoal', 'loja_virtual', 'perfil_profissional', 'projeto_educacional', 'agencia', 'cliente', 'outro')),
  niche text not null default '',
  audience text not null default '',
  voice text not null default '',            -- identidade de comunicação
  platforms text[] not null default '{}',
  goals text[] not null default '{}',
  posts_per_week int not null default 3 check (posts_per_week between 0 and 50),
  color text not null default '#7952D6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id) where not archived;

alter table public.profiles
  add constraint profiles_active_project_fk
  foreign key (active_project_id) references public.projects (id) on delete set null;

-- Verifica se um projeto pertence ao usuário autenticado (usado nas políticas).
create or replace function public.owns_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_project_id is null or exists (
    select 1 from public.projects where id = p_project_id and user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- subscriptions (escrita apenas pelo service role / webhooks)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan plan_tier not null default 'free',
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid')),
  provider text,                     -- 'stripe', 'mercadopago', ...
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Limites de cada plano: fonte única de verdade, lida pelo backend e pelo app.
create table public.plan_limits (
  plan plan_tier primary key,
  max_projects int not null,
  monthly_ai_generations int not null,
  max_plan_days int not null,
  features text[] not null
);

insert into public.plan_limits (plan, max_projects, monthly_ai_generations, max_plan_days, features) values
  ('free', 1, 20, 7,
    array['calendar', 'ideas_bank', 'manual_scripts', 'ai_ideas', 'ai_hooks', 'ai_hashtags', 'ai_suggestions']),
  ('creator', 3, 150, 15,
    array['calendar', 'ideas_bank', 'manual_scripts', 'ai_ideas', 'ai_hooks', 'ai_hashtags', 'ai_suggestions',
          'ai_plan', 'ai_scripts', 'ai_captions', 'ai_cta', 'analytics_manual', 'library', 'ai_analytics']),
  ('pro', 15, 600, 30,
    array['calendar', 'ideas_bank', 'manual_scripts', 'ai_ideas', 'ai_hooks', 'ai_hashtags', 'ai_suggestions',
          'ai_plan', 'ai_scripts', 'ai_captions', 'ai_cta', 'analytics_manual', 'library', 'ai_analytics',
          'advanced_memory', 'advanced_analytics', 'reports', 'collaboration']);

-- Plano efetivo do usuário: assinaturas pagas só valem se ativas e dentro do período.
create or replace function public.effective_plan(p_user_id uuid)
returns plan_tier language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.plan from public.subscriptions s
    where s.user_id = p_user_id
      and (
        s.plan = 'free'
        or (s.status in ('active', 'trialing')
            and (s.current_period_end is null or s.current_period_end > now()))
      )
  ), 'free'::plan_tier);
$$;

-- -----------------------------------------------------------------------------
-- social_accounts — contas por projeto (preparado para integrações oficiais)
-- -----------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null,
  handle text not null check (char_length(handle) between 1 and 120),
  profile_url text,
  followers int check (followers >= 0),
  connection_type text not null default 'manual' check (connection_type in ('manual', 'oauth')),
  -- Tokens de API ficam fora do alcance do cliente (ver tabela social_tokens).
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, platform, handle)
);
create index social_accounts_project_idx on public.social_accounts (project_id);

-- Tokens OAuth das redes (somente service role; sem políticas para usuários).
create table public.social_tokens (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- idea_categories / content_ideas
-- -----------------------------------------------------------------------------
create table public.idea_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#7952D6',
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  category_id uuid references public.idea_categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  niche text not null default '',
  format text,
  reference text not null default '',
  inspiration_url text,
  notes text not null default '',
  is_favorite boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  converted_script_id uuid,
  converted_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_ideas_project_idx on public.content_ideas (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- content_plans — planejamentos estratégicos gerados pela IA
-- -----------------------------------------------------------------------------
create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  days int not null check (days in (7, 15, 30)),
  start_date date not null,
  briefing jsonb not null,           -- respostas do formulário
  strategy_summary text not null default '',
  items jsonb not null default '[]', -- publicações planejadas (editáveis)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_plans_project_idx on public.content_plans (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- script_folders / scripts
-- -----------------------------------------------------------------------------
create table public.script_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  folder_id uuid references public.script_folders (id) on delete set null,
  idea_id uuid references public.content_ideas (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '',
  notes text not null default '',
  duration_seconds int check (duration_seconds between 5 and 3600),
  platform text,
  format text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'em_revisao', 'aprovado', 'gravado', 'arquivado')),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scripts_project_idx on public.scripts (project_id, updated_at desc);

alter table public.content_ideas
  add constraint content_ideas_script_fk foreign key (converted_script_id)
  references public.scripts (id) on delete set null;

-- -----------------------------------------------------------------------------
-- calendar_posts — publicações do calendário editorial
-- -----------------------------------------------------------------------------
create table public.calendar_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_id uuid references public.content_plans (id) on delete set null,
  script_id uuid references public.scripts (id) on delete set null,
  idea_id uuid references public.content_ideas (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  scheduled_date date not null,
  scheduled_time time,
  platform text not null,
  format text not null default 'post',
  status post_status not null default 'planejado',
  content_pillar text check (content_pillar in ('educativo', 'emocional', 'informativo', 'entretenimento', 'vendas', 'autoridade', 'comunidade')),
  strategic_goal text not null default '',
  hook text not null default '',
  script_outline text not null default '',
  caption text not null default '',
  cta text not null default '',
  hashtags text[] not null default '{}',
  notes text not null default '',
  published_at timestamptz,
  external_post_id text,             -- id da publicação na rede (integrações futuras)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_posts_project_date_idx on public.calendar_posts (project_id, scheduled_date);
create index calendar_posts_user_status_idx on public.calendar_posts (user_id, status);

alter table public.content_ideas
  add constraint content_ideas_post_fk foreign key (converted_post_id)
  references public.calendar_posts (id) on delete set null;

-- Marca published_at quando o status vira "publicado".
create or replace function public.calendar_posts_status_change()
returns trigger language plpgsql as $$
begin
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status is distinct from 'publicado') then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status <> 'publicado' then
    new.published_at := null;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- production_tasks — Kanban de produção
-- -----------------------------------------------------------------------------
create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  post_id uuid references public.calendar_posts (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  stage production_stage not null default 'ideias',
  position double precision not null default 0,
  assignee text not null default '',
  due_date date,
  platform text,
  priority task_priority not null default 'media',
  notes text not null default '',
  checklist jsonb not null default '[]',      -- [{id, text, done}]
  attachments jsonb not null default '[]',    -- [{path, name, size, type}] no Storage
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index production_tasks_project_idx on public.production_tasks (project_id, stage, position);
create index production_tasks_due_idx on public.production_tasks (user_id, due_date) where completed_at is null;

create or replace function public.production_tasks_stage_change()
returns trigger language plpgsql as $$
begin
  if new.stage = 'publicado' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- analytics — métricas registradas por publicação
-- -----------------------------------------------------------------------------
create table public.analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  post_id uuid references public.calendar_posts (id) on delete set null,
  title text not null,                       -- cópia para manter histórico se o post for apagado
  platform text not null,
  format text not null default 'post',
  topic text not null default '',
  published_on date not null,
  views int not null default 0 check (views >= 0),
  reach int not null default 0 check (reach >= 0),
  likes int not null default 0 check (likes >= 0),
  comments int not null default 0 check (comments >= 0),
  shares int not null default 0 check (shares >= 0),
  saves int not null default 0 check (saves >= 0),
  followers_gained int not null default 0,
  clicks int not null default 0 check (clicks >= 0),
  -- engajamento = interações / alcance (ou visualizações quando não há alcance)
  engagement_rate numeric generated always as (
    case
      when reach > 0 then round(((likes + comments + shares + saves)::numeric / reach) * 100, 2)
      when views > 0 then round(((likes + comments + shares + saves)::numeric / views) * 100, 2)
      else null
    end
  ) stored,
  source text not null default 'manual' check (source in ('manual', 'api')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analytics_project_idx on public.analytics (project_id, published_on);

-- -----------------------------------------------------------------------------
-- ai_memory — memória estratégica isolada por projeto
-- -----------------------------------------------------------------------------
create table public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind memory_kind not null,
  content text not null check (char_length(content) between 1 and 1000),
  source text not null default 'manual' check (source in ('manual', 'onboarding', 'auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, kind, content)
);
create index ai_memory_project_idx on public.ai_memory (project_id, kind);

-- Aprendizado automático: posts aprovados/publicados viram memória do projeto.
create or replace function public.learn_from_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('aprovado', 'publicado')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.ai_memory (user_id, project_id, kind, content, source)
    values (new.user_id, new.project_id, 'assunto_abordado', left(new.title, 1000), 'auto')
    on conflict do nothing;
    if new.status = 'aprovado' and new.hook <> '' then
      insert into public.ai_memory (user_id, project_id, kind, content, source)
      values (new.user_id, new.project_id, 'conteudo_aprovado',
              left(new.title || ' — gancho: ' || new.hook, 1000), 'auto')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- library_items — Biblioteca de conteúdo (textos salvos, arquivos, links)
-- -----------------------------------------------------------------------------
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('texto', 'legenda', 'gancho', 'cta', 'hashtags', 'roteiro', 'arquivo', 'link')),
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '',
  url text,
  file_path text,
  file_size bigint,
  mime_type text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_items_project_idx on public.library_items (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null check (type in ('gravacao', 'publicacao', 'tarefa_atrasada', 'planejamento_semanal', 'meta', 'relatorio_semanal', 'sistema')),
  title text not null,
  body text not null default '',
  link text,
  dedupe_key text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- ai_usage — controle de uso e custo (somente leitura para o usuário)
-- -----------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  tool text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  success boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_month_idx on public.ai_usage (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Gatilhos updated_at e regras de negócio
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'projects', 'subscriptions', 'social_accounts', 'content_ideas',
    'content_plans', 'scripts', 'calendar_posts', 'production_tasks', 'analytics', 'ai_memory', 'library_items']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create trigger calendar_posts_status before insert or update of status on public.calendar_posts
  for each row execute function public.calendar_posts_status_change();
create trigger calendar_posts_learn after insert or update of status on public.calendar_posts
  for each row execute function public.learn_from_post();
create trigger production_tasks_stage before insert or update of stage on public.production_tasks
  for each row execute function public.production_tasks_stage_change();

-- Limite de projetos por plano, validado no banco (não confia no cliente).
create or replace function public.enforce_project_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_count int;
begin
  select max_projects into v_limit from public.plan_limits where plan = public.effective_plan(new.user_id);
  select count(*) into v_count from public.projects where user_id = new.user_id and not archived;
  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT_PROJECTS: seu plano permite até % projeto(s) ativo(s).', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_limit before insert on public.projects
  for each row execute function public.enforce_project_limit();

-- Novo usuário: cria perfil e assinatura gratuita.
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
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.subscriptions enable row level security;
alter table public.plan_limits enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_tokens enable row level security;
alter table public.idea_categories enable row level security;
alter table public.content_ideas enable row level security;
alter table public.content_plans enable row level security;
alter table public.script_folders enable row level security;
alter table public.scripts enable row level security;
alter table public.calendar_posts enable row level security;
alter table public.production_tasks enable row level security;
alter table public.analytics enable row level security;
alter table public.ai_memory enable row level security;
alter table public.library_items enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_usage enable row level security;

create policy "profiles: próprio perfil" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: atualizar próprio" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and public.owns_project(active_project_id));

create policy "projects: dono" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "subscriptions: ler a própria" on public.subscriptions
  for select using (user_id = auth.uid());

create policy "plan_limits: leitura pública" on public.plan_limits
  for select using (true);

create policy "ai_usage: ler o próprio" on public.ai_usage
  for select using (user_id = auth.uid());

create policy "notifications: ler" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: marcar como lida" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: excluir" on public.notifications
  for delete using (user_id = auth.uid());

-- Tabelas ligadas a projeto: dono do registro e dono do projeto.
do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'idea_categories', 'content_ideas', 'content_plans',
    'script_folders', 'scripts', 'calendar_posts', 'production_tasks', 'analytics', 'ai_memory', 'library_items']
  loop
    execute format(
      'create policy "%1$s: dono" on public.%1$I for all
         using (user_id = auth.uid())
         with check (user_id = auth.uid() and public.owns_project(project_id))', t);
  end loop;
end $$;

-- Notificações: o cliente só pode alterar read_at (conteúdo é gerado pelo servidor).
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Tabelas internas: nada para o cliente.
revoke all on public.social_tokens from authenticated, anon;

-- -----------------------------------------------------------------------------
-- Busca global (uma chamada, respeitando RLS por ser security invoker)
-- -----------------------------------------------------------------------------
create or replace function public.global_search(p_query text, p_project_id uuid default null)
returns table (kind text, id uuid, title text, subtitle text, project_id uuid)
language sql stable security invoker set search_path = public as $$
  with q as (select '%' || replace(replace(trim(p_query), '%', '\%'), '_', '\_') || '%' as pattern)
  (select 'post', p.id, p.title, p.platform || ' · ' || to_char(p.scheduled_date, 'DD/MM/YYYY'), p.project_id
     from calendar_posts p, q
    where (p_project_id is null or p.project_id = p_project_id)
      and (p.title ilike q.pattern or p.caption ilike q.pattern)
    order by p.scheduled_date desc limit 8)
  union all
  (select 'idea', i.id, i.title, left(i.description, 80), i.project_id
     from content_ideas i, q
    where (p_project_id is null or i.project_id = p_project_id)
      and (i.title ilike q.pattern or i.description ilike q.pattern)
    order by i.created_at desc limit 8)
  union all
  (select 'script', s.id, s.title, coalesce(s.platform, '') || ' · ' || s.status, s.project_id
     from scripts s, q
    where (p_project_id is null or s.project_id = p_project_id)
      and (s.title ilike q.pattern or s.content ilike q.pattern)
    order by s.updated_at desc limit 8)
  union all
  (select 'task', t.id, t.title, t.stage::text, t.project_id
     from production_tasks t, q
    where (p_project_id is null or t.project_id = p_project_id)
      and t.title ilike q.pattern
    order by t.updated_at desc limit 8)
  union all
  (select 'library', l.id, l.title, l.kind, l.project_id
     from library_items l, q
    where (p_project_id is null or l.project_id = p_project_id)
      and (l.title ilike q.pattern or l.content ilike q.pattern)
    order by l.created_at desc limit 8);
$$;

-- Uso de IA no mês corrente + limites do plano (consumido pelo app).
create or replace function public.my_plan_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plan', public.effective_plan(auth.uid()),
    'limits', (select row_to_json(l) from public.plan_limits l where l.plan = public.effective_plan(auth.uid())),
    'ai_used_this_month', (
      select count(*) from public.ai_usage
      where user_id = auth.uid() and success and created_at >= date_trunc('month', now())
    ),
    'projects_count', (select count(*) from public.projects where user_id = auth.uid() and not archived),
    'subscription', (select row_to_json(s) from (
      select plan, status, current_period_end, cancel_at_period_end, provider
      from public.subscriptions where user_id = auth.uid()) s)
  );
$$;

-- -----------------------------------------------------------------------------
-- Storage: anexos e biblioteca. Caminho obrigatório: {user_id}/...
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('content-files', 'content-files', false, 52428800)
on conflict (id) do nothing;

create policy "content-files: ler próprios" on storage.objects
  for select to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "content-files: enviar próprios" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "content-files: atualizar próprios" on storage.objects
  for update to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "content-files: excluir próprios" on storage.objects
  for delete to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);
