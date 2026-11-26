-- ============================================================================
-- HOTFIX: Sessão expirando em 2 dias derrubava TODAS as escritas/sincronização
-- ----------------------------------------------------------------------------
-- Sintoma: "nenhum dado está sendo salvo / não sincroniza / bugado".
-- Causa:   o token de sessão (app_sessions) tinha validade fixa de 2 dias a
--          partir do login e NÃO era renovado com o uso. Após 2 dias o token
--          expirava silenciosamente: escritas falhavam ("Sessão expirada") e
--          leituras de admin retornavam vazio — parecendo perda de dados.
-- Correção:
--   1) Validade de novas sessões: 30 dias.
--   2) Janela deslizante: cada uso válido do token estende a expiração em 30d.
--
-- COMO RODAR: cole este SQL inteiro no Supabase → SQL Editor → Run.
-- (Não apaga nenhum dado. Apenas redefine 2 funções.)
-- ============================================================================

-- Janela deslizante: ao validar um token válido, empurra a expiração p/ +30 dias.
create or replace function public._session(_token text)
returns public.app_sessions
language plpgsql volatile security definer set search_path = public, extensions as $$
declare _s public.app_sessions;
begin
  select * into _s
    from public.app_sessions
   where token_hash = encode(digest(_token, 'sha256'), 'hex')
     and expires_at > now()
   limit 1;

  if _s.token_hash is not null then
    update public.app_sessions
       set expires_at = now() + interval '30 days'
     where token_hash = _s.token_hash;
  end if;

  return _s;
end $$;

-- Novas sessões agora valem 30 dias (era 2 dias).
create or replace function public._issue_session(_profile_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare _tok text;
begin
  delete from public.app_sessions where expires_at < now();          -- limpeza
  _tok := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token_hash, profile_id, role, expires_at)
  values (encode(digest(_tok, 'sha256'), 'hex'), _profile_id, _role, now() + interval '30 days');
  return _tok;
end $$;
