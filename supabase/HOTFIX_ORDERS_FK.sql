-- ============================================================
-- HOTFIX: Remover FK orders.client_id -> profiles(id)
-- ============================================================
-- PROBLEMA: o login é local (clientes/leads sem sessão Supabase),
-- então client_id não existe em public.profiles e o INSERT falha:
--   "insert or update on table 'orders' violates foreign key
--    constraint 'orders_client_id_fkey'"
--
-- COMO APLICAR:
--   1. Painel Supabase -> SQL Editor
--   2. Cole e execute o bloco abaixo
-- ============================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_client_id_fkey;

-- (opcional) mesma situação em quote_requests, se existir
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'quote_requests_client_id_fkey'
      AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE public.quote_requests DROP CONSTRAINT quote_requests_client_id_fkey';
  END IF;
END $$;
