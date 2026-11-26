import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { leadService } from './leadService';
import { supabase, supabaseStateless, cnpjToEmail } from './supabase';
import { upsertProfile } from './dataStore';
import { setSession, clearSession, getToken } from './secureDb';

interface AuthUser {
  id: string;
  name: string;
  role: 'client' | 'admin' | 'lead';
  cnpj?: string;
  email?: string;
  companyName?: string;
  address?: string;
  pocket?: string;
  classification?: string;
  network?: string;
  creditLimit?: number;
  discountPct?: number;
  brandDiscounts?: Record<string, number>;
  allowedBrands?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  authReady: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isClient: boolean;
  isLead: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function profileToUser(p: any): AuthUser {
  return {
    id: p.id,
    name: p.trade_name || p.name || p.company_name || p.email || 'Usuário',
    role: (p.role as AuthUser['role']) || 'client',
    cnpj: p.cnpj || undefined,
    email: p.email || undefined,
    companyName: p.company_name || undefined,
    address: p.address || undefined,
    pocket: p.pocket || undefined,
    classification: p.classification || undefined,
    network: p.network || undefined,
    creditLimit: p.credit_limit != null ? Number(p.credit_limit) : undefined,
    discountPct: p.discount_pct != null ? Number(p.discount_pct) : undefined,
    brandDiscounts: p.brand_discounts || {},
    allowedBrands: p.allowed_brands || [],
  };
}


const cleanDigits = (v: string) => v.replace(/\D/g, '');

/** Verifica no Supabase se o usuário autenticado tem role 'admin' via user_roles/has_role. */
async function hasAdminRole(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (error) { console.warn('[has_role]', error.message); return false; }
    return data === true;
  } catch (e) {
    console.warn('[has_role] erro ao consultar user_roles:', e);
    return false;
  }
}

async function loadAuthUser(sessionUser: { id: string; email?: string | null }): Promise<AuthUser> {
  const email = sessionUser.email?.toLowerCase() || undefined;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionUser.id)
    .maybeSingle();

  if (error) console.warn('[profiles load]', error.message);

  // Permissão real: validada contra a tabela user_roles no Supabase.
  const isAdminRole = await hasAdminRole(sessionUser.id);

  if (profile) {
    const mapped = profileToUser(profile);
    if (isAdminRole && mapped.role !== 'admin') {
      return { ...mapped, role: 'admin', name: mapped.name || 'Administrador' };
    }
    return mapped;
  }

  // Sem profile: NÃO abrimos admin por fallback silencioso. Só é admin se o
  // Supabase confirmar a role em user_roles.
  return {
    id: sessionUser.id,
    name: email || 'Usuário',
    role: isAdminRole ? 'admin' : 'client',
    email,
  };
}

/**
 * Valida login do admin principal (sem sessão Supabase) contra o banco.
 * Usa a RPC segura verify_admin_login, que só retorna o perfil se a senha
 * conferir E o usuário tiver role 'admin' em user_roles.
 */
async function loadAdminLogin(
  identifier: string,
  password: string,
): Promise<{ status: 'ok'; user: AuthUser } | { status: 'denied' } | { status: 'unreachable' }> {
  try {
    const { data, error } = await supabaseStateless.rpc('verify_admin_login', {
      _identifier: identifier,
      _password: password,
    });
    if (error) {
      console.warn('[admin login] RPC verify_admin_login indisponível:', error.message);
      return { status: 'unreachable' };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) {
      if (row.token) setSession(row.token, 'admin');
      return {
        status: 'ok',
        user: {
          id: row.id,
          name: row.name || 'Administrador',
          role: 'admin',
          email: row.email || identifier,
        },
      };
    }
    return { status: 'denied' };
  } catch (e) {
    console.warn('[admin login] erro ao validar admin no Supabase:', e);
    return { status: 'unreachable' };
  }
}

async function loadLocalProfileLogin(identifier: string, password: string): Promise<AuthUser | null> {
  const trimmed = identifier.trim();
  const cleanId = cleanDigits(trimmed);
  const loginId = /@/.test(trimmed) ? trimmed.toLowerCase() : cleanId;

  const { data, error } = await supabaseStateless.rpc('local_profile_login', {
    _identifier: loginId,
    _password: password,
  });

  if (error) {
    console.warn('[profiles local login]', error.message);
    return null;
  }
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile) return null;
  if (profile.token) setSession(profile.token, (profile.role === 'lead' ? 'lead' : 'client'));
  return profileToUser(profile);
}

// Logout automático após 2h SEM interação (admin e painel do cliente).
const INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 horas de inatividade
const AUTH_KEY = 'moura_auth';
const LAST_ACTIVE_KEY = 'moura_auth_last_active';
const AUTH_SOURCE_KEY = 'moura_auth_source';
const LOGOUT_GUARD_KEY = 'moura_auth_logout_at';
const LOGOUT_GUARD_MS = 2 * 60 * 1000;

