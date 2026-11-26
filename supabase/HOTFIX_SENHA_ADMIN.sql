-- ============================================================================
-- ALTERAR A SENHA DO PAINEL ADMIN PARA: RC3008
-- Rode UMA VEZ no Supabase: Database -> SQL Editor -> New Query -> Run.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

update public.profiles p
   set password = crypt('RC3008', gen_salt('bf'))
 where public.has_role(p.id, 'admin');

-- Conferência (deve retornar true):
select p.id,
       coalesce(p.auth_email, p.email) as login,
       (p.password = crypt('RC3008', p.password)) as senha_ok
  from public.profiles p
 where public.has_role(p.id, 'admin');
