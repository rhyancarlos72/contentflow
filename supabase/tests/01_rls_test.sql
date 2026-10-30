-- Testes de isolamento entre usuários, limites de plano e gatilhos.
-- Rodar após 00_supabase_stub.sql + migrações (ver README, seção Testes).
\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev', '{"full_name":"Bruno"}');

do $$ begin
  assert (select count(*) from profiles) = 2, 'perfis criados pelo gatilho';
  assert (select count(*) from subscriptions where plan = 'free') = 2, 'assinaturas gratuitas criadas';
end $$;

-- Usuário A
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into projects (id, user_id, name, niche) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Marca da Ana', 'finanças');
insert into calendar_posts (user_id, project_id, title, scheduled_date, platform, status, hook)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a',
          '3 erros com cartão de crédito', current_date, 'instagram', 'aprovado', 'Você paga juros sem saber?');

do $$ begin
  -- plano free: 1 projeto
  begin
    insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Segundo');
    raise exception 'deveria bloquear segundo projeto';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'PLAN_LIMIT_PROJECTS%' then raise; end if;
  end;
  assert (select count(*) from ai_memory where kind = 'assunto_abordado') = 1, 'memória aprendida';
  assert (select count(*) from ai_memory where kind = 'conteudo_aprovado') = 1, 'conteúdo aprovado memorizado';
  assert (select count(*) from global_search('cartão')) = 1, 'busca global';
  assert ((my_plan_status() ->> 'plan') = 'free'), 'status do plano';
end $$;

-- assinatura não pode ser alterada pelo usuário
update subscriptions set plan = 'pro';
do $$ begin assert (select plan from subscriptions) = 'free', 'usuário não altera assinatura'; end $$;

-- Usuário B não enxerga nem escreve nos dados de A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert (select count(*) from projects) = 0, 'B não vê projetos de A';
  assert (select count(*) from calendar_posts) = 0, 'B não vê posts de A';
  assert (select count(*) from ai_memory) = 0, 'B não vê memória de A';
  assert (select count(*) from global_search('cartão')) = 0, 'busca respeita RLS';
  begin
    insert into calendar_posts (user_id, project_id, title, scheduled_date, platform)
    values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'invasão', current_date, 'x');
    raise exception 'deveria bloquear escrita em projeto alheio';
  exception when insufficient_privilege then null;
  end;
  begin
    update profiles set active_project_id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'deveria bloquear projeto ativo alheio';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Notificações: geração e permissão restrita a read_at
reset role;
update calendar_posts set status = 'agendado';
select generate_notifications();
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  assert (select count(*) from notifications where type = 'publicacao') = 1, 'notificação de publicação';
end $$;
update notifications set read_at = now();
do $$ begin
  begin
    update notifications set title = 'hack';
    raise exception 'deveria bloquear edição do título';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Pro libera mais projetos (somente o servidor altera assinaturas)
reset role;
update subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days'
 where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Loja');
do $$ begin assert (select count(*) from projects) = 2, 'pro permite mais projetos'; end $$;

-- Assinatura vencida volta a valer como free
reset role;
update subscriptions set current_period_end = now() - interval '1 day'
 where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert effective_plan('00000000-0000-0000-0000-00000000000a') = 'free', 'assinatura vencida = free';
end $$;

rollback;
\echo 'RLS_TESTS_PASSED'

-- Recursos premium bloqueados no plano gratuito
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@test.dev');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into projects (id, user_id, name) values
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Projeto C');
do $$ begin
  begin
    insert into analytics (user_id, project_id, title, platform, published_on)
    values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000c', 'x', 'instagram', current_date);
    raise exception 'analytics deveria exigir plano Creator';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update subscriptions set plan = 'creator', status = 'active' where user_id = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into analytics (user_id, project_id, title, platform, published_on, reach, likes, saves)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000c', 'x', 'instagram', current_date, 200, 10, 10);
do $$ begin assert (select engagement_rate from analytics) = 10.00, 'taxa de engajamento calculada'; end $$;
rollback;
\echo 'PLAN_TESTS_PASSED'