// Fallback em memória caso o localStorage/sessionStorage estejam cheios
// (cache de imagens de produtos). Garante que o login NÃO quebre e que
// NENHUM dado da aplicação seja apagado para liberar espaço.
const memoryAuth: Record<string, string> = {};

/** Libera espaço descartando SOMENTE caches recriáveis (produtos, imagens...). */
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

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return;
  } catch {
    // Storage cheio: a sessão tem PRIORIDADE sobre o cache de produtos/imagens.
    if (evictDisposableCache()) {
      try { storage.setItem(key, value); return; } catch {}
    }
    memoryAuth[key] = value;
    console.warn('[auth storage] storage cheio; usando memória (dados preservados).');
  }
}

function safeGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (v != null) return v;
  } catch {}
  return memoryAuth[key] ?? null;
}

function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
  delete memoryAuth[key];
}

function clearPersistedUser() {
  [AUTH_KEY, LAST_ACTIVE_KEY, AUTH_SOURCE_KEY].forEach(safeRemove);
}

function clearSupabaseSessionStorage() {
  [localStorage, sessionStorage].forEach(storage => {
    try {
      storage.removeItem('moura_supabase_auth');
      Object.keys(storage).forEach(k => {
        if (k.startsWith('sb-') || k.includes('supabase')) storage.removeItem(k);
      });
    } catch (e) { console.warn('[auth logout] falha ao limpar sessão Supabase local.', e); }
  });
}

function markLogoutGuard() {
  const value = String(Date.now());
  try { localStorage.setItem(LOGOUT_GUARD_KEY, value); } catch (e) { console.warn('[auth logout] falha ao marcar logout local.', e); }
  try { sessionStorage.setItem(LOGOUT_GUARD_KEY, value); } catch (e) { console.warn('[auth logout] falha ao marcar logout da sessão.', e); }
}

function clearLogoutGuard() {
  safeRemove(LOGOUT_GUARD_KEY);
}

function hasRecentLogoutGuard() {
  const raw = safeGet(LOGOUT_GUARD_KEY);
  const at = Number(raw || '0');
  if (!at) return false;
  const recent = Date.now() - at < LOGOUT_GUARD_MS;
  if (!recent) clearLogoutGuard();
  return recent;
}

function persistUser(nextUser: AuthUser, source: 'supabase' | 'local' = 'local') {
  const now = String(Date.now());
  [localStorage, sessionStorage].forEach(storage => {
    safeSet(storage, AUTH_KEY, JSON.stringify(nextUser));
    safeSet(storage, LAST_ACTIVE_KEY, now);
    safeSet(storage, AUTH_SOURCE_KEY, source);
  });
}

function isPersistedSessionExpired() {
  const lastActive = Number(safeGet(LAST_ACTIVE_KEY) || '0');
  return !!lastActive && Date.now() - lastActive > INACTIVITY_MS;
}

function getPersistedSource() {
  return safeGet(AUTH_SOURCE_KEY) === 'supabase' ? 'supabase' : 'local';
}

