-- ============================================================
-- HOTFIX: Permitir gravação de pedidos/orçamentos no Supabase
-- ============================================================
-- PROBLEMA: clientes e leads fazem login local (sem sessão Supabase),
-- então auth.uid() é NULL e as RLS policies bloqueiam o INSERT
-- com a mensagem: "Falha ao insert em orders - Sem permissão (RLS)".
--
-- COMO APLICAR:
--   1. Abra o painel Supabase → SQL Editor
--   2. Cole TODO o conteúdo deste arquivo
--   3. Clique em "Run"
-- ============================================================

grant select, insert, update, delete on public.orders to anon, authenticated;
grant select, insert, update, delete on public.order_items to anon, authenticated;
grant all on public.orders to service_role;
grant all on public.order_items to service_role;

drop policy if exists "orders own read" on public.orders;
drop policy if exists "orders own insert" on public.orders;
drop policy if exists "orders admin all" on public.orders;
drop policy if exists "orders open read" on public.orders;
drop policy if exists "orders open insert" on public.orders;
drop policy if exists "orders open update" on public.orders;
drop policy if exists "orders open delete" on public.orders;

create policy "orders open read"   on public.orders for select using (true);
create policy "orders open insert" on public.orders for insert with check (true);
create policy "orders open update" on public.orders for update using (true) with check (true);
create policy "orders open delete" on public.orders for delete using (true);

drop policy if exists "order_items read" on public.order_items;
drop policy if exists "order_items insert" on public.order_items;
drop policy if exists "order_items open read" on public.order_items;
drop policy if exists "order_items open insert" on public.order_items;
drop policy if exists "order_items open update" on public.order_items;
drop policy if exists "order_items open delete" on public.order_items;

create policy "order_items open read"   on public.order_items for select using (true);
create policy "order_items open insert" on public.order_items for insert with check (true);
create policy "order_items open update" on public.order_items for update using (true) with check (true);
create policy "order_items open delete" on public.order_items for delete using (true);

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='quote_requests') then
    execute 'grant select, insert, update, delete on public.quote_requests to anon, authenticated';
    execute 'grant all on public.quote_requests to service_role';
    execute 'drop policy if exists "quotes own read" on public.quote_requests';
    execute 'drop policy if exists "quotes own insert" on public.quote_requests';
    execute 'drop policy if exists "quotes admin all" on public.quote_requests';
    execute 'drop policy if exists "quotes open read" on public.quote_requests';
    execute 'drop policy if exists "quotes open insert" on public.quote_requests';
    execute 'drop policy if exists "quotes open update" on public.quote_requests';
    execute 'drop policy if exists "quotes open delete" on public.quote_requests';
    execute 'create policy "quotes open read"   on public.quote_requests for select using (true)';
    execute 'create policy "quotes open insert" on public.quote_requests for insert with check (true)';
    execute 'create policy "quotes open update" on public.quote_requests for update using (true) with check (true)';
    execute 'create policy "quotes open delete" on public.quote_requests for delete using (true)';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='quote_request_items') then
    execute 'grant select, insert, update, delete on public.quote_request_items to anon, authenticated';
    execute 'grant all on public.quote_request_items to service_role';
    execute 'drop policy if exists "quote_items open read" on public.quote_request_items';
    execute 'drop policy if exists "quote_items open insert" on public.quote_request_items';
    execute 'drop policy if exists "quote_items open update" on public.quote_request_items';
    execute 'drop policy if exists "quote_items open delete" on public.quote_request_items';
    execute 'create policy "quote_items open read" on public.quote_request_items for select using (true)';
    execute 'create policy "quote_items open insert" on public.quote_request_items for insert with check (true)';
    execute 'create policy "quote_items open update" on public.quote_request_items for update using (true) with check (true)';
    execute 'create policy "quote_items open delete" on public.quote_request_items for delete using (true)';
  end if;
end $$;
