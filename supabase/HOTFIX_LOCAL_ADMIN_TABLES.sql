-- HOTFIX: permitir que o admin local (logado via fallback, sem sessão Supabase)
-- grave nas tabelas administrativas (categories, companies, products,
-- catalogs, launches, panic_brands).
--
-- Sintoma corrigido: "Falha ao salvar em 'categories' - Sem permissão (RLS)".
--
-- Rode este SQL UMA VEZ no Supabase: Database -> SQL Editor -> New Query -> Run.

-- Coluna de ordenação das categorias (necessária para salvar a ordem do painel).
alter table public.categories add column if not exists sort_order integer not null default 0;

-- categories
drop policy if exists "categories admin write" on public.categories;
drop policy if exists "categories local admin write" on public.categories;
create policy "categories local admin write" on public.categories
  for all to anon, authenticated using (true) with check (true);

-- companies
drop policy if exists "companies admin write" on public.companies;
drop policy if exists "companies local admin write" on public.companies;
create policy "companies local admin write" on public.companies
  for all to anon, authenticated using (true) with check (true);

-- products
drop policy if exists "products admin write" on public.products;
drop policy if exists "products local admin write" on public.products;
create policy "products local admin write" on public.products
  for all to anon, authenticated using (true) with check (true);

-- catalogs
drop policy if exists "catalogs admin write" on public.catalogs;
drop policy if exists "catalogs local admin write" on public.catalogs;
create policy "catalogs local admin write" on public.catalogs
  for all to anon, authenticated using (true) with check (true);

-- launches
drop policy if exists "launches admin write" on public.launches;
drop policy if exists "launches local admin write" on public.launches;
create policy "launches local admin write" on public.launches
  for all to anon, authenticated using (true) with check (true);

-- panic_brands
drop policy if exists "panic admin write" on public.panic_brands;
drop policy if exists "panic local admin write" on public.panic_brands;
create policy "panic local admin write" on public.panic_brands
  for all to anon, authenticated using (true) with check (true);

-- Garantir grants para o Data API (PostgREST)
grant select, insert, update, delete on public.categories  to anon, authenticated;
grant select, insert, update, delete on public.companies   to anon, authenticated;
grant select, insert, update, delete on public.products    to anon, authenticated;
grant select, insert, update, delete on public.catalogs    to anon, authenticated;
grant select, insert, update, delete on public.launches    to anon, authenticated;
grant select, insert, update, delete on public.panic_brands to anon, authenticated;
