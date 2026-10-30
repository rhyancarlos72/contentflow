-- =============================================================================
-- Recursos premium validados no banco: mesmo que o cliente seja adulterado,
-- só é possível gravar dados de módulos liberados pelo plano efetivo.
-- (Leitura continua liberada para o usuário não perder acesso ao histórico
-- após um downgrade.)
-- =============================================================================

create or replace function public.has_feature(p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.plan_limits
    where plan = public.effective_plan(auth.uid()) and p_feature = any (features)
  );
$$;

create policy "analytics: requer plano" on public.analytics as restrictive
  for insert to authenticated with check (public.has_feature('analytics_manual'));
create policy "analytics: requer plano (update)" on public.analytics as restrictive
  for update to authenticated with check (public.has_feature('analytics_manual'));

create policy "library: requer plano" on public.library_items as restrictive
  for insert to authenticated with check (public.has_feature('library'));
create policy "library: requer plano (update)" on public.library_items as restrictive
  for update to authenticated with check (public.has_feature('library'));

create policy "content_plans: requer plano" on public.content_plans as restrictive
  for insert to authenticated with check (public.has_feature('ai_plan'));
