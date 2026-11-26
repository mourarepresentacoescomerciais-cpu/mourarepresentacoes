import type { Lead } from './types';
import { upsertProfile, deleteProfile, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';

const KEY = STORAGE_KEYS.leads;

function getAll(): Lead[] {
  return getCachedRows<Lead>(KEY) ?? [];
}
function saveAll(items: Lead[]) {
  setCachedRows(KEY, items);
}

export const leadService = {
  getAll(): Lead[] { return getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); },
  add(data: Omit<Lead, 'id' | 'createdAt' | 'active'> & { active?: boolean }): Lead {
    const lead: Lead = { ...data, active: data.active ?? true, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const all = getAll(); all.push(lead); saveAll(all);
    void upsertProfile({
      id: lead.id, role: 'lead', cnpj: lead.cnpj, email: lead.email,
      password: lead.password,
      companyName: lead.companyName, tradeName: lead.contactName,
      whatsapp: lead.whatsapp, allowedBrands: lead.allowedBrands, active: lead.active,
    } as any);
    return lead;
  },
  update(id: string, data: Partial<Lead>) {
    const all = getAll(); const idx = all.findIndex(l => l.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data }; saveAll(all);
      const l = all[idx];
      void upsertProfile({
        id: l.id, role: 'lead', cnpj: l.cnpj, email: l.email,
        password: l.password,
        companyName: l.companyName, tradeName: l.contactName,
        whatsapp: l.whatsapp, allowedBrands: l.allowedBrands, active: l.active,
      } as any);
    }
  },
  async remove(id: string) { saveAll(getAll().filter(l => l.id !== id)); await deleteProfile(id); },
  /**
   * Remove o lead APENAS do cache local, sem apagar o perfil no banco.
   * Usado na conversão lead -> cliente, onde o MESMO perfil (mesmo id/CNPJ)
   * passa a ter role 'client'. Apagar o perfil aqui destruiria o cliente novo.
   */
  removeLocal(id: string) { saveAll(getAll().filter(l => l.id !== id)); },
  findByCnpj(cnpj: string): Lead | undefined {
    const c = cnpj.replace(/\D/g, '');
    return getAll().find(l => l.cnpj.replace(/\D/g, '') === c);
  },
};
