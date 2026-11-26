-- ============================================================
-- HOTFIX: edições de PRODUTOS (e demais tabelas) não salvavam
-- ============================================================
-- PROBLEMA:
--   A função sec_mutate fazia o UPSERT com "INSERT ... ON CONFLICT (id)".
--   Quando a tabela possui OUTRO índice único além da PK (ex.: em products
--   existe o índice products_code_brand_uniq sobre (lower(code), lower(brand))),
--   o INSERT especulativo podia colidir nesse índice secundário, que NÃO é o
--   alvo do ON CONFLICT. Nesse caso o Postgres aborta com erro em vez de
--   atualizar a linha — então a edição do produto "não salva".
--
-- SOLUÇÃO:
--   Reescrever o ramo de UPSERT para fazer UPDATE primeiro (pela chave de
--   conflito, normalmente "id") e, só se NENHUMA linha existir, fazer o INSERT.
--   Isso atualiza a linha existente no lugar (sem violar índices secundários)
--   e mantém a criação de novos registros funcionando normalmente.
--
-- COMO APLICAR:
--   Painel (Supabase) -> SQL Editor -> New Query -> cole e Run.
--   É idempotente (pode rodar mais de uma vez).
-- ============================================================

create or replace function public.sec_mutate(
  _token    text,
  _table    text,
  _action   text,                       -- 'insert' | 'upsert' | 'update' | 'delete'
  _payload  jsonb default '{}'::jsonb,
  _match    jsonb default '{}'::jsonb,
  _conflict text default 'id'
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.app_sessions;
  allowed text[] := array[
    'products','categories','catalogs','launches','companies','panic_brands',
    'brand_rules','profiles','orders','order_items','quote_requests',
    'quote_request_items','contacts','password_recoveries','access_requests','visits'
  ];
  tcols text[];
  cols text; vals text; setc text; wherec text; sql text;
  updated_count int := 0;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  if not (_table = any(allowed)) then raise exception 'table % not allowed', _table; end if;

  -- Hash de senha quando gravando perfis; preserva a senha atual se vier vazia.
  if _table = 'profiles' then
    if coalesce(_payload->>'password','') = '' then
      _payload := _payload - 'password';
    elsif (_payload->>'password') not like '$2%' then
      _payload := jsonb_set(_payload, '{password}', to_jsonb(crypt(_payload->>'password', gen_salt('bf'))));
    end if;
  end if;

  -- Colunas reais da tabela (resiliência a chaves inexistentes no payload).
  select array_agg(column_name) into tcols
    from information_schema.columns
   where table_schema = 'public' and table_name = _table;

  if _action = 'insert' then
    select string_agg(quote_ident(k), ', '), string_agg('s.'||quote_ident(k), ', ')
      into cols, vals
      from jsonb_object_keys(_payload) k
     where k = any(tcols);
    if cols is null then raise exception 'no valid columns'; end if;
    sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L) as s',
      _table, cols, vals, _table, _payload
    );
    execute sql;

  elsif _action = 'upsert' then
    -- 1) Tenta ATUALIZAR a linha existente pela chave de conflito (ex.: id).
    --    Atualizar no lugar não viola índices únicos secundários.
    select string_agg(quote_ident(k)||' = s.'||quote_ident(k), ', ')
      into setc
      from jsonb_object_keys(_payload) k
     where k = any(tcols) and k <> _conflict;
    if setc is not null then
      -- Compara pela chave de conflito usando o registro tipado `s`
      -- (evita erros de tipo, ex.: uuid = text).
      sql := format(
        'update public.%I as t set %s from jsonb_populate_record(null::public.%I, %L) as s where t.%I = s.%I',
        _table, setc, _table, _payload, _conflict, _conflict
      );
      execute sql;
      get diagnostics updated_count = row_count;
    end if;

    -- 2) Se nada foi atualizado (linha nova), faz o INSERT.
    if updated_count = 0 then
      select string_agg(quote_ident(k), ', '), string_agg('s.'||quote_ident(k), ', ')
        into cols, vals
        from jsonb_object_keys(_payload) k
       where k = any(tcols);
      if cols is null then raise exception 'no valid columns'; end if;
      sql := format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L) as s',
        _table, cols, vals, _table, _payload
      );
      execute sql;
    end if;

  elsif _action = 'update' then
    select string_agg(quote_ident(k)||' = s.'||quote_ident(k), ', ')
      into setc
      from jsonb_object_keys(_payload) k
     where k = any(tcols);
    select string_agg('t.'||quote_ident(k)||' = '||quote_literal(_match->>k), ' and ')
      into wherec from jsonb_object_keys(_match) k;
    if setc is null or wherec is null then raise exception 'invalid update'; end if;
    sql := format(
      'update public.%I as t set %s from jsonb_populate_record(null::public.%I, %L) as s where %s',
      _table, setc, _table, _payload, wherec
    );
    execute sql;

  elsif _action = 'delete' then
    select string_agg(quote_ident(k)||' = '||quote_literal(_match->>k), ' and ')
      into wherec from jsonb_object_keys(_match) k;
    if wherec is null then raise exception 'invalid delete'; end if;
    sql := format('delete from public.%I where %s', _table, wherec);
    execute sql;

  else
    raise exception 'bad action %', _action;
  end if;
end $$;
