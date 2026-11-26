-- ============================================================
-- HOTFIX OTIMIZAÇÃO DE PERFORMANCE
-- ============================================================
-- Rode este SQL UMA VEZ no Supabase: Database -> SQL Editor -> New Query -> Run.
-- É idempotente: pode rodar quantas vezes quiser.
--
-- Aplica 3 ajustes para deixar o sistema mais leve conforme o banco cresce:
--   1) admin_select passa a ordenar por data e limitar o volume das tabelas
--      pesadas (visits, contacts, access_requests, password_recoveries).
--   2) Índices por data (created_at) nas tabelas de leitura mais frequente.
--   3) Índices nas chaves estrangeiras usadas pelos JOINs de pedidos/orçamentos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) admin_select com ORDER BY created_at DESC + LIMIT
--    Evita trazer milhares de linhas de uma vez (visits/contacts).
-- ------------------------------------------------------------
create or replace function public.admin_select(_token text, _table text, _limit integer default 1000)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.app_sessions;
  allowed text[] := array['access_requests','contacts','password_recoveries','visits'];
  lim integer := least(greatest(coalesce(_limit, 1000), 1), 5000);
  result jsonb;
begin
  s := public._session(_token);
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  if not (_table = any(allowed)) then raise exception 'table % not allowed', _table; end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb)
       from (select * from public.%I order by created_at desc limit %s) t',
    _table, lim
  ) into result;
  return result;
end $$;

-- Mantém compatível a chamada antiga (2 argumentos).
create or replace function public.admin_select(_token text, _table text)
returns jsonb
language sql security definer set search_path = public, extensions as $$
  select public.admin_select(_token, _table, 1000);
$$;

grant execute on function public.admin_select(text,text,integer) to anon, authenticated;
grant execute on function public.admin_select(text,text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Índices por data (leituras ordenadas por created_at)
-- ------------------------------------------------------------
create index if not exists idx_visits_created_at             on public.visits (created_at desc);
create index if not exists idx_contacts_created_at           on public.contacts (created_at desc);
create index if not exists idx_access_requests_created_at     on public.access_requests (created_at desc);
create index if not exists idx_password_recoveries_created_at on public.password_recoveries (created_at desc);
create index if not exists idx_orders_created_at             on public.orders (created_at desc);
create index if not exists idx_quote_requests_created_at     on public.quote_requests (created_at desc);

-- ------------------------------------------------------------
-- 3) Índices nas chaves estrangeiras dos JOINs de itens
-- ------------------------------------------------------------
create index if not exists idx_order_items_order_id          on public.order_items (order_id);
create index if not exists idx_quote_request_items_quote_id  on public.quote_request_items (quote_id);
create index if not exists idx_orders_client_id              on public.orders (client_id);

-- ------------------------------------------------------------
-- Fim. Analisa as tabelas para o planejador usar os índices.
-- ------------------------------------------------------------
analyze public.visits;
analyze public.contacts;
analyze public.orders;
analyze public.quote_requests;
analyze public.order_items;
analyze public.quote_request_items;
