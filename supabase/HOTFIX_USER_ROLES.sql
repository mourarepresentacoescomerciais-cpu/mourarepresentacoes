-- ============================================================================
-- HOTFIX FINAL DA AUDITORIA: controle de permissão real via user_roles
-- ----------------------------------------------------------------------------
-- Cria a tabela user_roles, a função has_role, ajusta is_admin, cria a RPC
-- segura verify_admin_login e garante o admin principal (moura) em
-- profiles + user_roles. Seguro de rodar mais de uma vez (idempotente).
-- NÃO apaga dados, produtos nem perfis existentes.
--
-- Rode UMA VEZ no Supabase: Database -> SQL Editor -> New Query -> Run.
-- ============================================================================

-- Garante o enum de roles (já existe na maioria dos ambientes).
do $$ begin
  create type public.app_role as enum ('admin','client','lead');
exception when duplicate_object then null; end $$;

-- 1) Tabela user_roles -------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all    on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- 2) Função has_role (security definer, evita recursão em RLS) ---------------
-- Remove versões antigas (com nomes de parâmetro diferentes) para evitar
-- o erro 42P13 "cannot change name of input parameter".
drop function if exists public.has_role(uuid, public.app_role);
drop function if exists public.has_role(uuid, text);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;

-- 3) Policies de user_roles --------------------------------------------------
drop policy if exists "user_roles self read" on public.user_roles;
create policy "user_roles self read" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles admin write" on public.user_roles;
create policy "user_roles admin write" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 4) is_admin passa a considerar também user_roles --------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) or public.has_role(auth.uid(), 'admin')
$$;

-- 5) RPC segura de login do admin principal ---------------------------------
-- Só retorna o perfil se a senha conferir E o usuário tiver role 'admin'
-- em user_roles. Usada pelo app quando o admin loga sem sessão Supabase.
drop function if exists public.verify_admin_login(text, text);

create or replace function public.verify_admin_login(_identifier text, _password text)
returns table (id uuid, email text, name text, role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.name, 'admin'::public.app_role
  from public.profiles p
  where p.role = 'admin'
    and coalesce(p.active, true) = true
    and p.password = _password
    and public.has_role(p.id, 'admin')
    and (
      lower(coalesce(p.auth_email,'')) = lower(_identifier)
      or lower(coalesce(p.email,''))   = lower(_identifier)
    )
  limit 1
$$;

grant execute on function public.verify_admin_login(text, text) to anon, authenticated;

-- 6) Garante o admin principal (moura) em profiles + user_roles -------------
insert into public.profiles (id, email, auth_email, name, role, password, active)
values (
  '00000000-0000-0000-0000-000000000001',
  'moura@moura.local', 'moura@moura.local',
  'Administrador', 'admin', 'Mour@81', true
)
on conflict (id) do update set
  email      = excluded.email,
  auth_email = excluded.auth_email,
  name       = 'Administrador',
  role       = 'admin',
  password   = excluded.password,
  active      = true;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-000000000001', 'admin')
on conflict (user_id, role) do nothing;

-- 7) (Opcional) Backfill de roles para os perfis já existentes ---------------
-- Mantém clientes e leads com a role correta também em user_roles.
insert into public.user_roles (user_id, role)
select p.id, p.role
from public.profiles p
where p.role in ('admin','client','lead')
on conflict (user_id, role) do nothing;

-- 8) Conferência -------------------------------------------------------------
select p.id, p.email, p.role, ur.role as user_role
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where p.id = '00000000-0000-0000-0000-000000000001';
