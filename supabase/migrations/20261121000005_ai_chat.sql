-- =============================================================================
-- Assistente de conversa (chat) com histórico por projeto.
-- =============================================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_project_idx on public.ai_conversations (project_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 40000),
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "ai_conversations: dono" on public.ai_conversations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_project(project_id));

create policy "ai_messages: dono" on public.ai_messages for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- Chat e gerador de temas liberados em todos os planos (contam no limite mensal de IA).
update public.plan_limits
   set features = array(select distinct unnest(features || array['ai_chat', 'ai_topics']));
