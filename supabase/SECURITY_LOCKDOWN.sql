-- =============================================================================
-- SECURITY_LOCKDOWN.sql  —  Moura Representações
-- =============================================================================
-- OBJETIVO: deixar o sistema seguro SEM mudar a experiência de login
-- (CNPJ/identificador + senha) e mantendo TUDO no Supabase.
--
-- Como funciona:
--   * Senhas passam a ser armazenadas com hash bcrypt (pgcrypto).
--   * Login (admin/cliente/lead) emite um TOKEN DE SESSÃO assinado pelo banco.
--   * Todas as escritas e leituras sensíveis passam por funções SECURITY DEFINER
--     que validam o token no servidor.
--   * As policies de RLS são fechadas: o role anônimo NÃO escreve mais nas
--     tabelas; só lê a vitrine pública (produtos, categorias, catálogos...).
--   * Uploads de arquivos usam uma policy de storage controlada pelo banco
--     (header x-admin-token validado contra as sessões de admin) — solução
--     temporária sem Edge Functions.
--
-- RODE ESTE ARQUIVO UMA VEZ no Supabase SQL Editor, DEPOIS de revisar o código.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- garante que as funções do pgcrypto (crypt, gen_salt, digest) sejam encontradas
set search_path = public, extensions;

-- =============================================================================
-- 1. MIGRAÇÃO: hash de todas as senhas em texto puro existentes
-- =============================================================================
update public.profiles
   set password = extensions.crypt(password, extensions.gen_salt('bf'))
 where password is not null
   and password <> ''
   and password not like '$2%';   -- ignora as que já estão em bcrypt

