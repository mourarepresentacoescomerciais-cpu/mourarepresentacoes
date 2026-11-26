-- ============================================================
-- HOTFIX TUDO SALVAR — garante que TUDO salva no Supabase
-- ============================================================
-- Rode este SQL UMA VEZ no Supabase: Database -> SQL Editor -> New Query -> Run.
-- É idempotente: pode rodar quantas vezes quiser.
--
-- Corrige:
--   * "Falha ao salvar produtos / categorias" (RLS / permissões do admin local)
--   * Ordenação manual de produtos e categorias não persistindo (sort_order)
--   * Campos extras de pedido não salvando
--   * Clientes/leads reaparecendo após excluir
--   * Regras das empresas salvas de forma permanente
--   * Buckets de imagem/PDF com limite de 10GB
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colunas de ordenação (igual entre painel e banco)
-- ------------------------------------------------------------
alter table public.products   add column if not exists sort_order integer not null default 0;
alter table public.categories add column if not exists sort_order integer not null default 0;

-- ------------------------------------------------------------
-- 2) Campos extras do pedido / orçamento
-- ------------------------------------------------------------
alter table public.orders add column if not exists observations   text;
alter table public.orders add column if not exists purchase_order text;
alter table public.orders add column if not exists invoice_note   text;
alter table public.orders add column if not exists buyer          text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_term   text;

-- ------------------------------------------------------------
-- 2.1) Regras comerciais por empresa
-- ------------------------------------------------------------
create table if not exists public.brand_rules (
  brand text primary key,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.brand_rules to anon, authenticated;
grant all on public.brand_rules to service_role;

alter table public.brand_rules enable row level security;
drop policy if exists "brand_rules local admin write" on public.brand_rules;
create policy "brand_rules local admin write" on public.brand_rules
  for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 3) GRANTS para o Data API (PostgREST)
-- ------------------------------------------------------------
grant select, insert, update, delete on public.categories   to anon, authenticated;
grant select, insert, update, delete on public.companies     to anon, authenticated;
grant select, insert, update, delete on public.products      to anon, authenticated;
grant select, insert, update, delete on public.catalogs      to anon, authenticated;
grant select, insert, update, delete on public.launches      to anon, authenticated;
grant select, insert, update, delete on public.panic_brands  to anon, authenticated;
grant select, insert, update, delete on public.orders        to anon, authenticated;
grant select, insert, update, delete on public.order_items   to anon, authenticated;
grant select, insert, update, delete on public.profiles      to anon, authenticated;

grant all on public.categories  to service_role;
grant all on public.companies   to service_role;
grant all on public.products    to service_role;
grant all on public.catalogs    to service_role;
grant all on public.launches    to service_role;
grant all on public.panic_brands to service_role;
grant all on public.orders      to service_role;
grant all on public.order_items to service_role;
grant all on public.profiles    to service_role;

-- ------------------------------------------------------------
-- 4) RLS: admin local (sem sessão Supabase) pode gravar
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories','companies','products','catalogs','launches','panic_brands','orders','order_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s local admin write" on public.%I', t, t);
    execute format('create policy "%s local admin write" on public.%I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5) RPCs para admin local listar/criar/editar/excluir clientes/leads
-- ------------------------------------------------------------
create or replace function public.admin_list_profiles(_role public.app_role)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where role = _role;
$$;

grant execute on function public.admin_list_profiles(public.app_role) to anon, authenticated;

create or replace function public.admin_delete_profile(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles where id = _id and role in ('client', 'lead');
end;
$$;

grant execute on function public.admin_delete_profile(uuid) to anon, authenticated;

create or replace function public.admin_upsert_profile(
  _id uuid, _cnpj text, _email text, _auth_email text, _password text, _name text, _role public.app_role,
  _company_name text, _trade_name text, _address text, _whatsapp text, _pocket text,
  _classification text, _network text, _credit_limit numeric, _discount_pct numeric,
  _allowed_brands text[], _active boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if _role = 'admin' and not public.is_admin() then
    raise exception 'not authorized';
  end if;

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

grant execute on function public.admin_upsert_profile(
  uuid,text,text,text,text,text,public.app_role,text,text,text,text,text,text,text,numeric,numeric,text[],boolean
) to anon, authenticated;

-- ------------------------------------------------------------
-- 6) Storage: buckets com limite de 10GB para imagens/PDFs
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit) values
  ('product-images','product-images',true,10737418240),
  ('category-icons','category-icons',true,10737418240),
  ('catalog-pdfs','catalog-pdfs',true,10737418240),
  ('catalog-covers','catalog-covers',true,10737418240),
  ('launch-images','launch-images',true,10737418240)
on conflict (id) do update set public = excluded.public, file_size_limit = 10737418240;

drop policy if exists "storage public read" on storage.objects;
drop policy if exists "storage admin write" on storage.objects;
drop policy if exists "storage local admin write" on storage.objects;
create policy "storage public read" on storage.objects for select using (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
);
create policy "storage local admin write" on storage.objects for all to anon, authenticated using (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
) with check (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
);
