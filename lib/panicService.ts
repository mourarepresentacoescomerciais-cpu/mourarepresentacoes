import { setPanicBrand, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';

const KEY = STORAGE_KEYS.panic;

function getAll(): string[] {
  return getCachedRows<string>(KEY) ?? [];
}
function saveAll(items: string[]) { setCachedRows(KEY, items); }

export const panicService = {
  getAll(): string[] { return [...getAll()]; },
  isBlocked(brand: string): boolean { return getAll().some(b => b.toLowerCase() === brand.toLowerCase()); },

  toggle(brand: string): boolean {
    const cur = getAll();
    const idx = cur.findIndex(b => b.toLowerCase() === brand.toLowerCase());
    if (idx >= 0) { cur.splice(idx, 1); saveAll(cur); void setPanicBrand(brand, false); return false; }
    cur.push(brand); saveAll(cur); void setPanicBrand(brand, true); return true;
  },
};
