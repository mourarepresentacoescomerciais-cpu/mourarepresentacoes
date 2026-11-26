import { useState, useCallback, useEffect } from 'react';
import type { Product, Client } from './types';
import { parsePriceRows } from './priceImport';
import { upsertRow, deleteRow, upsertProfile, deleteProfile, DATA_READY_EVENT, bootstrapDataStore, bootstrapAdminData, getCachedRows, setCachedRows } from './dataStore';

// Fonte única: Supabase (cache em memória hidratado no boot). Sem mock/seed.
function getItem<T>(key: string): T[] {
  return getCachedRows<T>(key) ?? [];
}

function setItem<T>(key: string, data: T[]) {
  setCachedRows(key, data);
}

export function useStore() {
  const [products, setProducts] = useState<Product[]>(() => getItem('moura_products'));
  const [clients, setClients] = useState<Client[]>(() => getItem('moura_clients'));

  const saveProducts = useCallback((p: Product[]) => { setProducts(p); setItem('moura_products', p); }, []);
  const saveClients = useCallback((c: Client[]) => { setClients(c); setItem('moura_clients', c); }, []);

  const refreshLocal = useCallback(() => {
    setProducts(getItem('moura_products'));
    setClients(getItem('moura_clients'));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      const rows = (e as CustomEvent).detail?.rows;
      if (scope === 'products' && Array.isArray(rows)) { setProducts(rows); return; }
      if (scope === 'clients' && Array.isArray(rows)) { setClients(rows); return; }
      if (scope === 'products' || scope === 'clients' || scope === 'all') refreshLocal();
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, [refreshLocal]);

  const addProduct = useCallback(async (product: Product) => {
    const cur = getItem<Product>('moura_products');
    const norm = (v?: string) => (v || '').trim().toLowerCase();
    const clean = { ...product, subcategory: (product.subcategory || '').trim() };
    // Evita erro de chave duplicada (products_code_key): se já existe produto com
    // o mesmo código na mesma empresa, ATUALIZA em vez de inserir um novo.
    const existing = norm(clean.code)
      ? cur.find(p => norm(p.code) === norm(clean.code) && norm(p.brand) === norm(clean.brand))
      : undefined;
    if (existing) {
      const merged = { ...existing, ...clean, id: existing.id, order: existing.order };
      if (!await upsertRow('products', merged)) return false;
      saveProducts(getItem<Product>('moura_products').map(p => p.id === existing.id ? merged : p));
      return true;
    }
    const groupMax = cur
      .filter(p => norm(p.brand) === norm(clean.brand) && norm(p.category) === norm(clean.category) && norm(p.subcategory || 'Geral') === norm(clean.subcategory || 'Geral'))
      .reduce((max, p) => Math.max(max, p.order ?? 0), 0);
    const nextProduct = { ...clean, order: clean.order ?? groupMax + 1 };
    if (!await upsertRow('products', nextProduct)) return false;
    saveProducts([...getItem<Product>('moura_products'), nextProduct]);
    return true;
  }, [saveProducts]);

  const updateProduct = useCallback(async (id: string, data: Partial<Product>) => {
    const cur = getItem<Product>('moura_products');
    const next = cur.map(p => p.id === id ? { ...p, ...data } : p);
    const updated = next.find(p => p.id === id);
    if (!updated || !await upsertRow('products', updated)) return false;
    saveProducts(getItem<Product>('moura_products').map(p => p.id === id ? updated : p));
    return true;
  }, [saveProducts]);

  const deleteProduct = useCallback((id: string) => {
    const cur = getItem<Product>('moura_products');
    saveProducts(cur.filter(p => p.id !== id));
    void deleteRow('products', id);
  }, [saveProducts]);

  const addClient = useCallback((client: Client) => {
    const cur = getItem<Client>('moura_clients');
    saveClients([...cur, client]);
    void upsertProfile({ ...client, role: 'client' } as any);
  }, [saveClients]);

  const updateClient = useCallback((id: string, data: Partial<Client>) => {
    const cur = getItem<Client>('moura_clients');
    const next = cur.map(c => c.id === id ? { ...c, ...data } : c);
    saveClients(next);
    const updated = next.find(c => c.id === id);
    if (updated) void upsertProfile({ ...updated, role: 'client' } as any);
  }, [saveClients]);

  const deleteClient = useCallback((id: string) => {
    const cur = getItem<Client>('moura_clients');
    saveClients(cur.filter(c => c.id !== id));
    void deleteProfile(id);
  }, [saveClients]);

  const importCSV = useCallback(async (csvText: string, brand?: string) => {
    const rows = parsePriceRows(csvText);
    // IMPORTANTE: a importação CSV é EXCLUSIVAMENTE para atualizar PREÇO de
    // produtos JÁ cadastrados. Nunca cria novos produtos nem altera a ordem de
    // cadastro (atualiza no lugar, preservando o índice original).
    const existing = getItem<Product>('moura_products').map(p => ({ ...p, combinations: p.combinations?.map(c => ({ ...c })) }));
    let count = 0;
    const changed = new Set<Product>();
    const inBrand = (p: Product) => !brand || p.brand.toLowerCase() === brand.toLowerCase();

    for (const { code, price } of rows) {
      let matched = false;

      // 1) Produto principal (por código).
      const idx = brand
        ? existing.findIndex(p => p.code === code && p.brand.toLowerCase() === brand.toLowerCase())
        : existing.findIndex(p => p.code === code);
      if (idx >= 0) {
        existing[idx].price = price;
        changed.add(existing[idx]);
        matched = true;
      }

      // 2) Combinações (por SKU/código da combinação) — atualiza o preço da
      // combinação onde o código bate, mantendo o restante intacto.
      for (const p of existing) {
        if (!inBrand(p)) continue;
        let comboChanged = false;
        for (const c of (p.combinations || [])) {
          if ((c.sku || '').trim() === code) { c.price = price; comboChanged = true; }
        }
        if (comboChanged) { changed.add(p); matched = true; }
      }

      if (matched) count++;
    }

    for (const p of changed) {
      if (!await upsertRow('products', p)) throw new Error('Importação interrompida: não foi possível salvar todos os preços. Os preços confirmados foram mantidos.');
      saveProducts(getItem<Product>('moura_products').map(current => current.id === p.id ? p : current));
    }
    return count;
  }, [saveProducts]);

  return {
    products, clients,
    addProduct, updateProduct, deleteProduct,
    addClient, updateClient, deleteClient, importCSV,
    refresh: () => { refreshLocal(); },
  };
}
