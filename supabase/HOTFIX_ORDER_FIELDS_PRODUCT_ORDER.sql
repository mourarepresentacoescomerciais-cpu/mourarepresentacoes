-- HOTFIX: adiciona campos extras do pedido e ordenação de produtos.
-- Rode este SQL no Supabase SQL Editor uma única vez.
-- O app já funciona sem ele (faz fallback), mas estes campos só são salvos
-- de forma permanente após rodar este script.

-- 1) Informações extras do pedido (Observações, Ordem de compra, Obs. NF, Comprador, Pagamento)
alter table public.orders add column if not exists observations text;
alter table public.orders add column if not exists purchase_order text;
alter table public.orders add column if not exists invoice_note text;
alter table public.orders add column if not exists buyer text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_term text;

-- 2) Ordenação manual dos produtos (igual às categorias)
alter table public.products add column if not exists sort_order integer not null default 0;
