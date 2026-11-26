-- HOTFIX: tabela launches sem colunas esperadas (sort_order, description, cta_*)
-- Execute em: Supabase → Database → SQL Editor → New query → Run

create table if not exists public.launches (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  active boolean not null default true,
  sort_order int default 0
);

alter table public.launches add column if not exists sort_order int default 0;
alter table public.launches add column if not exists description text;
alter table public.launches add column if not exists cta_label text;
alter table public.launches add column if not exists cta_url text;
alter table public.launches add column if not exists active boolean not null default true;
alter table public.launches add column if not exists title text;
alter table public.launches add column if not exists brand text;

alter table public.launches enable row level security;

drop policy if exists "launches public read" on public.launches;
drop policy if exists "launches admin write" on public.launches;
create policy "launches public read" on public.launches for select using (true);
create policy "launches admin write" on public.launches
  for all using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