-- =============================================================================
-- 2. TABELA DE SESSÕES + HELPERS
-- =============================================================================
create table if not exists public.app_sessions (
  token_hash text primary key,
  profile_id uuid,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.app_sessions enable row level security;
-- Sem policies: acesso exclusivamente via funções SECURITY DEFINER abaixo.
revoke all on public.app_sessions from anon, authenticated;

-- Retorna a linha da sessão válida (não expirada) para um token, ou NULL.
create or replace function public._session(_token text)
returns public.app_sessions
language sql stable security definer set search_path = public, extensions as $$
  select *
    from public.app_sessions
   where token_hash = encode(digest(_token, 'sha256'), 'hex')
     and expires_at > now()
   limit 1;
$$;

-- Emite uma nova sessão e retorna o token (texto puro, exibido só uma vez).
create or replace function public._issue_session(_profile_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare _tok text;
begin
  delete from public.app_sessions where expires_at < now();          -- limpeza
  _tok := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token_hash, profile_id, role, expires_at)
  values (encode(digest(_tok, 'sha256'), 'hex'), _profile_id, _role, now() + interval '2 days');
  return _tok;
end $$;

-- Encerra a sessão (logout).
create or replace function public.logout_session(_token text)
returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.app_sessions
   where token_hash = encode(digest(_token, 'sha256'), 'hex');
$$;

-- =============================================================================
-- 3. LOGIN (verificação por bcrypt + emissão de sessão)
-- =============================================================================
-- Remove versões antigas que retornavam linhas/senhas.
drop function if exists public.verify_admin_login(text, text);
drop function if exists public.local_profile_login(text, text);
drop function if exists public.local_profile_refresh(uuid);
drop function if exists public.admin_list_profiles(public.app_role);

-- Login do admin: confere senha (bcrypt) E role admin em user_roles.
create or replace function public.verify_admin_login(_identifier text, _password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles; _tok text;
begin
  select * into p
    from public.profiles
   where (auth_email = lower(_identifier) or email = lower(_identifier))
   order by (auth_email = lower(_identifier)) desc
   limit 1;

  if p.id is null then return null; end if;
  if p.password is null or p.password = '' then return null; end if;
  if p.password <> crypt(_password, p.password) then return null; end if;
  if not public.has_role(p.id, 'admin') then return null; end if;

  _tok := public._issue_session(p.id, 'admin');
  return jsonb_build_object(
    'id', p.id, 'name', coalesce(p.name, 'Administrador'),
    'email', coalesce(p.email, p.auth_email, _identifier), 'token', _tok
  );
end $$;

-- Login de cliente/lead por CNPJ (dígitos) ou e-mail.
create or replace function public.local_profile_login(_identifier text, _password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles; _tok text; _id text;
begin
  _id := lower(_identifier);
  select * into p
    from public.profiles
   where role in ('client', 'lead')
     and active = true
     and (
       cnpj = _id
       or regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = regexp_replace(_id, '\D', '', 'g')
       or email = _id
     )
   limit 1;

  if p.id is null then return null; end if;
  if p.password is null or p.password = '' then return null; end if;
  if p.password <> crypt(_password, p.password) then return null; end if;

  _tok := public._issue_session(p.id, p.role);
  return (to_jsonb(p) - 'password') || jsonb_build_object('token', _tok);
end $$;

-- Atualiza dados do próprio perfil logado (sem expor senha).
create or replace function public.local_profile_refresh(_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions; p public.profiles;
begin
  s := public._session(_token);
  if s.profile_id is null then raise exception 'unauthorized'; end if;
  select * into p from public.profiles where id = s.profile_id;
  if p.id is null then return null; end if;
  return to_jsonb(p) - 'password';
end $$;

-- =============================================================================
-- 4. ESCRITA GENÉRICA SEGURA (somente admin)
-- =============================================================================
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

-- =============================================================================
-- 5. LEITURAS SEGURAS (somente admin)
-- =============================================================================
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

create or replace function public.admin_select(_token text, _table text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.app_sessions;
  allowed text[] := array['access_requests','contacts','password_recoveries','visits'];
  result jsonb;
begin
  s := public._session(_token);
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

-- Pedidos do próprio cliente/lead logado.
create or replace function public.client_orders(_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.profile_id is null then raise exception 'unauthorized'; end if;
  return coalesce((
    select jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'order_items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
      )
      order by o.created_at desc
    )
    from public.orders o
    where o.client_id = s.profile_id
  ), '[]'::jsonb);
end $$;

-- =============================================================================
-- 6. CRIAÇÃO DE PEDIDOS (cliente/lead/admin) + ENVIOS PÚBLICOS (anon)
-- =============================================================================
create or replace function public.place_order(_token text, _order jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions; oid uuid; it jsonb;
begin
  s := public._session(_token);
  if s.role is null then raise exception 'unauthorized'; end if;
  -- Cliente/lead só cria pedido em nome próprio.
  if s.role <> 'admin' then
    _order := jsonb_set(_order, '{client_id}', to_jsonb(s.profile_id::text));
  end if;

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders, _order - 'items');

  oid := (_order->>'id')::uuid;
  if _order ? 'items' then
    for it in select * from jsonb_array_elements(_order->'items') loop
      insert into public.order_items
      select * from jsonb_populate_record(
        null::public.order_items,
        it || jsonb_build_object('id', coalesce(it->>'id', gen_random_uuid()::text), 'order_id', oid)
      );
    end loop;
  end if;
end $$;

-- Orçamentos: criados por visitantes NÃO logados (fluxo de lead). Insert-only.
create or replace function public.submit_quote(_quote jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare qid uuid; it jsonb;
begin
  _quote := jsonb_set(coalesce(_quote,'{}'::jsonb), '{status}', '"pending"');
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

-- Solicitação de acesso (pré-cadastro): insert-only, força status pendente.
create or replace function public.submit_access_request(_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  _payload := (_payload - 'generated_password' - 'approved_client_id');
  _payload := jsonb_set(_payload, '{status}', '"pending"');
  insert into public.access_requests
  select * from jsonb_populate_record(null::public.access_requests, _payload);
end $$;

-- Formulário de contato: insert-only.
create or replace function public.submit_contact(_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  _payload := jsonb_set(coalesce(_payload,'{}'::jsonb), '{status}', '"pending"');
  insert into public.contacts
  select * from jsonb_populate_record(null::public.contacts, _payload);
end $$;

-- Recuperação de senha: insert-only.
create or replace function public.submit_password_recovery(_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  _payload := jsonb_set(coalesce(_payload,'{}'::jsonb), '{status}', '"pending"');
  insert into public.password_recoveries
  select * from jsonb_populate_record(null::public.password_recoveries, _payload);
end $$;

-- Rastreio de visita: insert-only, sem dados sensíveis.
create or replace function public.track_visit(_path text, _ref text default null)
returns void
language sql security definer set search_path = public, extensions as $$
  insert into public.visits(path, ref) values (_path, _ref);
$$;

-- Existência de CNPJ (sem vazar dados do perfil).
create or replace function public.cnpj_exists(_cnpj text)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists(
    select 1 from public.profiles
     where regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = regexp_replace(_cnpj, '\D', '', 'g')
  );
$$;

-- =============================================================================
-- 7. FECHAMENTO DAS POLICIES (RLS)
-- =============================================================================
-- Remove TODAS as policies existentes das tabelas e reabilita RLS.
do $$
declare r record; t text;
  tbls text[] := array[
    'products','categories','catalogs','launches','companies','panic_brands',
    'brand_rules','profiles','orders','order_items','quote_requests',
    'quote_request_items','contacts','password_recoveries','access_requests','visits'
  ];
begin
  foreach t in array tbls loop
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Tira o acesso direto do role anônimo/autenticado às tabelas sensíveis
-- (todo acesso passa pelas funções SECURITY DEFINER acima).
revoke all on
  public.profiles, public.orders, public.order_items,
  public.quote_requests, public.quote_request_items,
  public.contacts, public.password_recoveries, public.access_requests,
  public.visits, public.companies, public.panic_brands, public.brand_rules
from anon, authenticated;

-- Vitrine PÚBLICA: leitura liberada (sem escrita direta).
grant select on
  public.products, public.categories, public.catalogs, public.launches
to anon, authenticated;

do $$
declare t text;
  pub text[] := array['products','categories','catalogs','launches'];
begin
  foreach t in array pub loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- companies/panic_brands/brand_rules são lidas via funções de hydrate? Não:
-- são lidas direto pelo cliente na vitrine. Liberamos somente SELECT.
grant select on public.companies, public.panic_brands, public.brand_rules to anon, authenticated;
create policy "public read" on public.companies      for select using (true);
create policy "public read" on public.panic_brands   for select using (true);
create policy "public read" on public.brand_rules    for select using (true);

-- =============================================================================
-- 8. PERMISSÕES DE EXECUÇÃO DAS FUNÇÕES
-- =============================================================================
-- Remove RPCs antigas inseguras, se existirem.
drop function if exists public.admin_upsert_profile(
  uuid,text,text,text,text,text,public.app_role,text,text,text,text,text,text,text,numeric,numeric,text[],boolean
);
drop function if exists public.admin_delete_profile(uuid);

grant execute on function
  public.verify_admin_login(text,text),
  public.local_profile_login(text,text),
  public.local_profile_refresh(text),
  public.logout_session(text),
  public.sec_mutate(text,text,text,jsonb,jsonb,text),
  public.admin_list_profiles(text,public.app_role),
  public.admin_select(text,text),
  public.admin_orders(text),
  public.admin_quotes(text),
  public.client_orders(text),
  public.place_order(text,jsonb),
  public.submit_quote(jsonb),
  public.submit_access_request(jsonb),
  public.submit_contact(jsonb),
  public.submit_password_recovery(jsonb),
  public.track_visit(text,text),
  public.cnpj_exists(text)
to anon, authenticated;

-- Funções internas: não expostas ao cliente.
revoke all on function public._session(text)               from anon, authenticated;
revoke all on function public._issue_session(uuid,public.app_role) from anon, authenticated;

-- =============================================================================
-- 9. STORAGE — policy temporária controlada pelo banco (sem Edge Functions)
-- =============================================================================
-- Valida o header "x-admin-token" enviado pelo painel admin contra as sessões.
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
  bkts text[] := array['product-images','category-icons','catalog-pdfs','catalog-covers','launch-images','catalogs'];
begin
  -- Remove policies antigas e abertas dessas buckets.
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

-- =============================================================================
-- FIM
-- =============================================================================
