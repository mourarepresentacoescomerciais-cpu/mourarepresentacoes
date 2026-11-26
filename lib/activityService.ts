// Registro de atividade do cliente (Raio X no Painel Admin).
// Grava acessos, buscas, itens adicionados ao carrinho e carrinho salvo.
// Tudo é "best-effort": se a tabela/RPC ainda não existir no banco, o sistema
// continua funcionando normalmente (apenas não mostra o Raio X).
import { supabase } from '@/integrations/supabase/client';

// As RPCs vivem no banco do projeto (fora dos tipos gerados).
const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
import { getToken } from './secureDb';

export type ActivityKind = 'acesso' | 'busca' | 'carrinho' | 'carrinho_salvo' | 'pedido';

export interface ActivityRow {
  id: string;
  created_at: string;
  client_id?: string | null;
  client_name?: string | null;
  client_cnpj?: string | null;
  brand?: string | null;
  kind: ActivityKind | string;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
}

const recent = new Set<string>();

export const activityService = {
  /** Registra um evento do cliente (não bloqueia a interface). */
  async track(kind: ActivityKind, opts: { brand?: string; detail?: string; meta?: Record<string, unknown>; dedupeMs?: number } = {}): Promise<boolean> {
    const token = getToken();
    if (!token) return false;
    const key = `${kind}|${opts.brand || ''}|${opts.detail || ''}`;
    const dedupe = opts.dedupeMs ?? 0;
    if (dedupe > 0) {
      if (recent.has(key)) return false;
      recent.add(key);
      setTimeout(() => recent.delete(key), dedupe);
    }
    const { error } = await db.rpc('track_activity', {
        _token: token,
        _kind: kind,
        _brand: opts.brand ?? null,
        _detail: opts.detail ?? null,
        _meta: opts.meta ?? {},
      });
    if (error) {
      console.warn('[track_activity]', error.message);
      return false;
    }
    return true;
  },

  /** Leitura pelo painel admin. Retorna [] se o recurso ainda não foi criado. */
  async list(): Promise<ActivityRow[]> {
    const token = getToken();
    if (!token) return [];
    const { data, error } = await db.rpc('admin_activity', { _token: token });
    if (error) { console.warn('[admin_activity]', error.message); return []; }
    return Array.isArray(data) ? (data as ActivityRow[]) : [];
  },
};
