-- =============================================================
-- Promoções por produto/combinação (aba "Promoções" no admin)
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Seguro: pode rodar várias vezes; não altera preços cadastrados.
-- =============================================================

create table if not exists public.product_promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  combination_id text,                      -- null = aplica ao produto base
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at   timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- impede promoção duplicada para o mesmo alvo (produto ou combinação):
  constraint product_promotions_valid_range check (
    starts_at is null or ends_at is null or ends_at >= starts_at
  )
);

-- Um registro ativo por (produto, combinação). combination_id null vira '_base_'
-- para participar do índice único.
create unique index if not exists product_promotions_unique_target
  on public.product_promotions (product_id, coalesce(combination_id, '_base_'));

create index if not exists product_promotions_product_idx
  on public.product_promotions (product_id);

-- Grants: leitura pública (para os cards do cliente), escritas via sec_mutate.
grant select on public.product_promotions to anon, authenticated;
grant all    on public.product_promotions to service_role;

alter table public.product_promotions enable row level security;
drop policy if exists "promotions public read" on public.product_promotions;
create policy "promotions public read"
  on public.product_promotions for select using (true);

-- =============================================================
-- Adiciona product_promotions à whitelist da RPC sec_mutate.
-- Recria a função mantendo o corpo original.
-- =============================================================
create or replace function public.sec_mutate(
  _token    text,
  _table    text,
  _action   text,
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
    'quote_request_items','contacts','password_recoveries','access_requests','visits',
    'product_promotions'
  ];
  tcols text[];
  cols text; vals text; setc text; wherec text; sql text;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  if not (_table = any(allowed)) then raise exception 'table % not allowed', _table; end if;

  if _table = 'profiles' then
    if coalesce(_payload->>'password','') = '' then
      _payload := _payload - 'password';
    elsif (_payload->>'password') not like '$2%' then
      _payload := jsonb_set(_payload, '{password}', to_jsonb(crypt(_payload->>'password', gen_salt('bf'))));
    end if;
  end if;

  select array_agg(column_name) into tcols
    from information_schema.columns
   where table_schema = 'public' and table_name = _table;

  if _action in ('insert','upsert') then
    select string_agg(quote_ident(k), ', '), string_agg('s.'||quote_ident(k), ', ')
      into cols, vals
      from jsonb_object_keys(_payload) k
     where k = any(tcols);
    if cols is null then raise exception 'no valid columns'; end if;

    sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L) as s',
      _table, cols, vals, _table, _payload
    );

    if _action = 'upsert' then
      select string_agg(quote_ident(k)||' = excluded.'||quote_ident(k), ', ')
        into setc
        from jsonb_object_keys(_payload) k
       where k = any(tcols) and k <> _conflict;
      if setc is null then
        sql := sql || format(' on conflict (%I) do nothing', _conflict);
      else
        sql := sql || format(' on conflict (%I) do update set %s', _conflict, setc);
      end if;
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

  elsif _action = 'delete' then
    select string_agg(quote_ident(k)||' = '||quote_literal(_match->>k), ' and ')
      into wherec from jsonb_object_keys(_match) k;
    if wherec is null then raise exception 'invalid delete'; end if;
    sql := format('delete from public.%I where %s', _table, wherec);

  else
    raise exception 'bad action %', _action;
  end if;

  execute sql;
end $$;

grant execute on function public.sec_mutate(text,text,text,jsonb,jsonb,text)
  to anon, authenticated;

notify pgrst, 'reload schema';
