export interface PasswordRecovery {
  id: string;
  cnpj: string;
  whatsapp?: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

import { insertPwRec, updatePwRec, deletePwRec, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';
const KEY = STORAGE_KEYS.pwRecovery;

function getAll(): PasswordRecovery[] {
  return getCachedRows<PasswordRecovery>(KEY) ?? [];
}
function saveAll(items: PasswordRecovery[]) {
  setCachedRows(KEY, items);
}

export const passwordRecoveryService = {
  getAll(): PasswordRecovery[] {
    return getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  add(cnpj: string, whatsapp?: string): PasswordRecovery {
    const item: PasswordRecovery = { id: crypto.randomUUID(), cnpj, whatsapp, status: 'pending', createdAt: new Date().toISOString() };
    const all = getAll(); all.push(item); saveAll(all);
    void insertPwRec({ id: item.id, cnpj: item.cnpj, whatsapp: item.whatsapp ?? null, status: item.status, created_at: item.createdAt });
    return item;
  },
  update(id: string, data: Partial<PasswordRecovery>) {
    const all = getAll(); const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); void updatePwRec(id, { status: all[idx].status }); }
  },
  remove(id: string) { saveAll(getAll().filter(r => r.id !== id)); return deletePwRec(id); },
  pendingCount(): number { return getAll().filter(r => r.status === 'pending').length; },
};
