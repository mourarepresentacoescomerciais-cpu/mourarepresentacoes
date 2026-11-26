-- Adiciona coluna de descontos por empresa no perfil do cliente.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists brand_discounts jsonb not null default '{}'::jsonb;
