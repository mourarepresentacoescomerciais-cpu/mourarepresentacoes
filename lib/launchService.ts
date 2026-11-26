import type { LaunchImage } from './types';
import { upsertRow, deleteRow, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';

const STORAGE_KEY = STORAGE_KEYS.launches;

function getAll(): LaunchImage[] {
  // Fonte única: Supabase (cache em memória hidratado no boot). Sem mock/seed.
  return getCachedRows<LaunchImage>(STORAGE_KEY) ?? [];
}
function saveAll(items: LaunchImage[]) {
  setCachedRows(STORAGE_KEY, items);
}

export const launchService = {
  getAll(): LaunchImage[] { return getAll().filter(l => l.active).sort((a, b) => a.order - b.order); },
  getAllAdmin(): LaunchImage[] { return [...getAll()].sort((a, b) => a.order - b.order); },


  async add(data: Omit<LaunchImage, 'id'>): Promise<LaunchImage> {
    const item: LaunchImage = { ...data, id: crypto.randomUUID() };
    const all = getAll(); all.push(item); saveAll(all);
    // Aguarda a gravação antes de qualquer refetch (evita o item sumir até recarregar).
    await upsertRow('launches', item);
    return item;
  },
  async update(id: string, data: Partial<LaunchImage>) {
    const all = getAll(); const idx = all.findIndex(l => l.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); await upsertRow('launches', all[idx]); }
  },
  async remove(id: string) {
    saveAll(getAll().filter(l => l.id !== id));
    // Aguarda a exclusão no banco ANTES de qualquer refetch, senão uma
    // revalidação do servidor (ainda com a linha) traz o item de volta.
    await deleteRow('launches', id);
  },

  /** Sync a launch entry tied to a product id (uses product.id as launch.id). */
  syncFromProduct(product: { id: string; name?: string; description?: string; image?: string; isNew?: boolean; active?: boolean; brand?: string }) {
    const all = getAll();
    const idx = all.findIndex(l => l.id === product.id);
    const shouldExist = !!product.isNew && product.active !== false && !!product.image;

    if (!shouldExist) {
      if (idx >= 0) {
        all.splice(idx, 1);
        saveAll(all);
        void deleteRow('launches', product.id);
      }
      return;
    }

    const item: LaunchImage = {
      id: product.id,
      imageUrl: product.image || '',
      title: product.name || 'Lançamento',
      description: product.description || '',
      brand: product.brand || '',
      active: true,
      order: idx >= 0 ? all[idx].order : all.length + 1,
    };
    if (idx >= 0) all[idx] = { ...all[idx], ...item };
    else all.push(item);
    saveAll(all);
    void upsertRow('launches', item);
  },
};
