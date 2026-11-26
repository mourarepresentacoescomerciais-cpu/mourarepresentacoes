-- ============================================================
-- HOTFIX — adiciona auth_email/password e RPCs faltantes
-- Rode no Supabase: Database → SQL Editor → New Query → Run
-- 100% idempotente, pode rodar várias vezes.
-- ============================================================

do $$ begin create type app_role as enum ('admin','client','lead'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  cnpj text unique,
  email text,
  name text,
  role app_role not null default 'client',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists auth_email     text;
alter table public.profiles add column if not exists password       text;
alter table public.profiles add column if not exists company_name   text;
alter table public.profiles add column if not exists trade_name     text;
alter table public.profiles add column if not exists address        text;
alter table public.profiles add column if not exists whatsapp       text;
alter table public.profiles add column if not exists pocket         text;
alter table public.profiles add column if not exists classification text;
alter table public.profiles add column if not exists network        text;
alter table public.profiles add column if not exists credit_limit   numeric default 0;
alter table public.profiles add column if not exists discount_pct   numeric default 0;
alter table public.profiles add column if not exists allowed_brands text[] default '{}';

create unique index if not exists profiles_auth_email_key
  on public.profiles (auth_email) where auth_email is not null;

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Remove TODAS as variantes existentes de admin_upsert_profile (qualquer assinatura)
do $$
declare r record;
begin
  for r in
    select format('drop function if exists public.%I(%s) cascade;', p.proname, pg_get_function_identity_arguments(p.oid)) as cmd
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_upsert_profile'
  loop
    execute r.cmd;
  end loop;
end $$;

create or replace function public.admin_upsert_profile(
  _id uuid, _cnpj text, _email text, _auth_email text, _password text, _name text, _role app_role,
  _company_name text, _trade_name text, _address text, _whatsapp text, _pocket text,
  _classification text, _network text, _credit_limit numeric, _discount_pct numeric,
  _allowed_brands text[], _active boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  insert into public.profiles (
    id, cnpj, email, auth_email, password, name, role, company_name, trade_name, address, whatsapp,
    pocket, classification, network, credit_limit, discount_pct, allowed_brands, active
  ) values (
    _id, nullif(_cnpj,''), nullif(_email,''), nullif(_auth_email,''), nullif(_password,''), _name, _role,
    _company_name, _trade_name, _address, _whatsapp, _pocket, _classification, _network,
    coalesce(_credit_limit,0), coalesce(_discount_pct,0), coalesce(_allowed_brands,'{}'), coalesce(_active,true)
  ) on conflict (id) do update set
    cnpj = excluded.cnpj, email = excluded.email, auth_email = excluded.auth_email,
    password = coalesce(excluded.password, public.profiles.password), name = excluded.name, role = excluded.role,
    company_name = excluded.company_name, trade_name = excluded.trade_name, address = excluded.address,
    whatsapp = excluded.whatsapp, pocket = excluded.pocket, classification = excluded.classification,
    network = excluded.network, credit_limit = excluded.credit_limit, discount_pct = excluded.discount_pct,
    allowed_brands = excluded.allowed_brands, active = excluded.active;
end $$;

create or replace function public.local_profile_login(_identifier text, _password text)
returns table (
  id uuid, cnpj text, email text, name text, role app_role, company_name text, trade_name text,
  address text, whatsapp text, pocket text, classification text, network text,
  credit_limit numeric, discount_pct numeric, allowed_brands text[], active boolean, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.cnpj, p.email, p.name, p.role, p.company_name, p.trade_name,
         p.address, p.whatsapp, p.pocket, p.classification, p.network,
         p.credit_limit, p.discount_pct, p.allowed_brands, p.active, p.created_at
  from public.profiles p
  where p.role in ('client','lead')
    and p.active = true
    and p.password = _password
    and (
      lower(coalesce(p.auth_email,'')) = lower(_identifier)
      or lower(coalesce(p.email,'')) = lower(_identifier)
      or regexp_replace(coalesce(p.cnpj,''), '\D', '', 'g') = regexp_replace(_identifier, '\D', '', 'g')
    )
  limit 1
$$;

grant execute on function public.admin_upsert_profile(uuid,text,text,text,text,text,app_role,text,text,text,text,text,text,text,numeric,numeric,text[],boolean) to authenticated;
grant execute on function public.local_profile_login(text,text) to anon, authenticated;

drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles admin read"  on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles admin read"  on public.profiles for select using (public.is_admin());
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);
create policy "profiles admin write" on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- Recarrega o cache do PostgREST (resolve "Could not find the column ... in schema cache")
notify pgrst, 'reload schema';
