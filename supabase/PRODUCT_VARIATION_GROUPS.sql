-- ============================================================
-- Múltiplas variações por produto (ex.: Voltagem + Potência)
-- Cada produto pode ter vários grupos de variação; cada grupo tem
-- um nome visível ao cliente e uma lista de opções.
-- Formato JSONB:
--   [
--     { "id": "...", "name": "Voltagem",
--       "options": [ { "id": "...", "name": "220V", "active": true } ] },
--     { "id": "...", "name": "Potência",
--       "options": [ { "id": "...", "name": "2CV", "active": true } ] }
--   ]
-- Seguro: pode rodar várias vezes, NÃO apaga dados existentes e mantém
-- compatibilidade com as colunas antigas (has_variations / variations).
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variation_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Recarrega o cache de schema do PostgREST para reconhecer a nova coluna.
NOTIFY pgrst, 'reload schema';
