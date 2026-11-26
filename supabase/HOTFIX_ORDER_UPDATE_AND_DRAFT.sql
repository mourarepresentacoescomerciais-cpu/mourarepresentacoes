-- =============================================================
-- HOTFIX — Edição de pedidos/orçamentos pelo cliente + Rascunho
-- Execute UMA vez no SQL Editor do Supabase.
--
-- Corrige:
--   • Bug 10 — "Falha ao update em order_items" ao editar pedido/orçamento
--              (cliente não podia usar sec_mutate, que é só admin).
--   • Bug 13 — "Alterar para pedido" não persistia o novo tipo.
--   • Bug 11 — Rascunho: pedido salvo como rascunho ia direto para o admin.
-- =============================================================

-- 1) Novo valor de status para RASCUNHO (rascunho não aparece para o admin).
--    ADD VALUE precisa rodar fora de transação em bloco; por isso é isolado.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'Rascunho';

-- 2) RPC de atualização de pedido pelo DONO (ou admin).
--    Atualiza o cabeçalho (patch) e, quando informado, substitui os itens.
create or replace function public.update_order(
  _token text,
  _id    uuid,
  _patch jsonb default '{}'::jsonb,
  _items jsonb default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.app_sessions;
  ownerid uuid;
  tcols text[];
  setc text;
  it jsonb;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;

  select client_id into ownerid from public.orders where id = _id;
  if not found then raise exception 'order not found'; end if;

  -- Cliente/lead só edita o próprio pedido; admin edita qualquer um.
  if s.role <> 'admin' and ownerid is distinct from s.profile_id then
    raise exception 'forbidden';
  end if;

  -- Atualiza o cabeçalho com as colunas válidas presentes no patch.
  if _patch is not null and _patch <> '{}'::jsonb then
    select array_agg(column_name) into tcols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'orders';
    select string_agg(quote_ident(k) || ' = s.' || quote_ident(k), ', ')
      into setc
      from jsonb_object_keys(_patch) k
     where k = any(tcols);
    if setc is not null then
      execute format(
        'update public.orders as t set %s from jsonb_populate_record(null::public.orders, %L) as s where t.id = %L',
        setc, _patch, _id
      );
    end if;
  end if;

  -- Substitui os itens quando enviados.
  if _items is not null then
    delete from public.order_items where order_id = _id;
    for it in select * from jsonb_array_elements(_items) loop
      insert into public.order_items
      select * from jsonb_populate_record(
        null::public.order_items,
        it || jsonb_build_object(
          'id', coalesce(it->>'id', gen_random_uuid()::text),
          'order_id', _id::text
        )
      );
    end loop;
  end if;
end $$;

grant execute on function public.update_order(text, uuid, jsonb, jsonb) to anon, authenticated, service_role;
