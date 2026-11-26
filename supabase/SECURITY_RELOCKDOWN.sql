-- ============================================================================
-- SECURITY_RELOCKDOWN.sql — Moura Representações
-- ============================================================================
-- POR QUE ESTE ARQUIVO EXISTE:
--   Hotfixes posteriores (HOTFIX_ORDERS_RLS.sql, HOTFIX_DELETE_SYNC.sql,
--   HOTFIX_SALVAR_VARIACOES_EMPRESAS.sql, HOTFIX_TUDO_SALVAR.sql etc.)
--   reabriram as policies com `using (true)` e concederam escrita ao role
--   `anon`. Isso reintroduziu 7 falhas de segurança:
--     * anon podia criar/editar/apagar perfis de clientes/leads
--     * anon podia ler todos os perfis (com senha)
--     * anon podia ler/alterar/apagar todos os pedidos e orçamentos
--     * anon podia escrever/apagar arquivos nos buckets de storage
--     * anon podia ler/apagar contatos, solicitações de acesso e recuperações
--     * anon podia alterar produtos, categorias, catálogos, empresas etc.
--     * senhas em texto puro
--
-- O QUE ESTE ARQUIVO FAZ:
--   Reaplica o modelo seguro (token de sessão + funções SECURITY DEFINER),
--   MANTENDO todas as colunas/tabelas novas (variações, combinações,
--   allowed_brands, companies etc.) e a lógica de salvar já corrigida.
--   Depois de rodar, TUDO continua salvando pelo painel admin (via token),
--   mas o role anônimo perde toda a escrita direta e as leituras sensíveis.
--
-- COMO APLICAR:
--   Painel Supabase -> SQL Editor -> New Query -> cole TUDO -> Run.
--   É idempotente (pode rodar mais de uma vez).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ============================================================================
-- 0. GARANTE COLUNAS/TABELAS USADAS PELO CADASTRO ATUAL (não apaga nada)
-- ============================================================================
alter table public.products add column if not exists has_variations boolean not null default false;
alter table public.products add column if not exists variation_label text;
alter table public.products add column if not exists variations jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists variation_groups jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists combinations jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists min_qty integer not null default 1;
alter table public.products add column if not exists pack_qty integer not null default 1;

alter table public.profiles add column if not exists allowed_brands text[] default '{}';
alter table public.profiles add column if not exists brand_discounts jsonb not null default '{}'::jsonb;

