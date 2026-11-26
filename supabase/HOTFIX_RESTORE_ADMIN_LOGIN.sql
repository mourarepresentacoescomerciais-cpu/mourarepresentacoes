-- =============================================================================
-- HOTFIX_RESTORE_ADMIN_LOGIN.sql
-- Objetivo: diagnosticar se os dados ainda existem e RESTAURAR o login do admin
-- (que quebrou após o SECURITY_LOCKDOWN por exigir user_roles).
-- Rode no Supabase SQL Editor e LEIA o resultado do passo 1.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1) DIAGNÓSTICO: os dados ainda estão lá?
--    Se aparecerem linhas com role 'client'/'lead', os dados NÃO sumiram.
-- -----------------------------------------------------------------------------
select role, count(*) as total
  from public.profiles
 group by role
 order by role;

-- Mostra o(s) perfil(is) de admin existentes
select id, name, email, auth_email, role, active
  from public.profiles
 where role = 'admin' or email = 'admin' or auth_email = 'admin';

-- Mostra o que existe hoje em user_roles
select * from public.user_roles;

-- -----------------------------------------------------------------------------
-- 2) CONSERTO: garante que TODO perfil admin esteja em user_roles
-- -----------------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select p.id, 'admin'::public.app_role
  from public.profiles p
 where p.role = 'admin' or p.email = 'admin' or p.auth_email = 'admin'
on conflict (user_id, role) do nothing;

-- -----------------------------------------------------------------------------
-- 3) (Opcional) Redefine a senha do admin para 'admin' caso não consiga entrar.
--    Descomente se precisar. Depois troque por uma senha forte no painel.
-- -----------------------------------------------------------------------------
-- update public.profiles
--    set password = extensions.crypt('admin', extensions.gen_salt('bf'))
--  where role = 'admin' or email = 'admin' or auth_email = 'admin';

-- -----------------------------------------------------------------------------
-- 4) Confirmação: login do admin deve voltar a retornar um token (não null).
--    Troque a senha abaixo se você usa outra.
-- -----------------------------------------------------------------------------
-- select public.verify_admin_login('admin', 'admin');
