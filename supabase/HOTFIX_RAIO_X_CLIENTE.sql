-- ============================================================================
-- HOTFIX_RAIO_X_CLIENTE.sql — Moura Representações
-- Cria o registro de atividade do cliente (Raio X no Painel Admin):
-- acessos, buscas, itens adicionados ao carrinho e carrinho salvo/abandonado.
-- Seguro e idempotente: não apaga nem altera nenhum dado existente.
-- Como aplicar: SQL Editor -> New Query -> cole TUDO -> Run.
-- ============================================================================
set search_path = public, extensions;

create table if not exists public.client_activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  client_name text,
  client_cnpj text,
  brand text,
  kind text not null,          -- acesso | busca | carrinho | carrinho_salvo
  detail text,                 -- termo buscado, nome do produto, etc.
  meta jsonb not null default '{}'::jsonb
);

create index if not exists client_activity_created_idx on public.client_activity (created_at desc);
create index if not exists client_activity_client_idx on public.client_activity (client_cnpj);

grant all on public.client_activity to service_role;
revoke all on public.client_activity from anon, authenticated;
alter table public.client_activity enable row level security;

-- Registro de atividade (cliente/lead logado, via token de sessão).
create or replace function public.track_activity(
  _token text,
  _kind text,
  _brand text default null,
  _detail text default null,
  _meta jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions; v_uid uuid; v_name text; v_cnpj text;
begin
  s := public._session(_token);
  if s.profile_id is null or s.role not in ('client', 'lead') then
    raise exception 'unauthorized';
  end if;
  if _kind not in ('acesso', 'busca', 'carrinho', 'carrinho_salvo', 'pedido') then
    raise exception 'invalid activity kind';
  end if;
  v_uid := s.profile_id;
  select p.company_name, p.cnpj into v_name, v_cnpj
    from public.profiles p where p.id = v_uid limit 1;
  insert into public.client_activity(client_id, client_name, client_cnpj, brand, kind, detail, meta)
  values (v_uid, v_name, v_cnpj, _brand, _kind, _detail, coalesce(_meta, '{}'::jsonb));
end $$;

grant execute on function public.track_activity(text, text, text, text, jsonb) to anon, authenticated;

-- Leitura pelo painel admin (últimos 90 dias).
create or replace function public.admin_activity(_token text)
returns setof public.client_activity
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public._session(_token) s where s.role = 'admin') then
    raise exception 'not authorized';
  end if;
  return query
    select * from public.client_activity
     where created_at > now() - interval '90 days'
     order by created_at desc
     limit 5000;
end $$;

grant execute on function public.admin_activity(text) to anon, authenticated;

notify pgrst, 'reload schema';
