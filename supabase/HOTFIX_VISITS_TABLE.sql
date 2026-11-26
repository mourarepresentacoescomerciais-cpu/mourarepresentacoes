-- ============================================================
-- Rastreador de visitas migrado do localStorage para o Supabase.
-- Rode este script UMA vez no SQL Editor do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_created_at_idx ON public.visits (created_at DESC);

-- Grants para a Data API (PostgREST).
-- Visitas são registradas por qualquer visitante (anon) e lidas pelo painel
-- admin (que opera como anon, pois é login local sem sessão Supabase).
GRANT SELECT, INSERT ON public.visits TO anon;
GRANT SELECT, INSERT ON public.visits TO authenticated;
GRANT ALL ON public.visits TO service_role;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Qualquer um registra visita" ON public.visits;
CREATE POLICY "Qualquer um registra visita"
  ON public.visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Qualquer um le visitas" ON public.visits;
CREATE POLICY "Qualquer um le visitas"
  ON public.visits FOR SELECT
  TO anon, authenticated
  USING (true);
