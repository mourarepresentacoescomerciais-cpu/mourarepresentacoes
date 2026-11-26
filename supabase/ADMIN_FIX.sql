-- Reparo concreto para o login admin abrir o painel e liberar gravações via RLS.
-- Rode no Supabase SQL Editor depois de criar o usuário Auth admin@moura.local.

insert into public.profiles (id, email, name, role, active)
select id, email, 'Administrador', 'admin'::public.app_role, true
from auth.users
where lower(email) = 'admin@moura.local'
on conflict (id) do update set
  email = excluded.email,
  name = 'Administrador',
  role = 'admin'::public.app_role,
  active = true;

select id, email, name, role, active
from public.profiles
where lower(email) = 'admin@moura.local';