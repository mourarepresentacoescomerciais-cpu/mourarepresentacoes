import type { AccessRequest } from './types';
import { upsertRow, deleteRow, submitAccessRequest, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';

const STORAGE_KEY = STORAGE_KEYS.access;

function getAll(): AccessRequest[] {
  return getCachedRows<AccessRequest>(STORAGE_KEY) ?? [];
}
function saveAll(items: AccessRequest[]) {
  setCachedRows(STORAGE_KEY, items);
}

export const accessRequestService = {
  getAll(): AccessRequest[] {
    return getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  add(data: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>): AccessRequest {
    const item: AccessRequest = {
      ...data, id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString(),
    };
    const all = getAll(); all.push(item); saveAll(all);
    // Criação pública (visitante não logado): RPC submit_access_request (insert-only).
    void submitAccessRequest(item);
    return item;
  },
  update(id: string, data: Partial<AccessRequest>) {
    const all = getAll(); const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); void upsertRow('access_requests', all[idx]); }
  },
  remove(id: string) {
    saveAll(getAll().filter(r => r.id !== id));
    return deleteRow('access_requests', id);
  },
  existsByCnpj(cnpj: string): boolean {
    const c = cnpj.replace(/\D/g, '');
    return getAll().some(r => r.cnpj.replace(/\D/g, '') === c && r.status !== 'rejected');
  },
};
