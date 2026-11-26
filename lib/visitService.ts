// Rastreador de visitas: persistência EXCLUSIVA no Supabase (tabela `visits`).
// Cache em memória apenas para leitura síncrona instantânea no painel admin.
import { cacheGet, cacheSet, insertVisitDB, STORAGE_KEYS, type VisitRow } from './dataStore';

const KEY = STORAGE_KEYS.visits;

export type VisitEvent = VisitRow;

function load(): VisitEvent[] {
  return cacheGet<VisitEvent[]>(KEY, []);
}

// Rotas internas (painel admin e área do cliente) NÃO contam como visita do site.
const EXCLUDED_PREFIXES = ['/painel', '/admin'];
function isTrackable(path: string) {
  return !EXCLUDED_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}

// Evita reenviar a mesma visita repetidamente (re-render, StrictMode, voltar
// para uma página já contada). Throttle por caminho durante a sessão.
const sentThisSession = new Set<string>();

export const visitService = {
  track(path: string) {
    if (!isTrackable(path)) return;
    if (sentThisSession.has(path)) return;
    sentThisSession.add(path);
    const ref = document.referrer || undefined;
    // Atualiza o cache em memória (mantém os últimos 5000) e persiste no Supabase.
    const list = load();
    list.push({ ts: Date.now(), path, ref });
    cacheSet(KEY, list.slice(-5000));
    void insertVisitDB({ path, ref });
  },
  all(): VisitEvent[] { return load(); },
  total(): number { return load().length; },
  uniquePaths(): { path: string; count: number }[] {
    const map: Record<string, number> = {};
    for (const v of load()) map[v.path] = (map[v.path] || 0) + 1;
    return Object.entries(map).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);
  },
  byDay(days = 14): { day: string; visits: number }[] {
    const list = load();
    const out: { day: string; visits: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = list.filter(v => new Date(v.ts).toISOString().slice(0, 10) === key).length;
      out.push({ day: label, visits: count });
    }
    return out;
  },
};
