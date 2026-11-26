-- ============================================================
-- MOURA REPRESENTAÇÕES — Schema completo (IDEMPOTENTE)
-- Pode rodar quantas vezes quiser. Database → SQL Editor → New Query
-- ============================================================

-- 1) ENUMS (idempotentes)
do $$ begin
  create type app_role as enum ('admin', 'client', 'lead');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('Recebido','Em análise','Aprovado','Em separação','Faturado','Finalizado','Cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_type as enum ('pedido','orcamento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('pending','resolved');
exception when duplicate_object then null; end $$;

-- 2) PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cnpj text unique,
  email text,
  name text,
  role app_role not null default 'client',
  company_name text,
  trade_name text,
  address text,
  whatsapp text,
  pocket text,
  classification text,
  network text,
  credit_limit numeric default 0,
  discount_pct numeric default 0,
  allowed_brands text[] default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 3) Funções de role
create or replace function public.has_role(_uid uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _uid and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- 4) Trigger novo user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, cnpj, name, role, company_name, trade_name, whatsapp, allowed_brands)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'cnpj',
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'client'),
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'trade_name',
    new.raw_user_meta_data->>'whatsapp',
    coalesce((new.raw_user_meta_data->'allowed_brands')::text[], '{}')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS profiles
drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles self read" on public.profiles for select using (auth.uid() = id);
create policy "profiles admin read" on public.profiles for select using (public.is_admin());
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- 5) COMPANIES
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.companies enable row level security;
drop policy if exists "companies public read" on public.companies;
drop policy if exists "companies admin write" on public.companies;
create policy "companies public read" on public.companies for select using (true);
create policy "companies admin write" on public.companies for all using (public.is_admin()) with check (public.is_admin());

-- 6) CATEGORIES
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  icon text,
  icon_url text,
  subcategories text[] default '{}',
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.categories enable row level security;
drop policy if exists "categories public read" on public.categories;
drop policy if exists "categories admin write" on public.categories;
create policy "categories public read" on public.categories for select using (true);
create policy "categories admin write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- 7) PRODUCTS
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  category text,
  subcategory text,
  brand text not null,
  price numeric not null default 0,
  min_qty int not null default 1,
  pack_qty int not null default 1,
  image text,
  is_promo boolean not null default false,
  is_new boolean not null default false,
  is_featured boolean not null default false,
  active boolean not null default true,
  discount_pct numeric default 0,
  thickness text,
  ipi_rate numeric not null default 0,
  st_rate numeric not null default 0,
  synonyms text[] default '{}',
  keywords text[] default '{}',
  created_at timestamptz default now()
);
alter table public.products enable row level security;
drop policy if exists "products public read" on public.products;
drop policy if exists "products admin write" on public.products;
create policy "products public read" on public.products for select using (true);
create policy "products admin write" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- 8) PANIC BRANDS
create table if not exists public.panic_brands (
  brand text primary key,
  blocked_at timestamptz default now()
);
alter table public.panic_brands enable row level security;
drop policy if exists "panic public read" on public.panic_brands;
drop policy if exists "panic admin write" on public.panic_brands;
create policy "panic public read" on public.panic_brands for select using (true);
create policy "panic admin write" on public.panic_brands for all using (public.is_admin()) with check (public.is_admin());

-- 9) ACCESS REQUESTS
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  company_name text not null,
  contact_name text not null,
  whatsapp text not null,
  email text not null,
  status request_status not null default 'pending',
  approved_client_id uuid,
  generated_password text,
  created_at timestamptz default now()
);
alter table public.access_requests enable row level security;
drop policy if exists "access_requests public insert" on public.access_requests;
drop policy if exists "access_requests admin all" on public.access_requests;
create policy "access_requests public insert" on public.access_requests for insert with check (true);
create policy "access_requests admin all" on public.access_requests for all using (public.is_admin()) with check (public.is_admin());

-- 10) PASSWORD RECOVERIES
create table if not exists public.password_recoveries (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  whatsapp text,
  status ticket_status not null default 'pending',
  created_at timestamptz default now()
);
alter table public.password_recoveries enable row level security;
drop policy if exists "pw_rec public insert" on public.password_recoveries;
drop policy if exists "pw_rec admin all" on public.password_recoveries;
create policy "pw_rec public insert" on public.password_recoveries for insert with check (true);
create policy "pw_rec admin all" on public.password_recoveries for all using (public.is_admin()) with check (public.is_admin());

-- 11) CONTACTS
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  cnpj text,
  empresa text,
  nome text not null,
  whatsapp text,
  email text not null,
  mensagem text not null,
  status ticket_status not null default 'pending',
  created_at timestamptz default now()
);
alter table public.contacts enable row level security;
drop policy if exists "contacts public insert" on public.contacts;
drop policy if exists "contacts admin all" on public.contacts;
create policy "contacts public insert" on public.contacts for insert with check (true);
create policy "contacts admin all" on public.contacts for all using (public.is_admin()) with check (public.is_admin());

