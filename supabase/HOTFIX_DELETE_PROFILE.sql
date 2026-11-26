-- ============================================================
-- HOTFIX: clientes/leads "voltam" depois de excluídos
-- ============================================================
-- CAUSA: o admin do sistema entra via login LOCAL (sem sessão Supabase),
-- então auth.uid() é NULL e o DELETE direto em "profiles" é bloqueado
-- pela RLS. O registro continua no banco e o boot re-hidrata o cache.
--
-- SOLUÇÃO: função SECURITY DEFINER que apaga perfis client/lead,
-- executável por anon (não permite apagar ADMINs).
--
-- COMO APLICAR: Supabase -> SQL Editor -> cole tudo -> Run
-- ============================================================

create or replace function public.admin_delete_profile(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles
  where id = _id and role in ('client', 'lead');
end;
$$;

grant execute on function public.admin_delete_profile(uuid) to anon, authenticated;
