-- ============================================================
-- HOTFIX — Leads (salvar / converter em cliente) e Empresas (reativação)
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- ============================================================

-- 1) E-mail vazio em profiles quebrava o salvamento de leads
--    ("Falha ao salvar em profiles" = duplicate key / unique violation),
--    porque vários leads são cadastrados sem e-mail ('').
--    Normaliza '' -> NULL e troca o índice único por um PARCIAL
--    (ignora nulos, permitindo vários perfis sem e-mail).
UPDATE public.profiles SET email = NULL WHERE email IS NOT NULL AND btrim(email) = '';

DROP INDEX IF EXISTS profiles_email_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_uniq
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- 2) CNPJ: mesma lógica (leads podem ter CNPJ vazio em rascunho).
UPDATE public.profiles SET cnpj = NULL WHERE cnpj IS NOT NULL AND btrim(cnpj) = '';
DROP INDEX IF EXISTS profiles_cnpj_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cnpj_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cnpj_uniq
  ON public.profiles (cnpj) WHERE cnpj IS NOT NULL;

-- 3) Empresas: reativa a Ilumi (e qualquer empresa marcada como inativa
--    indevidamente). Se quiser reativar SÓ a Ilumi, use a 1ª linha.
UPDATE public.companies SET active = true WHERE name ILIKE 'ilumi';
-- UPDATE public.companies SET active = true;   -- (opcional: reativa todas)

-- 4) Conferência rápida
SELECT name, active, sort_order FROM public.companies ORDER BY sort_order;
SELECT role, count(*) FROM public.profiles GROUP BY role;
