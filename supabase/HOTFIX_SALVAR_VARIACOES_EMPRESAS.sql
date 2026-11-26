-- ============================================================
-- HOTFIX SALVAR VARIAÇÕES / EMPRESAS LIBERADAS
-- Execute no Supabase SQL Editor e depois atualize o preview.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- Produtos: colunas usadas pelo cadastro atual de variações/combinações.
alter table public.products add column if not exists has_variations boolean not null default false;
alter table public.products add column if not exists variation_label text;
alter table public.products add column if not exists variations jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists variation_groups jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists combinations jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists min_qty integer not null default 1;
alter table public.products add column if not exists pack_qty integer not null default 1;
update public.products
   set variations = coalesce(variations, '[]'::jsonb),
       variation_groups = coalesce(variation_groups, '[]'::jsonb),
       combinations = coalesce(combinations, '[]'::jsonb),
       min_qty = coalesce(min_qty, 1),
       pack_qty = coalesce(pack_qty, 1),
       has_variations = coalesce(has_variations, false);

-- Clientes: empresas liberadas e descontos por empresa.
alter table public.profiles add column if not exists allowed_brands text[] default '{}';
alter table public.profiles add column if not exists brand_discounts jsonb not null default '{}'::jsonb;
update public.profiles
   set allowed_brands = coalesce(allowed_brands, '{}'),
       brand_discounts = coalesce(brand_discounts, '{}'::jsonb);

-- Empresas: lista/ordem/status/metadados.
create table if not exists public.companies (
  name text primary key,
  sort_order int not null default 0,
  active boolean not null default true,
  description text,
  logo_url text,
  created_at timestamptz not null default now()
);
alter table public.companies add column if not exists sort_order int not null default 0;
alter table public.companies add column if not exists active boolean not null default true;
alter table public.companies add column if not exists description text;
alter table public.companies add column if not exists logo_url text;

grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.companies to anon, authenticated;
grant all on public.products to service_role;
grant all on public.profiles to service_role;
grant all on public.companies to service_role;

alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;

drop policy if exists "sync_total_rw" on public.products;
create policy "sync_total_rw" on public.products for all to anon, authenticated using (true) with check (true);
drop policy if exists "sync_total_rw" on public.companies;
create policy "sync_total_rw" on public.companies for all to anon, authenticated using (true) with check (true);

-- Escrita segura do admin local: UPDATE primeiro, INSERT depois.
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

  if _action = 'insert' then
    select string_agg(quote_ident(k), ', '), string_agg('s.'||quote_ident(k), ', ')
      into cols, vals from jsonb_object_keys(_payload) k where k = any(tcols);
    if cols is null then raise exception 'no valid columns'; end if;
    sql := format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L) as s', _table, cols, vals, _table, _payload);
    execute sql;

  elsif _action = 'upsert' then
    select string_agg(quote_ident(k)||' = s.'||quote_ident(k), ', ')
      into setc from jsonb_object_keys(_payload) k where k = any(tcols) and k <> _conflict;
    if setc is not null then
      sql := format('update public.%I as t set %s from jsonb_populate_record(null::public.%I, %L) as s where t.%I = s.%I', _table, setc, _table, _payload, _conflict, _conflict);
      execute sql;
      get diagnostics updated_count = row_count;
    end if;
    if updated_count = 0 then
      select string_agg(quote_ident(k), ', '), string_agg('s.'||quote_ident(k), ', ')
        into cols, vals from jsonb_object_keys(_payload) k where k = any(tcols);
      if cols is null then raise exception 'no valid columns'; end if;
      sql := format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L) as s', _table, cols, vals, _table, _payload);
      execute sql;
    end if;

  elsif _action = 'update' then
    select string_agg(quote_ident(k)||' = s.'||quote_ident(k), ', ')
      into setc from jsonb_object_keys(_payload) k where k = any(tcols);
    select string_agg('t.'||quote_ident(k)||' = '||quote_literal(_match->>k), ' and ')
      into wherec from jsonb_object_keys(_match) k;
    if setc is null or wherec is null then raise exception 'invalid update'; end if;
    sql := format('update public.%I as t set %s from jsonb_populate_record(null::public.%I, %L) as s where %s', _table, setc, _table, _payload, wherec);
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

grant execute on function public.sec_mutate(text,text,text,jsonb,jsonb,text) to anon, authenticated;

create or replace function public.admin_list_profiles(_token text, _role public.app_role)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.role <> 'admin' then raise exception 'forbidden'; end if;
  return coalesce(
    (select jsonb_agg(to_jsonb(p) - 'password') from public.profiles p where p.role = _role),
    '[]'::jsonb
  );
end $$;

grant execute on function public.admin_list_profiles(text,public.app_role) to anon, authenticated;

notify pgrst, 'reload schema';