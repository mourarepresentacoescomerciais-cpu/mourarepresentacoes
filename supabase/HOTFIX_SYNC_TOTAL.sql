-- ============================================================
-- HOTFIX SYNC TOTAL — Moura Representações
-- Corrige: empresas/categorias/catálogos/lançamentos/pânico/regras que
-- "não salvam", "somem ao atualizar" ou "não sincronizam entre dispositivos",
-- e exclusões que voltam em outro aparelho.
--
-- POR QUÊ: o admin entra por LOGIN LOCAL (sem sessão Supabase = papel "anon").
-- Toda gravação/exclusão do painel vai como "anon". Se a tabela não permite
-- anon (INSERT/UPDATE/DELETE) + GRANT do Data API, a operação falha em silêncio:
-- some no reload e não aparece em outro dispositivo.
--
-- COMO RODAR: Supabase -> Database -> SQL Editor -> New Query
-- -> cole TUDO -> Run. É idempotente (pode rodar quantas vezes quiser).
-- ============================================================

-- Função utilitária: garante GRANTs + RLS aberta para anon/authenticated.
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'categories', 'catalogs', 'launches', 'panic_brands',
    'brand_rules', 'contacts', 'password_recoveries', 'access_requests'
  ]
  loop
    -- só age se a tabela existir
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t and c.relkind = 'r') then
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
      execute format('grant all on public.%I to service_role', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "sync_total_rw" on public.%I', t);
      execute format(
        'create policy "sync_total_rw" on public.%I for all to anon, authenticated using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

-- ---------- Garante que a tabela companies tenha as colunas usadas pelo app ----------
create table if not exists public.companies (
  name text primary key,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.companies add column if not exists sort_order int not null default 0;
alter table public.companies add column if not exists active boolean not null default true;
grant select, insert, update, delete on public.companies to anon, authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;
drop policy if exists "sync_total_rw" on public.companies;
create policy "sync_total_rw" on public.companies for all to anon, authenticated using (true) with check (true);

-- ---------- panic_brands ----------
create table if not exists public.panic_brands (
  brand text primary key,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.panic_brands to anon, authenticated;
grant all on public.panic_brands to service_role;
alter table public.panic_brands enable row level security;
drop policy if exists "sync_total_rw" on public.panic_brands;
create policy "sync_total_rw" on public.panic_brands for all to anon, authenticated using (true) with check (true);

-- ---------- brand_rules ----------
create table if not exists public.brand_rules (
  brand text primary key,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.brand_rules to anon, authenticated;
grant all on public.brand_rules to service_role;
alter table public.brand_rules enable row level security;
drop policy if exists "sync_total_rw" on public.brand_rules;
create policy "sync_total_rw" on public.brand_rules for all to anon, authenticated using (true) with check (true);