create table if not exists public.companies (
  name text primary key,
  sort_order int not null default 0,
  active boolean not null default true,
  description text,
  logo_url text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 1. plaintext_passwords — hash bcrypt de todas as senhas em texto puro
-- ============================================================================
update public.profiles
   set password = extensions.crypt(password, extensions.gen_salt('bf'))
 where password is not null
   and password <> ''
   and password not like '$2%';

-- ============================================================================
-- 2. FECHA TODAS AS POLICIES ABERTAS E REVOGA ESCRITA DO ROLE ANÔNIMO
-- ============================================================================
do $$
declare r record; t text;
  tbls text[] := array[
    'products','categories','catalogs','launches','companies','panic_brands',
    'brand_rules','profiles','orders','order_items','quote_requests',
    'quote_request_items','contacts','password_recoveries','access_requests','visits'
  ];
begin
  foreach t in array tbls loop
    if exists (select 1 from information_schema.tables
                where table_schema='public' and table_name=t) then
      -- remove QUALQUER policy existente (inclui as abertas `open`, `full_rw`,
      -- `sync_total_rw`, `local admin`, etc.)
      for r in select policyname from pg_policies
                where schemaname='public' and tablename=t loop
        execute format('drop policy %I on public.%I', r.policyname, t);
      end loop;
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Tira o acesso direto do role anônimo/autenticado às tabelas sensíveis:
-- toda escrita/leitura sensível passa pelas funções SECURITY DEFINER.
revoke all on
  public.profiles, public.orders, public.order_items,
  public.quote_requests, public.quote_request_items,
  public.contacts, public.password_recoveries, public.access_requests,
  public.visits, public.companies, public.panic_brands, public.brand_rules
from anon, authenticated;

-- ============================================================================
-- 3. VITRINE PÚBLICA — somente leitura (sem escrita direta)
-- ============================================================================
grant select on
  public.products, public.categories, public.catalogs, public.launches,
  public.companies, public.panic_brands, public.brand_rules
to anon, authenticated;

do $$
declare t text;
  pub text[] := array['products','categories','catalogs','launches',
                      'companies','panic_brands','brand_rules'];
begin
  foreach t in array pub loop
    if exists (select 1 from information_schema.tables
                where table_schema='public' and table_name=t) then
      execute format('create policy "public read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 4. FUNÇÃO DE SESSÃO (garante existência; usada por todas as RPCs seguras)
-- ============================================================================
create table if not exists public.app_sessions (
  token_hash text primary key,
  profile_id uuid,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from anon, authenticated;

create or replace function public._session(_token text)
returns public.app_sessions
language sql stable security definer set search_path = public, extensions as $$
  select *
    from public.app_sessions
   where token_hash = encode(digest(_token, 'sha256'), 'hex')
     and expires_at > now()
   limit 1;
$$;

-- ============================================================================
-- 5. anon_profile_mutation + open_write_core_tables
--    Escrita genérica SOMENTE admin (via token). UPDATE-primeiro/INSERT-depois.
--    Remove as RPCs antigas inseguras que aceitavam anon sem checagem real.
-- ============================================================================
drop function if exists public.admin_upsert_profile(
  uuid,text,text,text,text,text,public.app_role,text,text,text,text,text,text,text,numeric,numeric,text[],boolean
);
drop function if exists public.admin_delete_profile(uuid);

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

  -- Hash de senha ao gravar perfis; preserva a senha atual se vier vazia.
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

-- ============================================================================
-- 6. anon_profiles_rpc — listar perfis SOMENTE admin e SEM a coluna password
-- ============================================================================
drop function if exists public.admin_list_profiles(public.app_role);

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

-- ============================================================================
-- 7. PERMISSÕES DE EXECUÇÃO (apenas o necessário)
-- ============================================================================
grant execute on function public.sec_mutate(text,text,text,jsonb,jsonb,text) to anon, authenticated;
grant execute on function public.admin_list_profiles(text,public.app_role) to anon, authenticated;
revoke all on function public._session(text) from anon, authenticated;

-- ============================================================================
-- 8. open_storage_write — escrita de storage exige token de admin válido
-- ============================================================================
create or replace function public._is_admin_request()
returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare hdr text; tok text;
begin
  begin hdr := current_setting('request.headers', true); exception when others then hdr := null; end;
  if hdr is null then return false; end if;
  tok := (hdr::json ->> 'x-admin-token');
  if tok is null or tok = '' then return false; end if;
  return exists(
    select 1 from public.app_sessions
     where token_hash = encode(digest(tok, 'sha256'), 'hex')
       and role = 'admin'
       and expires_at > now()
  );
end $$;
grant execute on function public._is_admin_request() to anon, authenticated;

do $$
declare r record;
begin
  -- Remove policies antigas/abertas de storage nos buckets do sistema.
  for r in
    select policyname from pg_policies
     where schemaname='storage' and tablename='objects'
       and (policyname ilike '%local admin%' or policyname ilike '%moura%'
            or policyname ilike '%catalog%' or policyname ilike '%open%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "moura public storage read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images','catalogs'));

create policy "moura admin storage write" on storage.objects
  for all to anon, authenticated
  using (bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images','catalogs')
         and public._is_admin_request())
  with check (bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images','catalogs')
         and public._is_admin_request());

notify pgrst, 'reload schema';
-- ============================================================================
-- FIM — 7 falhas fechadas: perfis, listagem de perfis, pedidos, storage,
-- tickets/contatos, tabelas de catálogo e senhas em texto puro.
-- ============================================================================
