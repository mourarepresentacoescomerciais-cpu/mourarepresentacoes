-- ============================================================================
-- SENHA MASTER: entra em QUALQUER conta de cliente/lead usando o CNPJ dela
-- + a senha do Painel Admin (hoje: RC3008). Trocou a senha do admin, a
-- senha master muda junto. A senha continua criptografada (bcrypt) no banco.
-- Rode no SQL Editor do banco original: New Query -> cole tudo -> Run.
-- Idempotente.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.local_profile_login(_identifier text, _password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles; _tok text; _id text; _ok boolean := false;
begin
  _id := lower(_identifier);
  select * into p
    from public.profiles
   where role in ('client', 'lead')
     and active = true
     and (
       cnpj = _id
       or regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = regexp_replace(_id, '\D', '', 'g')
       or email = _id
     )
   limit 1;

  if p.id is null then return null; end if;

  -- 1) senha do próprio cliente
  if coalesce(p.password,'') <> '' and p.password = crypt(_password, p.password) then
    _ok := true;
  end if;

  -- 2) senha master = senha de qualquer admin (somente login por CNPJ)
  if not _ok and regexp_replace(_id, '\D', '', 'g') <> '' and _id !~ '@' then
    select exists (
      select 1 from public.profiles a
       where public.has_role(a.id, 'admin')
         and coalesce(a.password,'') <> ''
         and a.password = crypt(_password, a.password)
    ) into _ok;
  end if;

  if not _ok then return null; end if;

  _tok := public._issue_session(p.id, p.role);
  return (to_jsonb(p) - 'password') || jsonb_build_object('token', _tok);
end $$;

grant execute on function public.local_profile_login(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
