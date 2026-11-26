-- ============================================================
-- HOTFIX: clientes/leads "sumiram" do Painel Admin
-- ============================================================
-- CAUSA: o admin do sistema entra via login LOCAL (sem sessão Supabase),
-- então auth.uid() é NULL e as policies de SELECT da tabela "profiles"
-- (self read / admin read) bloqueiam a leitura pelo papel anon.
-- Os clientes CONTINUAM no banco — apenas não eram lidos pelo painel.
--
-- SOLUÇÃO: uma função SECURITY DEFINER que lista os perfis por papel
-- (client/lead), executável por anon. Não expomos a tabela inteira ao anon.
--
-- COMO APLICAR:
--   1. Supabase → SQL Editor → New Query
--   2. Cole TODO este arquivo
--   3. Run
-- ============================================================

create or replace function public.admin_list_profiles(_role public.app_role)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where role = _role;
$$;

grant execute on function public.admin_list_profiles(public.app_role) to anon, authenticated;
