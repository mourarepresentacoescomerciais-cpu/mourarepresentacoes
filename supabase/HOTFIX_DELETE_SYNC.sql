-- ============================================================
-- HOTFIX DELETE SYNC — Moura Representações
-- Corrige: ao EXCLUIR uma Solicitação de Acesso, um Contato ou uma
-- Recuperação de Senha no painel, o registro volta a aparecer em outro
-- dispositivo (a exclusão não chega ao banco).
--
-- POR QUÊ: o admin entra por LOGIN LOCAL (sem sessão Supabase = papel "anon").
-- O DELETE sai como "anon". Se a tabela tiver uma policy RESTRICTIVE, ou não
-- tiver uma policy de DELETE para anon + GRANT DELETE no Data API, o banco
-- ignora a exclusão em silêncio: some localmente, mas continua no servidor e
-- "ressuscita" em outro aparelho na próxima sincronização.
--
-- COMO RODAR: Supabase -> Database -> SQL Editor -> New Query
-- -> cole TUDO -> Run. É idempotente (pode rodar quantas vezes quiser).
-- ============================================================

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['access_requests', 'contacts', 'password_recoveries']
  loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      -- Remove TODAS as policies antigas (inclusive RESTRICTIVE que bloqueiam delete)
      for pol in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, t);
      end loop;

      -- Garante permissões do Data API e RLS habilitada
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
      execute format('grant all on public.%I to service_role', t);
      execute format('alter table public.%I enable row level security', t);

      -- Policy única e permissiva: leitura/escrita/exclusão liberadas
      execute format(
        'create policy "full_rw" on public.%I for all to anon, authenticated using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;
