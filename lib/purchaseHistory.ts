import type { Order } from './orders';
import type { Product } from './types';
import { supabase } from './supabase';
import { getAdminToken, getToken } from './secureDb';

export interface HistoryOverride {
  original_product_id: string;
  replacement_product_id: string | null;
  hidden: boolean;
}

export function resolvePurchaseHistory(orders: Order[], products: Product[], overrides: HistoryOverride[], brand?: string) {
  const changes = new Map(overrides.map(row => [row.original_product_id, row]));
  const seen = new Set<string>();
  const result: { originalId: string; product: Product }[] = [];
  for (const order of [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    for (const item of order.items) {
      const change = changes.get(item.productId);
      if (change?.hidden) continue;
      const id = change?.replacement_product_id || item.productId;
      const product = products.find(p => p.id === id);
      if (!product?.active || (brand && product.brand.toLowerCase() !== brand.toLowerCase()) || seen.has(id)) continue;
      seen.add(id);
      result.push({ originalId: item.productId, product });
    }
  }
  // Manually added products: self-replacement overrides not tied to an order.
  for (const change of overrides) {
    if (change.hidden || change.replacement_product_id !== change.original_product_id) continue;
    const id = change.original_product_id;
    const product = products.find(p => p.id === id);
    if (!product?.active || (brand && product.brand.toLowerCase() !== brand.toLowerCase()) || seen.has(id)) continue;
    seen.add(id);
    result.push({ originalId: id, product });
  }
  return result;
}

function explain(message: string | undefined, fallback: string) {
  const m = (message || '').toLowerCase();
  if (m.includes('unauthorized') || m.includes('forbidden') || m.includes('session')) {
    return 'Sua sessão expirou ou pertence a outra conta. Saia e entre novamente para editar o histórico.';
  }
  if (m.includes('could not find') || m.includes('does not exist')) {
    return 'A edição do histórico ainda não está disponível no banco conectado.';
  }
  return fallback;
}

export async function readHistoryOverrides(clientId: string, asAdmin = false): Promise<HistoryOverride[]> {
  const token = asAdmin ? getAdminToken() : getToken();
  if (!token) throw new Error('Faça login novamente para acessar o histórico.');
  const { data, error } = await supabase.rpc('purchase_history_read', { _token: token, _client_id: clientId });
  if (error) throw new Error(explain(error.message, 'Não foi possível carregar as alterações do histórico. Tente novamente.'));
  return Array.isArray(data) ? data : [];
}

export async function saveHistoryOverride(clientId: string, originalId: string, replacementId: string | null, hidden: boolean, asAdmin = false) {
  const token = asAdmin ? getAdminToken() : getToken();
  if (!token) throw new Error('Faça login novamente para salvar.');
  const { error } = await supabase.rpc('purchase_history_save', {
    _token: token, _client_id: clientId, _original_id: originalId,
    _replacement_id: replacementId, _hidden: hidden,
  });
  if (error) throw new Error(explain(error.message, 'Não foi possível salvar a alteração no histórico. Tente novamente.'));
}