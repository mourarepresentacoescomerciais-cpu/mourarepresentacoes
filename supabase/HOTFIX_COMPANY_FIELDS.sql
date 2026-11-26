-- ============================================================
-- HOTFIX: campos de descrição e imagem (logo) para Empresas
-- Permite editar no painel admin: nome, descrição e imagem da empresa.
-- Seguro: roda quantas vezes quiser, não apaga dados.
-- ============================================================
alter table public.companies add column if not exists description text;
alter table public.companies add column if not exists logo_url text;

-- A leitura pública já está liberada (policy "companies public read").
-- A escrita continua via RPC sec_mutate (admin), que adapta-se às novas colunas
-- automaticamente — nenhuma alteração de função é necessária.
-- ============================================================
