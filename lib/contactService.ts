export interface ContactRequest {
  id: string;
  cnpj: string;
  empresa: string;
  nome: string;
  whatsapp: string;
  email: string;
  mensagem: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

import { insertContact, updateContact, deleteContact, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';
const KEY = STORAGE_KEYS.contacts;

function getAll(): ContactRequest[] {
  return getCachedRows<ContactRequest>(KEY) ?? [];
}
function saveAll(items: ContactRequest[]) {
  setCachedRows(KEY, items);
}

export const contactService = {
  getAll(): ContactRequest[] {
    return [...getAll()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  add(data: Omit<ContactRequest, 'id' | 'status' | 'createdAt'>): ContactRequest {
    const item: ContactRequest = { ...data, id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString() };
    const all = getAll(); all.push(item); saveAll(all);
    void insertContact({
      id: item.id, cnpj: item.cnpj, empresa: item.empresa, nome: item.nome,
      whatsapp: item.whatsapp, email: item.email, mensagem: item.mensagem,
      status: item.status, created_at: item.createdAt,
    });
    return item;
  },
  update(id: string, data: Partial<ContactRequest>) {
    const all = getAll(); const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); void updateContact(id, { status: all[idx].status }); }
  },
  remove(id: string) { saveAll(getAll().filter(r => r.id !== id)); return deleteContact(id); },
  pendingCount(): number { return getAll().filter(r => r.status === 'pending').length; },
};
