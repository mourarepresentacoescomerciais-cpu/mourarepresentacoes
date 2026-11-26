import type { Category, Product } from './types';
import { upsertRow, deleteRow, STORAGE_KEYS, getCachedRows, setCachedRows, DATA_READY_EVENT } from './dataStore';
import { adminStorage } from './secureDb';

const STORAGE_KEY = STORAGE_KEYS.products;

/**
 * Envia a imagem do produto para o Storage e devolve a URL pública.
 * Evita guardar base64 gigante na coluna `image` — o que fazia o `select('*')`
 * dos produtos baixar megabytes por linha a cada carregamento (egress alto).
 * As URLs do Storage são pequenas e servidas com cache de CDN.
 */
export async function uploadProductImage(blob: Blob, ext = 'jpg'): Promise<string> {
  const path = `products/${crypto.randomUUID()}.${ext}`;
  const storage = adminStorage();
  const { error } = await storage.from('catalogs').upload(path, blob, {
    cacheControl: '31536000',
    upsert: true,
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = storage.from('catalogs').getPublicUrl(path);
  return data.publicUrl;
}


function getAll(): Product[] {
  // Fonte única: Supabase (cache em memória hidratado no boot). Sem mock/seed.
  return getCachedRows<Product>(STORAGE_KEY) ?? [];
}
function saveAll(products: Product[]) {
  setCachedRows(STORAGE_KEY, products);
  try {
    window.dispatchEvent(new CustomEvent(DATA_READY_EVENT, { detail: { scope: 'products', rows: products } }));
  } catch {}
}

const normValue = (s?: string) => (s || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map(part => part.length > 3 && part.endsWith('s') ? part.slice(0, -1) : part)
  .join(' ');
const normGroup = (p: Product) => `${normValue(p.brand)}|${normValue(p.category)}|${normValue(p.subcategory || 'Geral')}`;

export const productService = {
  getProducts(): Product[] {
    return [...getAll()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  getProductById(id: string) { return getAll().find(p => p.id === id); },
  getProductsByCategory(category: string) {
    return getAll().filter(p => p.active && p.category === category).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  /** Reordena dois produtos dentro do mesmo grupo e persiste a sequência inteira. */
  reorder(idA: string, idB: string) {
    const all = getAll();
    const a = all.find(p => p.id === idA);
    const b = all.find(p => p.id === idB);
    if (!a || !b) return;
    const groupKey = normGroup(a);
    const group = all.filter(p => normGroup(p) === groupKey).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const i = group.findIndex(p => p.id === idA);
    const j = group.findIndex(p => p.id === idB);
    if (i < 0 || j < 0) return;
    [group[i], group[j]] = [group[j], group[i]];
    productService.reorderGroup(group.map(p => p.id));
  },

  /** Persiste a ordem sequencial de um subgrupo inteiro. */
  reorderGroup(orderedIds: string[]) {
    const all = getAll();
    const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]));
    const changed: Product[] = [];
    const next = all.map(p => {
      if (!orderById.has(p.id)) return p;
      const updated = { ...p, order: orderById.get(p.id)! };
      changed.push(updated);
      return updated;
    });
    saveAll(next);
    changed.forEach(p => { void upsertRow('products', p); });
  },


  createProduct(data: Omit<Product, 'id'>): Product {
    const all = getAll();
    const groupMax = all
      .filter(p => normGroup(p) === normGroup(data as Product))
      .reduce((max, p) => Math.max(max, p.order ?? 0), 0);
    const product: Product = { ...data, id: crypto.randomUUID(), order: data.order ?? groupMax + 1 };
    all.push(product); saveAll(all);
    void upsertRow('products', product);
    return product;
  },

  updateProduct(id: string, data: Partial<Product>): Product | null {
    const all = getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx < 0) return null;
    all[idx] = { ...all[idx], ...data };
    saveAll(all);
    void upsertRow('products', all[idx]);
    return all[idx];
  },

  deleteProduct(id: string): boolean {
    const all = getAll();
    const filtered = all.filter(p => p.id !== id);
    if (filtered.length === all.length) return false;
    saveAll(filtered);
    void deleteRow('products', id);
    return true;
  },

  /** Renomeia a categoria em todos os produtos da empresa (sincroniza com Empresas). */
  renameCategory(brand: string, oldName: string, newName: string): void {
    const norm = normValue;
    if (norm(oldName) === norm(newName)) return;
    const all = getAll();
    const changed: Product[] = [];
    const next = all.map(p => {
      if (norm(p.brand) === norm(brand) && norm(p.category) === norm(oldName)) {
        const u = { ...p, category: newName }; changed.push(u); return u;
      }
      return p;
    });
    if (!changed.length) return;
    saveAll(next);
    changed.forEach(p => { void upsertRow('products', p); });
  },

  /** Renomeia a subcategoria em todos os produtos da empresa+categoria. */
  renameSubcategory(brand: string, category: string, oldSub: string, newSub: string): void {
    const norm = normValue;
    if (norm(oldSub) === norm(newSub)) return;
    const all = getAll();
    const changed: Product[] = [];
    const next = all.map(p => {
      if (norm(p.brand) === norm(brand) && norm(p.category) === norm(category) && norm(p.subcategory) === norm(oldSub)) {
        const u = { ...p, subcategory: newSub }; changed.push(u); return u;
      }
      return p;
    });
    if (!changed.length) return;
    saveAll(next);
    changed.forEach(p => { void upsertRow('products', p); });
  },

  /**
   * Repara produtos que ficaram presos em uma categoria antiga após renomear em Empresas.
   * Se a categoria do produto não existe mais na empresa, mas sua subcategoria existe em
   * uma única categoria configurada, move o produto para essa categoria e persiste.
   */
  reconcileProductsWithCategories(categories: Category[], brand?: string): number {
    const scopedCategories = categories.filter(c => !brand || normValue(c.brand) === normValue(brand));
    const existingCategories = new Set(scopedCategories.map(c => `${normValue(c.brand)}|${normValue(c.name)}`));
    const subToCategory = new Map<string, Category[]>();

    scopedCategories.forEach(c => {
      (c.subcategories || []).forEach(sub => {
        const key = `${normValue(c.brand)}|${normValue(sub)}`;
        if (!normValue(sub)) return;
        const arr = subToCategory.get(key) || [];
        if (!arr.some(x => x.id === c.id)) arr.push(c);
        subToCategory.set(key, arr);
      });
    });

    const all = getAll();
    const changed: Product[] = [];
    const next = all.map(p => {
      if (brand && normValue(p.brand) !== normValue(brand)) return p;
      if (existingCategories.has(`${normValue(p.brand)}|${normValue(p.category)}`)) return p;
      const candidates = subToCategory.get(`${normValue(p.brand)}|${normValue(p.subcategory)}`) || [];
      if (candidates.length !== 1) return p;
      const updated = { ...p, category: candidates[0].name };
      changed.push(updated);
      return updated;
    });

    if (!changed.length) return 0;
    saveAll(next);
    changed.forEach(p => { void upsertRow('products', p); });
    return changed.length;
  },
};

