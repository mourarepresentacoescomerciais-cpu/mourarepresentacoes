-- HOTFIX: permitir que o admin (logado via fallback local, sem sessão Supabase)
-- crie/edite perfis de CLIENTE e LEAD pela RPC admin_upsert_profile.
-- A criação de novos ADMINs continua exigindo sessão Supabase com is_admin().
--
-- Rode este SQL no Supabase SQL Editor uma única vez.

create or replace function public.admin_upsert_profile(
  _id uuid, _cnpj text, _email text, _auth_email text, _password text, _name text, _role public.app_role,
  _company_name text, _trade_name text, _address text, _whatsapp text, _pocket text,
  _classification text, _network text, _credit_limit numeric, _discount_pct numeric,
  _allowed_brands text[], _active boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Só bloqueia se for tentativa de criar/editar um ADMIN sem estar autenticado como admin.
  if _role = 'admin' and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  insert into public.profiles (
    id, cnpj, email, auth_email, password, name, role, company_name, trade_name, address, whatsapp,
    pocket, classification, network, credit_limit, discount_pct, allowed_brands, active
  ) values (
    _id, nullif(_cnpj,''), nullif(_email,''), nullif(_auth_email,''), nullif(_password,''), _name, _role,
    _company_name, _trade_name, _address, _whatsapp, _pocket, _classification, _network,
    coalesce(_credit_limit,0), coalesce(_discount_pct,0), coalesce(_allowed_brands,'{}'), coalesce(_active,true)
  ) on conflict (id) do update set
    cnpj = excluded.cnpj, email = excluded.email, auth_email = excluded.auth_email,
    password = coalesce(excluded.password, public.profiles.password), name = excluded.name, role = excluded.role,
    company_name = excluded.company_name, trade_name = excluded.trade_name, address = excluded.address,
    whatsapp = excluded.whatsapp, pocket = excluded.pocket, classification = excluded.classification,
    network = excluded.network, credit_limit = excluded.credit_limit, discount_pct = excluded.discount_pct,
    allowed_brands = excluded.allowed_brands, active = excluded.active;
end $$;

grant execute on function public.admin_upsert_profile(
  uuid,text,text,text,text,text,public.app_role,text,text,text,text,text,text,text,numeric,numeric,text[],boolean
) to anon, authenticated;

-- Também permite DELETE de cliente/lead por anon (admin local).
drop policy if exists "profiles local admin delete" on public.profiles;
create policy "profiles local admin delete" on public.profiles
  for delete to anon, authenticated
  using (role in ('client','lead'));
