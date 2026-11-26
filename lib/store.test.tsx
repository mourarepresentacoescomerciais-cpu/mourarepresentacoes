import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Product } from './types';

const db = vi.hoisted(() => ({ rows: [] as Product[], upsert: vi.fn() }));
vi.mock('./dataStore', () => ({
  upsertRow: db.upsert, deleteRow: vi.fn(), upsertProfile: vi.fn(), deleteProfile: vi.fn(),
  DATA_READY_EVENT: 'test-data', bootstrapDataStore: vi.fn(), bootstrapAdminData: vi.fn(),
  getCachedRows: (key: string) => key === 'moura_products' ? db.rows : [],
  setCachedRows: (key: string, rows: Product[]) => { if (key === 'moura_products') db.rows = rows; },
}));
import { useStore } from './store';
beforeEach(() => {
  db.rows = [{ id: 'a', code: '63670', price: 1466.17, brand: 'Cortag', fixedPrice: false }] as Product[];
  db.upsert.mockReset();
});
it('keeps the saved product unchanged if the database refuses an edit', async () => {
  db.upsert.mockResolvedValue(false);
  const { result } = renderHook(() => useStore());
  await act(async () => { expect(await result.current.updateProduct('a', { fixedPrice: true })).toBe(false); });
  expect(db.rows[0].fixedPrice).toBe(false);
});
it('confirms a fixed-price edit only after the write succeeds', async () => {
  db.upsert.mockResolvedValue(true);
  const { result } = renderHook(() => useStore());
  await act(async () => { expect(await result.current.updateProduct('a', { fixedPrice: true })).toBe(true); });
  expect(db.rows[0].fixedPrice).toBe(true);
});
it('does not report imported prices as saved when the write fails', async () => {
  db.upsert.mockResolvedValue(false);
  const { result } = renderHook(() => useStore());
  await act(async () => { await expect(result.current.importCSV('codigo;preco\n63670;1246,24', 'Cortag')).rejects.toThrow('Importação interrompida'); });
  expect(db.rows[0].price).toBe(1466.17);
});