function readPersistedUser(): AuthUser | null {
  try {
    if (hasRecentLogoutGuard()) {
      clearPersistedUser();
      clearSupabaseSessionStorage();
      return null;
    }
    const saved = safeGet(AUTH_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (isPersistedSessionExpired()) {
      clearPersistedUser();
      return null;
    }
    return parsed?.id ? parsed : null;
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readPersistedUser());
  const [authReady, setAuthReady] = useState(false);
  const explicitLogoutRef = useRef(false);
  const effectiveUser = user || readPersistedUser();

  useEffect(() => {
    if (user) {
      persistUser(user, getPersistedSource());
    }
  }, [user]);

  // Atualiza timestamp de atividade ao interagir com a página.
  // IMPORTANTE (performance): este handler ficava ligado a `mousemove` e rodava
  // JSON.parse + várias leituras de localStorage a CADA evento (centenas por
  // segundo), travando o painel admin e a área do cliente. Agora é "throttled":
  // faz a checagem pesada no máximo 1x a cada 30s e usa listeners passivos.
  useEffect(() => {
    let lastBump = 0;
    const THROTTLE_MS = 30 * 1000;
    const bump = () => {
      const now = Date.now();
      if (now - lastBump < THROTTLE_MS) return;
      lastBump = now;
      if (!safeGet(AUTH_KEY)) return;
      if (isPersistedSessionExpired()) {
        clearPersistedUser();
        setUser(null);
        return;
      }
      const nowStr = String(now);
      safeSet(localStorage, LAST_ACTIVE_KEY, nowStr);
      safeSet(sessionStorage, LAST_ACTIVE_KEY, nowStr);
      if (!user) {
        const persisted = readPersistedUser();
        if (persisted) setUser(persisted);
      }
    };
    const events = ['click', 'keydown', 'mousemove', 'touchstart', 'visibilitychange', 'focus'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true }));
    // Verificação periódica: desloga automaticamente após 2h de inatividade,
    // mesmo que o usuário não interaja com a página (aba aberta parada).
    const idleCheck = window.setInterval(() => {
      if (!safeGet(AUTH_KEY)) return;
      if (isPersistedSessionExpired()) {
        clearPersistedUser();
        setUser(null);
      }
    }, 60 * 1000);
    return () => {
      events.forEach(e => window.removeEventListener(e, bump));
      window.clearInterval(idleCheck);
    };
  }, [user]);


  // Sincroniza com supabase.auth — NÃO desloga quando não há sessão Supabase
  // (clientes/leads criados pelo admin usam login local sem sessão Supabase).
  useEffect(() => {
    let mounted = true;
    const syncSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      if (!mounted) return;
      if (isPersistedSessionExpired()) {
        clearPersistedUser();
        setUser(null);
        setAuthReady(true);
        return;
      }
      if (!session?.user) {
        // Mantém o usuário persistido (admin local ou cliente/lead via RPC).
        const persisted = readPersistedUser();
        if (persisted) {
          persistUser(persisted, getPersistedSource());
          setUser(persisted);
        }
        setAuthReady(true);
        return;
      }
      const persisted = readPersistedUser();
      if (persisted && getPersistedSource() === 'local') {
        persistUser(persisted, 'local');
        setUser(persisted);
        setAuthReady(true);
        return;
      }
      const nextUser = await loadAuthUser(session.user);
      if (!mounted) return;
      persistUser(nextUser, 'supabase');
      setUser(nextUser);
      setAuthReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const persisted = readPersistedUser();
      if (!explicitLogoutRef.current && persisted && (!session?.user || event === 'SIGNED_OUT')) {
        persistUser(persisted, getPersistedSource());
        setUser(persisted);
        setAuthReady(true);
        return;
      }
      if (event === 'SIGNED_OUT' && !explicitLogoutRef.current) {
        const persisted = readPersistedUser();
        if (persisted) setUser(persisted);
        setAuthReady(true);
        return;
      }
      setTimeout(() => { void syncSession(session); }, 0);
    });

    supabase.auth.getSession().then(({ data }) => { void syncSession(data.session); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const login = async (identifier: string, password: string) => {
    clearLogoutGuard();
    const trimmed = identifier.trim();
    const isEmail = /@/.test(trimmed);
    const cleanId = cleanDigits(trimmed);
    // "moura" (sem @) vira moura@moura.local; CNPJ vira <digitos>@moura.local
    const email = isEmail
      ? trimmed.toLowerCase()
      : (cleanId.length >= 11 ? cnpjToEmail(cleanId) : `${trimmed.toLowerCase()}@moura.local`);

    const isMoura = !isEmail && trimmed.toLowerCase() === 'moura';
    // CNPJ puro (14 dígitos, sem @) é SEMPRE cliente/lead — vai direto à RPC
    // correta, evitando as chamadas de admin e de Supabase Auth (que falham
    // com 400 e deixavam o login lento).
    const isClientCnpj = !isEmail && !isMoura && cleanId.length >= 11;

    if (isClientCnpj) {
      clearSupabaseSessionStorage();
      const dbProfileUser = await loadLocalProfileLogin(trimmed, password);
      if (dbProfileUser) {
        persistUser(dbProfileUser, 'local');
        setUser(dbProfileUser);
        setAuthReady(true);
        return { success: true, user: dbProfileUser };
      }
      // Não encontrou como cliente: cai no fluxo de lead local abaixo.
      const leadByCnpj = leadService.findByCnpj(cleanId);
      if (leadByCnpj && leadByCnpj.password === password && leadByCnpj.active) {
        const nextUser: AuthUser = {
          id: leadByCnpj.id, name: leadByCnpj.contactName, role: 'lead',
          cnpj: leadByCnpj.cnpj, email: leadByCnpj.email, companyName: leadByCnpj.companyName,
          allowedBrands: leadByCnpj.allowedBrands,
        };
        persistUser(nextUser, 'local');
        setUser(nextUser);
        setAuthReady(true);
        return { success: true, user: nextUser };
      }
      return { success: false, error: 'CNPJ ou senha inválidos.' };
    }

    // Admin principal: validado de verdade no Supabase (profiles + user_roles).
    const adminResult = await loadAdminLogin(email, password);
    if (adminResult.status === 'ok') {
      persistUser(adminResult.user, 'local');
      setUser(adminResult.user);
      setAuthReady(true);
      return { success: true, user: adminResult.user };
    }
    if (adminResult.status === 'denied' && isMoura) {
      return {
        success: false,
        error: 'Acesso admin negado. Confirme que o perfil admin existe em profiles e possui role "admin" em user_roles (rode o SQL de auditoria no Supabase).',
      };
    }
    if (adminResult.status === 'unreachable' && isMoura) {
      // Sem fallback de credencial no cliente: o acesso admin é validado
      // exclusivamente no servidor (RPC verify_admin_login + user_roles).
      // Se o Supabase estiver indisponível, negamos o acesso.
      return {
        success: false,
        error: 'Não foi possível validar o acesso admin no servidor. Tente novamente em instantes.',
      };
    }


    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email, password,
    });
    if (authError) {
      console.warn('[supabase auth]', authError.status, authError.message, '-> email tentado:', email);
    }

    if (!authError && authData.user) {
      const nextUser = await loadAuthUser(authData.user);
      persistUser(nextUser, 'supabase');
      setUser(nextUser);
      setAuthReady(true);
      return { success: true, user: nextUser };
    }

    // Login de clientes/leads criados no painel admin e salvos em public.profiles.
    const dbProfileUser = await loadLocalProfileLogin(trimmed, password);
    if (dbProfileUser) {
      persistUser(dbProfileUser, 'local');
      setUser(dbProfileUser);
      setAuthReady(true);
      return { success: true, user: dbProfileUser };
    }

    // (Removido) Fallback de login via localStorage/SEED_CLIENTS — login agora é
    // exclusivamente via Supabase (Auth ou RPC local_profile_login).

    const leadByCnpj = leadService.findByCnpj(cleanId);
    const leadByEmail = leadService.getAll().find(l => l.email.toLowerCase() === identifier.toLowerCase());
    const lead = leadByCnpj || leadByEmail;
    if (lead && lead.password === password && lead.active) {
      const nextUser: AuthUser = {
        id: lead.id, name: lead.contactName, role: 'lead',
        cnpj: lead.cnpj, email: lead.email, companyName: lead.companyName,
        allowedBrands: lead.allowedBrands,
      };
      persistUser(nextUser, 'local');
      setUser(nextUser);
      setAuthReady(true);
      return { success: true, user: nextUser };
    }

    const msg = authError?.message?.toLowerCase().includes('email not confirmed')
      ? 'E-mail não confirmado no Supabase. Vá em Authentication → Users → seu usuário → "Confirm user".'
      : authError?.message
        ? `Falha no login (${authError.status}): ${authError.message}`
        : 'CNPJ/E-mail ou senha inválidos.';
    return { success: false, error: msg };
  };

  const logout = async () => {
    explicitLogoutRef.current = true;
    markLogoutGuard();
    // Detecta se o usuário atual é admin ANTES de limpar o estado, para
    // redirecionar ao login correto (admin permanece no login admin).
    const wasAdmin = (user || readPersistedUser())?.role === 'admin';
    // Limpa TODO o estado persistido antes de qualquer coisa, para que um
    // eventual reload não restaure o usuário automaticamente.
    clearPersistedUser();
    await clearSession();
    setUser(null);
    // Aguardamos o signOut do Supabase ANTES de recarregar a página, com um
    // timeout curto para não travar em rede lenta. Isso evita o bug em que o
    // reload acontecia antes do token ser revogado e a sessão admin era
    // restaurada automaticamente (parecia que "não saía").
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (e) { console.warn('[auth logout] signOut remoto não concluiu antes do redirecionamento.', e); }
    // Só agora removemos as chaves de sessão do Supabase, garantindo que o
    // signOut não as reescreva depois.
    clearSupabaseSessionStorage();
    // Redireciona para a tela de login correta.
    window.location.replace(wasAdmin ? '/admin' : '/login');
  };

  const refreshUser = async () => {
    const current = readPersistedUser();
    if (!current?.id || current.role === 'admin') return;
    try {
      const token = getToken();
      if (!token) return;
      const { data, error } = await supabase.rpc('local_profile_refresh', { _token: token });
      if (error) { console.warn('[refreshUser]', error.message); return; }
      const profile = Array.isArray(data) ? data[0] : data;
      if (profile) {
        const next = profileToUser(profile);
        persistUser(next, getPersistedSource());
        setUser(next);
      }
    } catch (e) {
      console.warn('[refreshUser]', e);
    }
  };


  return (
    <AuthContext.Provider value={{
      user: effectiveUser, login, logout, refreshUser, authReady,
      isAuthenticated: !!effectiveUser,
      isAdmin: effectiveUser?.role === 'admin',
      isClient: effectiveUser?.role === 'client',
      isLead: effectiveUser?.role === 'lead',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Re-export para conveniência
export { upsertProfile };
