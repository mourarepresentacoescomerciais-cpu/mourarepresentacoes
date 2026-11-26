/**
 * Camada de acesso SEGURO ao Supabase.
 *
 * O sistema usa "login local" (CNPJ/identificador + senha) sem sessão nativa do
 * Supabase. Para que o banco consiga reconhecer quem está autenticado — e assim
 * fechar as policies de RLS — o login emite um TOKEN DE SESSÃO assinado pelo
 * banco (ver SECURITY_LOCKDOWN.sql). Este módulo:
 *   - guarda/recupera esse token (localStorage);
 *   - envia o token em todas as escritas/leituras sensíveis via RPCs SECURITY DEFINER;
 *   - cria um cliente de storage que envia o token no header `x-admin-token`
 *     (policy temporária de upload controlada pelo banco, sem Edge Functions).
 */
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

const TOKEN_KEY = 'moura_session_token';
const ROLE_KEY = 'moura_session_role';

export type SessionRole = 'admin' | 'client' | 'lead';

// Fallback em memória: se o localStorage estiver cheio (ex.: cache de imagens),
// o token/role de sessão continuam disponíveis nesta sessão do navegador. Sem
// isto, o token silenciosamente sumia e NADA salvava ("Sessão expirada").
let memoryToken: string | null = null;
let memoryRole: SessionRole | null = null;
let memoryAdminToken: string | null = null;
const ADMIN_TOKEN_KEY = 'moura_session_token_admin';

function evictDisposableCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('moura_fastcache') || k.startsWith('moura_cache'))) keys.push(k);
    }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    return keys.length > 0;
  } catch { return false; }
}

export function setSession(token: string, role: SessionRole) {
  memoryToken = token;
  memoryRole = role;
  if (role === 'admin') memoryAdminToken = token;
  const write = () => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
    if (role === 'admin') localStorage.setItem(ADMIN_TOKEN_KEY, token);
  };
  try {
    write();
  } catch {
    // Storage cheio: o token de sessão tem prioridade sobre caches recriáveis.
    if (evictDisposableCache()) { try { write(); } catch {} }
  }
}

export function getToken(): string | null {
  try {
    const v = localStorage.getItem(TOKEN_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return memoryToken;
}

/** Token de admin guardado à parte: um login de cliente em outra aba não derruba o painel. */
export function getAdminToken(): string | null {
  try {
    const v = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return memoryAdminToken || (getSessionRole() === 'admin' ? getToken() : null);
}

export function getSessionRole(): SessionRole | null {
  try {
    const v = localStorage.getItem(ROLE_KEY) as SessionRole | null;
    if (v) return v;
  } catch { /* ignore */ }
  return memoryRole;
}

export async function clearSession() {
  const token = getToken();
  if (token) {
    try { await supabase.rpc('logout_session', { _token: token }); } catch { /* best-effort */ }
  }
  const wasAdmin = getSessionRole() === 'admin';
  memoryToken = null;
  memoryRole = null;
  if (wasAdmin) memoryAdminToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY);
    if (wasAdmin) localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}


type DbError = { message: string } | null;

/** Escrita genérica (somente admin) via RPC sec_mutate. */
export async function secMutate(
  table: string,
  action: 'insert' | 'upsert' | 'update' | 'delete',
  payload: Record<string, unknown> = {},
  match: Record<string, unknown> = {},
  conflict = 'id',
): Promise<{ error: DbError }> {
  const token = getAdminToken() || getToken();
  if (!token) return { error: { message: 'Sessão expirada — faça login novamente para salvar.' } };
  const { error } = await supabase.rpc('sec_mutate', {
    _token: token, _table: table, _action: action,
    _payload: payload, _match: match, _conflict: conflict,
  });
  if (error && /^(forbidden|unauthorized|not authorized)$/i.test(error.message)) {
    return { error: { message: 'Sua sessão não tem autorização para salvar. Saia do painel e entre novamente como administrador; a alteração não foi salva.' } };
  }
  return { error: error ? { message: error.message } : null };
}

/** Leitura de tabelas sensíveis simples (somente admin). */
export async function adminSelect(table: string): Promise<{ data: any[] | null; error: DbError }> {
  const token = getAdminToken() || getToken();
  if (!token) return { data: null, error: { message: 'no-session' } };
  const { data, error } = await supabase.rpc('admin_select', { _token: token, _table: table });
  return { data: Array.isArray(data) ? data : null, error: error ? { message: error.message } : null };
}

export async function adminListProfiles(role: 'client' | 'lead'): Promise<any[] | null> {
  const token = getAdminToken() || getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('admin_list_profiles', { _token: token, _role: role });
  if (error) { console.warn('[admin_list_profiles]', error.message); return null; }
  return Array.isArray(data) ? data : null;
}

export async function adminOrders(): Promise<any[] | null> {
  const token = getAdminToken() || getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('admin_orders', { _token: token });
  if (error) { console.warn('[admin_orders]', error.message); return null; }
  return Array.isArray(data) ? data : null;
}

export async function adminQuotes(): Promise<any[] | null> {
  const token = getAdminToken() || getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('admin_quotes', { _token: token });
  if (error) { console.warn('[admin_quotes]', error.message); return null; }
  return Array.isArray(data) ? data : null;
}

export async function clientOrders(): Promise<any[] | null> {
  const token = getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('client_orders', { _token: token });
  if (error) { console.warn('[client_orders]', error.message); return null; }
  return Array.isArray(data) ? data : null;
}

/** Cria pedido (cliente/lead/admin). */
export async function placeOrder(order: Record<string, unknown>): Promise<{ error: DbError }> {
  const token = getToken();
  if (!token) return { error: { message: 'Sessão expirada — faça login novamente.' } };
  const { error } = await supabase.rpc('place_order', { _token: token, _order: order });
  return { error: error ? { message: error.message } : null };
}

/**
 * Atualiza um pedido/orçamento existente (dono ou admin). Substitui os itens
 * quando `items` é informado. Usa a RPC update_order (SECURITY DEFINER) que
 * valida a posse — sem isso o cliente não conseguia editar (erro em order_items).
 */
export async function updateOrderRPC(
  id: string,
  patch: Record<string, unknown>,
  items?: unknown[] | null,
): Promise<{ error: DbError }> {
  const token = getToken();
  if (!token) return { error: { message: 'Sessão expirada — faça login novamente.' } };
  const { error } = await supabase.rpc('update_order', {
    _token: token, _id: id, _patch: patch ?? {}, _items: items ?? null,
  });
  return { error: error ? { message: error.message } : null };
}

/** Envios públicos (visitante não logado). */
export async function publicSubmit(
  kind: 'quote' | 'access_request' | 'contact' | 'password_recovery',
  payload: Record<string, unknown>,
): Promise<{ error: DbError }> {
  const rpc =
    kind === 'quote' ? 'submit_quote'
    : kind === 'access_request' ? 'submit_access_request'
    : kind === 'contact' ? 'submit_contact'
    : 'submit_password_recovery';
  const arg = kind === 'quote' ? { _quote: payload } : { _payload: payload };
  const { error } = await supabase.rpc(rpc, arg as any);
  return { error: error ? { message: error.message } : null };
}

/**
 * Cliente de storage para uploads do admin. Envia o token no header
 * `x-admin-token`, validado pela policy `_is_admin_request()` no banco.
 */
export function adminStorage() {
  const token = getAdminToken() || getToken();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { 'x-admin-token': token } : {} },
  }).storage;
}
