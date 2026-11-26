-- =============================================================
-- Promoções progressivas por quantidade.
-- Executar UMA VEZ no SQL Editor. Seguro para re-execução.
-- =============================================================

-- Novas colunas na tabela de promoções.
alter table public.product_promotions
  add column if not exists rule_type text not null default 'simple';

alter table public.product_promotions
  add column if not exists tiers jsonb;

-- Restringe rule_type aos valores conhecidos.
do $$ begin
  alter table public.product_promotions
    add constraint product_promotions_rule_type_check
    check (rule_type in ('simple','tiered'));
exception when duplicate_object then null; end $$;

-- Relaxa o check antigo de discount_value > 0: em promoções 'tiered' o valor
-- base é apenas um marcador (o desconto real vem das faixas em `tiers`).
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

alter table public.product_promotions
  add constraint product_promotions_discount_value_nonneg
  check (discount_value >= 0);

notify pgrst, 'reload schema';
