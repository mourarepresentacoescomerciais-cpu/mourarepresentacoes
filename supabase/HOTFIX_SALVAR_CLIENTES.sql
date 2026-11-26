-- ============================================================
-- HOTFIX: cadastro de CLIENTES não salva
-- ============================================================
-- PROBLEMA:
--   A tabela public.profiles foi criada originalmente com a coluna id
--   referenciando auth.users(id) (FOREIGN KEY profiles_id_fkey).
--   Os clientes do painel são criados pelo admin com um id gerado no app
--   (crypto.randomUUID()) e NÃO possuem um usuário em auth.users — portanto
--   o INSERT viola a foreign key e o cliente "não salva".
--
-- SOLUÇÃO:
--   Remover QUALQUER foreign key da coluna profiles.id que aponte para
--   auth.users (o app gerencia login de clientes de forma independente via
--   CNPJ/senha na própria tabela profiles) e garantir um default para o id.
--
-- COMO APLICAR:
--   Supabase -> SQL Editor -> New Query -> cole e Run.
--   É idempotente (pode rodar quantas vezes quiser).
-- ============================================================

-- 1) Remove todas as foreign keys da coluna profiles.id que referenciam auth.users.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel      on rel.oid = con.conrelid
      join pg_namespace nsp  on nsp.oid = rel.relnamespace
      join pg_class fref     on fref.oid = con.confrelid
      join pg_namespace fnsp on fnsp.oid = fref.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'profiles'
       and con.contype = 'f'
       and fnsp.nspname = 'auth'
       and fref.relname = 'users'
  loop
    execute format('alter table public.profiles drop constraint %I;', r.conname);
  end loop;
end $$;

-- 2) Garante um default para o id (caso o app não envie um).
alter table public.profiles alter column id set default gen_random_uuid();

-- 3) Reforça os grants necessários (idempotente).
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
