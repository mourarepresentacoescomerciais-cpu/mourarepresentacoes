-- ============================================================
-- HOTFIX — Storage de Catálogos (PDFs e capas)
-- Corrige: catálogos não baixam e erro "localStorage cheio
-- (QuotaExceededError) moura_catalogs". A causa é o PDF ser salvo como
-- base64 gigante dentro da linha do banco e do navegador.
-- Solução: guardar os arquivos no Storage e salvar apenas a URL.
--
-- COMO RODAR: Supabase -> SQL Editor -> New Query -> cole TUDO -> Run.
-- Idempotente (pode rodar quantas vezes quiser).
-- ============================================================

-- 1) Cria o bucket público "catalogs" (se não existir)
insert into storage.buckets (id, name, public)
values ('catalogs', 'catalogs', true)
on conflict (id) do update set public = true;

-- 2) Políticas de acesso ao bucket
-- Leitura pública (qualquer visitante pode baixar os catálogos)
drop policy if exists "catalogs public read" on storage.objects;
create policy "catalogs public read"
on storage.objects for select
using (bucket_id = 'catalogs');

-- Upload/edição/remoção (necessário para o admin enviar catálogos)
drop policy if exists "catalogs public write" on storage.objects;
create policy "catalogs public write"
on storage.objects for insert
with check (bucket_id = 'catalogs');

drop policy if exists "catalogs public update" on storage.objects;
create policy "catalogs public update"
on storage.objects for update
using (bucket_id = 'catalogs');

drop policy if exists "catalogs public delete" on storage.objects;
create policy "catalogs public delete"
on storage.objects for delete
using (bucket_id = 'catalogs');
