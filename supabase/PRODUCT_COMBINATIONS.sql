-- =============================================================
-- Combinações de variações por produto (ex.: 220V + 1000W => preço próprio)
-- Execute uma vez no SQL Editor do Supabase.
-- =============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS combinations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Estrutura de cada item de combinations (jsonb array):
--   { "id": "uuid", "optionIds": ["optId1","optId2"], "price": 0, "sku": "ABC", "active": true }
