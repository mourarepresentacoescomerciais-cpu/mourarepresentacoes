-- ============================================================
-- HOTFIX: não permite cadastrar produtos com a MESMA DESCRIÇÃO
--         ou com código repetido/em branco (produtos com variação)
-- ============================================================
-- PROBLEMA:
--   A coluna products.code tem um UNIQUE global. Isso causa:
--     1) Produtos diferentes com o MESMO código em marcas distintas
--        não podem coexistir.
--     2) Produtos COM variação (código fica em branco no produto-pai)
--        colidem entre si no código vazio ('') -> o salvamento falha
--        silenciosamente. Ex.: "Motobomba Periférica 1/2CV QB80H".
--   Observação: a "descrição" (coluna name) NÃO tem unique — o bloqueio
--   percebido é, na verdade, o conflito de código acima.
--
-- SOLUÇÃO:
--   1) Remover o UNIQUE só em (code).
--   2) Criar unicidade por (code, brand) IGNORANDO códigos em branco,
--      para que vários produtos com variação (code = '') coexistam e o
--      mesmo código possa existir em marcas diferentes.
--
-- COMO APLICAR:
--   Painel Supabase -> SQL Editor -> New Query -> cole e Run.
--   É idempotente (pode rodar mais de uma vez sem problema).
-- ============================================================

-- 1) Remove o constraint/índice antigo de unicidade só por code
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_key;
DROP INDEX IF EXISTS public.products_code_key;

-- 2) Substitui qualquer índice anterior de (code, brand) pela versão que
--    ignora códigos em branco/nulos (produtos com variação).
DROP INDEX IF EXISTS public.products_code_brand_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_brand_uniq
  ON public.products (lower(btrim(code)), lower(btrim(brand)))
  WHERE btrim(coalesce(code, '')) <> '';

-- 3) Recarrega o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
