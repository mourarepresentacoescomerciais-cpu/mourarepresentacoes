-- ============================================================
-- HOTFIX — local_profile_refresh
-- Corrige: limite de crédito (e descontos/empresas liberadas) que aparecem
-- desatualizados no painel do cliente porque a sessão local guarda o perfil
-- antigo em cache. Esta função busca o perfil atualizado pelo id.
--
-- COMO RODAR: Supabase -> Database -> SQL Editor -> New Query -> cole TUDO -> Run.
-- Idempotente (pode rodar quantas vezes quiser).
-- ============================================================

create or replace function public.local_profile_refresh(_id uuid)
returns table (
  id uuid, cnpj text, email text, name text, role app_role, company_name text, trade_name text,
  address text, whatsapp text, pocket text, classification text, network text,
  credit_limit numeric, discount_pct numeric, brand_discounts jsonb, allowed_brands text[], active boolean, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.cnpj, p.email, p.name, p.role, p.company_name, p.trade_name,
         p.address, p.whatsapp, p.pocket, p.classification, p.network,
         p.credit_limit, p.discount_pct,
         coalesce(p.brand_discounts, '{}'::jsonb) as brand_discounts,
         p.allowed_brands, p.active, p.created_at
  from public.profiles p
  where p.id = _id
    and p.role in ('client','lead')
    and p.active = true
  limit 1
$$;

grant execute on function public.local_profile_refresh(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
