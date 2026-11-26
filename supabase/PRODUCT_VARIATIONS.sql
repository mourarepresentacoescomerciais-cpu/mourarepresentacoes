-- ============================================================
-- Variações de produto (ex.: voltagem 110V / 220V / 380V Trifásica)
-- Execute no SQL Editor do Supabase. NÃO apaga dados existentes.
-- As variações ficam guardadas no próprio produto (coluna JSONB),
-- herdando imagem e descrição do produto principal.
-- ============================================================

-- 1) Flag indicando se o produto possui variações
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variations boolean NOT NULL DEFAULT false;

-- 2) Lista de variações (cada item: id, name, sku, price, stock, active)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3) Recarrega o cache de schema do PostgREST para reconhecer as colunas
NOTIFY pgrst, 'reload schema';
