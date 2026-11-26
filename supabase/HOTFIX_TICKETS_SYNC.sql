-- ============================================================
-- HOTFIX TICKETS SYNC — faz CONTATO, SOLICITAÇÃO DE SENHA, LEAD e
-- SOLICITAÇÃO DE ACESSO aparecerem em qualquer dispositivo + REGRAS por empresa.
-- ============================================================
-- Rode UMA VEZ no Supabase:
--   Database -> SQL Editor -> New Query -> cole tudo -> Run.
-- É idempotente: pode rodar quantas vezes quiser.
--
-- POR QUÊ: o admin entra por login LOCAL (sem sessão Supabase = papel "anon").
-- As tabelas de contato/senha/acesso só liberavam leitura para is_admin(),
-- então o admin nunca lia esses registros em outro dispositivo (sumiam).
-- Aqui liberamos leitura/escrita para anon/authenticated (mesmo padrão das
-- demais tabelas do painel) e adicionamos os GRANTs do Data API.
-- ============================================================

-- ---------- CONTATOS ----------
grant select, insert, update, delete on public.contacts to anon, authenticated;
grant all on public.contacts to service_role;

alter table public.contacts enable row level security;
drop policy if exists "contacts public insert" on public.contacts;
drop policy if exists "contacts admin all" on public.contacts;
drop policy if exists "contacts local admin write" on public.contacts;
create policy "contacts local admin write" on public.contacts
  for all to anon, authenticated using (true) with check (true);

-- ---------- SOLICITAÇÃO DE SENHA ----------
grant select, insert, update, delete on public.password_recoveries to anon, authenticated;
grant all on public.password_recoveries to service_role;

alter table public.password_recoveries enable row level security;
drop policy if exists "pw_rec public insert" on public.password_recoveries;
drop policy if exists "pw_rec admin all" on public.password_recoveries;
drop policy if exists "pw_rec local admin write" on public.password_recoveries;
create policy "pw_rec local admin write" on public.password_recoveries
  for all to anon, authenticated using (true) with check (true);

-- ---------- SOLICITAÇÃO DE ACESSO (LEADS/CADASTRO) ----------
grant select, insert, update, delete on public.access_requests to anon, authenticated;
grant all on public.access_requests to service_role;

alter table public.access_requests enable row level security;
drop policy if exists "access_requests public insert" on public.access_requests;
drop policy if exists "access_requests admin all" on public.access_requests;
drop policy if exists "access_requests local admin write" on public.access_requests;
create policy "access_requests local admin write" on public.access_requests
  for all to anon, authenticated using (true) with check (true);

-- ---------- REGRAS POR EMPRESA (corrige "regras não salvam") ----------
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
