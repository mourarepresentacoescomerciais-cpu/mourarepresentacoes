-- ============================================================
-- HOTFIX — cnpj_exists
-- Corrige: "Esqueci minha senha" aceitava qualquer CNPJ, mesmo sem cadastro.
-- Esta função verifica de forma segura se existe um perfil ATIVO (client/lead)
-- com o CNPJ informado, ignorando máscara/pontuação.
--
-- COMO RODAR: Supabase -> Database -> SQL Editor -> New Query -> cole TUDO -> Run.
-- Idempotente (pode rodar quantas vezes quiser).
-- ============================================================

create or replace function public.cnpj_exists(_cnpj text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.role in ('client','lead')
      and p.active = true
      and regexp_replace(coalesce(p.cnpj,''), '\D', '', 'g') = regexp_replace(coalesce(_cnpj,''), '\D', '', 'g')
      and regexp_replace(coalesce(_cnpj,''), '\D', '', 'g') <> ''
  )
$$;

grant execute on function public.cnpj_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';
