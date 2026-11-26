-- ============================================================
-- HOTFIX: rótulo da variação exibido ao cliente (ex.: "Voltagem")
-- Permite, no cadastro de produtos com variações, definir o nome/tipo
-- da variação que aparece em destaque para o cliente.
-- Seguro: pode rodar várias vezes, não apaga dados.
-- ============================================================
alter table public.products add column if not exists variation_label text;

-- A escrita continua via RPC sec_mutate (admin), que se adapta às novas
-- colunas automaticamente — nenhuma alteração de função é necessária.
-- ============================================================
