-- ============================================================================
-- HOTFIX CRÍTICO DE SEGURANÇA — vazamento de dados via RPCs de leitura admin
-- ============================================================================
-- CAUSA (confirmada em produção):
--   As funções admin_list_profiles / admin_select / admin_orders / admin_quotes
--   validavam o token com:
--        if s.role <> 'admin' then raise exception 'forbidden'; end if;
--   Quando o token é INVÁLIDO, public._session(_token) devolve um registro NULO,
--   logo s.role é NULL. Em SQL, `NULL <> 'admin'` resulta em NULL (não TRUE),
--   então o IF NÃO dispara e a função retorna TODOS os dados —
--   qualquer pessoa com a anon key (pública no frontend) conseguia listar
--   CNPJ, nome, e-mail e telefone de todos os clientes e leads.
--
--   A sec_mutate NÃO tinha o problema porque já checava `if s.role is null`
--   ANTES da comparação. Aqui aplicamos a MESMA proteção às leituras.
--
-- COMO APLICAR:
--   Supabase → SQL Editor → New Query → cole TODO este arquivo → Run.
-- Seguro rodar várias vezes (create or replace). Não apaga dados.
-- ============================================================================

create or replace function public.admin_list_profiles(_token text, _role public.app_role)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;   -- NULL-safe
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  return coalesce(
    (select jsonb_agg(to_jsonb(p) - 'password') from public.profiles p where p.role = _role),
    '[]'::jsonb
  );
end $$;

create or replace function public.admin_select(_token text, _table text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.app_sessions;
  allowed text[] := array['access_requests','contacts','password_recoveries','visits'];
  result jsonb;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;   -- NULL-safe
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  if not (_table = any(allowed)) then raise exception 'table % not allowed', _table; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', _table)
    into result;
  return result;
end $$;

create or replace function public.admin_orders(_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;   -- NULL-safe
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'order_items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
      )
      order by o.created_at desc
    )
    from public.orders o
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_quotes(_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;   -- NULL-safe
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(
      to_jsonb(q) || jsonb_build_object(
        'quote_request_items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.quote_request_items i where i.quote_id = q.id), '[]'::jsonb)
      )
      order by q.created_at desc
    )
    from public.quote_requests q
  ), '[]'::jsonb);
end $$;

-- Remove uma sobrecarga insegura antiga (sem token), caso ainda exista.
drop function if exists public.admin_list_profiles(public.app_role);

-- ============================================================================
-- HOTFIX: solicitações de orçamento (leads) não salvavam
-- ============================================================================
-- CAUSA: submit_quote forçava status = 'pending', mas quote_requests.status é do
-- tipo enum order_status (valores: 'Recebido','Em análise',...). O insert falhava
-- com "invalid input value for enum order_status: pending" e o orçamento do lead
-- nunca era gravado. Correção: usar o status válido 'Recebido'.
-- ============================================================================
create or replace function public.submit_quote(_quote jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare qid uuid; it jsonb;
begin
  _quote := jsonb_set(coalesce(_quote,'{}'::jsonb), '{status}', '"Recebido"');
  insert into public.quote_requests
  select * from jsonb_populate_record(null::public.quote_requests, _quote - 'items');
  qid := (_quote->>'id')::uuid;
  if _quote ? 'items' then
    for it in select * from jsonb_array_elements(_quote->'items') loop
      insert into public.quote_request_items
      select * from jsonb_populate_record(null::public.quote_request_items, it || jsonb_build_object('quote_id', qid));
    end loop;
  end if;
end $$;
