-- Coluna de preço fixo (produtos sem desconto do cliente)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fixed_price boolean NOT NULL DEFAULT false;