-- 12) CATALOGS
create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null,
  description text,
  cover_image text,
  pdf_url text,
  active boolean not null default true,
  sort_order int default 0
);
alter table public.catalogs enable row level security;
drop policy if exists "catalogs public read" on public.catalogs;
drop policy if exists "catalogs admin write" on public.catalogs;
create policy "catalogs public read" on public.catalogs for select using (true);
create policy "catalogs admin write" on public.catalogs for all using (public.is_admin()) with check (public.is_admin());

-- 13) LAUNCHES
create table if not exists public.launches (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  active boolean not null default true,
  sort_order int default 0
);
alter table public.launches enable row level security;
drop policy if exists "launches public read" on public.launches;
drop policy if exists "launches admin write" on public.launches;
create policy "launches public read" on public.launches for select using (true);
create policy "launches admin write" on public.launches for all using (public.is_admin()) with check (public.is_admin());

-- 14) ORDERS + ITEMS
create table if not exists public.orders (
  id text primary key,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text,
  client_cnpj text,
  brand text not null,
  type order_type not null,
  general_discount_pct numeric default 0,
  total_bruto numeric default 0,
  total_with_discount numeric default 0,
  total_ipi numeric default 0,
  total_st numeric default 0,
  total_with_tax numeric default 0,
  status order_status not null default 'Recebido',
  created_at timestamptz default now()
);
alter table public.orders enable row level security;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(id) on delete cascade,
  product_id uuid,
  code text,
  name text,
  image text,
  qty int,
  unit_price numeric,
  total_price numeric,
  list_price numeric,
  sale_price numeric,
  discount_pct numeric,
  subtotal numeric,
  extra_discount_pct numeric,
  subtotal_after_extra numeric,
  ipi_rate numeric,
  ipi_value numeric,
  st_rate numeric,
  st_value numeric,
  total_with_tax numeric
);
alter table public.order_items enable row level security;

drop policy if exists "orders own read" on public.orders;
drop policy if exists "orders own insert" on public.orders;
drop policy if exists "orders admin all" on public.orders;
create policy "orders own read" on public.orders for select using (auth.uid() = client_id or public.is_admin());
create policy "orders own insert" on public.orders for insert with check (auth.uid() = client_id);
create policy "orders admin all" on public.orders for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items own read" on public.order_items;
drop policy if exists "order_items own insert" on public.order_items;
drop policy if exists "order_items admin all" on public.order_items;
create policy "order_items own read" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.client_id = auth.uid() or public.is_admin()))
);
create policy "order_items own insert" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.client_id = auth.uid())
);
create policy "order_items admin all" on public.order_items for all using (public.is_admin()) with check (public.is_admin());

-- 15) QUOTE REQUESTS
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  cnpj text,
  company_name text,
  contact_name text,
  whatsapp text,
  email text,
  brand text,
  status order_status not null default 'Recebido',
  type text default 'orcamento',
  created_at timestamptz default now()
);
alter table public.quote_requests enable row level security;

create table if not exists public.quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quote_requests(id) on delete cascade,
  product_id uuid,
  code text,
  name text,
  image text,
  qty int
);
alter table public.quote_request_items enable row level security;

drop policy if exists "quote public insert" on public.quote_requests;
drop policy if exists "quote admin all" on public.quote_requests;
drop policy if exists "quote_items public insert" on public.quote_request_items;
drop policy if exists "quote_items admin all" on public.quote_request_items;
create policy "quote public insert" on public.quote_requests for insert with check (true);
create policy "quote admin all" on public.quote_requests for all using (public.is_admin()) with check (public.is_admin());
create policy "quote_items public insert" on public.quote_request_items for insert with check (true);
create policy "quote_items admin all" on public.quote_request_items for all using (public.is_admin()) with check (public.is_admin());

-- 16) STORAGE BUCKETS
insert into storage.buckets (id, name, public) values
  ('product-images','product-images',true),
  ('category-icons','category-icons',true),
  ('catalog-pdfs','catalog-pdfs',true),
  ('catalog-covers','catalog-covers',true),
  ('launch-images','launch-images',true)
on conflict (id) do nothing;

drop policy if exists "storage public read" on storage.objects;
drop policy if exists "storage admin write" on storage.objects;
create policy "storage public read" on storage.objects for select using (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
);
create policy "storage admin write" on storage.objects for all using (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
  and public.is_admin()
) with check (
  bucket_id in ('product-images','category-icons','catalog-pdfs','catalog-covers','launch-images')
  and public.is_admin()
);

-- 17) SEED inicial
insert into public.companies (name, sort_order) values
  ('Cortag',1),('Ilumi',2),('Claw Motobombas',3),('Plaspol',4)
on conflict (name) do nothing;

-- ============================================================
-- FIM. Pode rodar de novo a qualquer momento sem erro.
-- ============================================================
