import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useCartPersistence, writeSavedCart, type SavedCart } from './use-cart-persistence';
import type { OrderItem } from '@/lib/types';

const item: OrderItem = { productId: 'test', code: 'CSBP0002', name: 'Motobomba', qty: 1, unitPrice: 1476.47, listPrice: 2000, salePrice: 1476.47, totalPrice: 1476.47, discountPct: 0, subtotal: 1476.47, extraDiscountPct: 0, subtotalAfterExtra: 1476.47, ipiRate: 0, ipiValue: 0, stRate: 0, stValue: 0, totalWithTax: 1476.47 };
function useHarness(brand: string) {
  const [cart, setCart] = useState<SavedCart>({ items: [] });
  const persistence = useCartPersistence({ accountId: 'client', brand, editing: false, skipRestore: false, cart, restore: setCart, onError: vi.fn() });
  return { cart, setCart, ...persistence };
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('restores a saved cart before autosave can erase it on login', async () => {
  writeSavedCart('moura_cart_client_Claw Motobombas', { items: [item] });
  const { result } = renderHook(() => useHarness('Claw Motobombas'));
  await waitFor(() => expect(result.current.cart.items).toHaveLength(1));
  expect(JSON.parse(localStorage.getItem('moura_cart_client_Claw Motobombas') ?? '{}').items[0].code).toBe('CSBP0002');
});
it('automatically retains added items when leaving and signing back in', async () => {
  const first = renderHook(() => useHarness('Claw Motobombas'));
  act(() => first.result.current.setCart({ items: [item] }));
  first.unmount();
  const second = renderHook(() => useHarness('Claw Motobombas'));
  await waitFor(() => expect(second.result.current.cart.items[0]?.unitPrice).toBe(1476.47));
});
it('keeps carts private to the account and separate between companies', async () => {
  writeSavedCart('moura_cart_other_Claw Motobombas', { items: [item] });
  const { result, rerender } = renderHook(({ brand }) => useHarness(brand), { initialProps: { brand: 'Claw Motobombas' } });
  expect(result.current.cart.items).toHaveLength(0);
  act(() => result.current.setCart({ items: [item] }));
  rerender({ brand: 'Ilumi' });
  await waitFor(() => expect(result.current.cart.items).toHaveLength(0));
  expect(JSON.parse(localStorage.getItem('moura_cart_client_Claw Motobombas') ?? '{}').items).toHaveLength(1);
});
it('removes embedded images in every saved cart to avoid exhausting storage', () => {
  writeSavedCart('moura_cart_client_Claw Motobombas', { items: [{ ...item, image: 'data:image/png;base64,large' }] });
  expect(JSON.parse(localStorage.getItem('moura_cart_client_Claw Motobombas') ?? '{}').items[0].image).toBeUndefined();
});