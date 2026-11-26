import { useEffect, useState } from 'react';
import type { OrderItem } from '@/lib/types';

export interface SavedCart {
  items: OrderItem[];
  orderType?: string | null;
  observations?: string;
  purchaseOrder?: string;
  invoiceNote?: string;
  buyer?: string;
  paymentMethod?: string;
  paymentTerm?: string;
  savedAt?: string;
}

/** Never persist embedded product images: they can exhaust browser storage. */
export function writeSavedCart(key: string, cart: SavedCart) {
  if (!cart.items.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify({
    ...cart,
    items: cart.items.map(({ image, ...item }) => item),
    savedAt: new Date().toISOString(),
  }));
}

export function useCartPersistence({ accountId, brand, editing, skipRestore, cart, restore, onError }: {
  accountId?: string;
  brand: string;
  editing: boolean;
  skipRestore: boolean;
  cart: SavedCart;
  restore: (cart: SavedCart) => void;
  onError: () => void;
}) {
  const key = accountId && brand ? `moura_cart_${accountId}_${brand}` : null;
  const [readyKey, setReadyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key || editing) { setReadyKey(null); return; }
    if (!skipRestore) {
      try {
        const raw = localStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) : null;
        restore(saved && Array.isArray(saved.items) ? saved : { items: [] });
      } catch { onError(); }
    }
    // A separate render must finish restoring before an empty initial cart can be saved.
    setReadyKey(key);
    // Callbacks capture the current brand; changing their identity must not restore over edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, editing, skipRestore]);

  useEffect(() => {
    if (!key || readyKey !== key || editing) return;
    try { writeSavedCart(key, cart); } catch { onError(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readyKey, editing, cart.items, cart.orderType, cart.observations, cart.purchaseOrder, cart.invoiceNote, cart.buyer, cart.paymentMethod, cart.paymentTerm]);

  return { ready: !!key && readyKey === key, suspendSaving: () => setReadyKey(null) };
}