-- =============================================================
-- HOTFIX: promoções progressivas + ordem das promoções + Mais Vendidos
-- Execute UMA VEZ no SQL Editor. Seguro para re-execução.
-- =============================================================

-- 1) Promoção progressiva por quantidade (estava salvando como "simples"
--    quando estas colunas não existiam no banco).
alter table public.product_promotions
  add column if not exists rule_type text not null default 'simple';

alter table public.product_promotions
  add column if not exists tiers jsonb;

do $$ begin
  alter table public.product_promotions
    add constraint product_promotions_rule_type_check
    check (rule_type in ('simple','tiered'));
exception when duplicate_object then null; end $$;

-- Em promoções 'tiered' o discount_value base é apenas um marcador.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.product_promotions'::regclass
       and pg_get_constraintdef(oid) ilike '%discount_value%>%0%'
  loop
    execute format('alter table public.product_promotions drop constraint %I', c.conname);
  end loop;
end $$;

do $$ begin
  alter table public.product_promotions
    add constraint product_promotions_discount_value_nonneg
    check (discount_value >= 0);
exception when duplicate_object then null; end $$;

-- 2) Ordem de apresentação das promoções no painel do cliente.
alter table public.product_promotions
  add column if not exists sort_order integer not null default 0;

-- 3) Ordem de apresentação dos "Mais Vendidos" (TOP 10) no painel do cliente.
alter table public.products
  add column if not exists featured_order integer not null default 0;

notify pgrst, 'reload schema';
