import { describe, expect, it } from 'vitest';
import { resolvePurchaseHistory } from './purchaseHistory';
import type { Order } from './orders';
import type { Product } from './types';

const products = [
  { id: 'a', name: 'Original', active: true, brand: 'Cortag' },
  { id: 'b', name: 'Substituto', active: true, brand: 'Cortag' },
  { id: 'c', name: 'Outra empresa', active: true, brand: 'Ilumi' },
] as Product[];
const orders = [{ id: 'order', createdAt: '2026-10-28', items: [{ productId: 'a', qty: 2 }] }] as Order[];

describe('purchase history edits', () => {
  it('removes the product from the history without deleting submitted items', () => {
    expect(resolvePurchaseHistory(orders, products, [{ original_product_id: 'a', hidden: true, replacement_product_id: null }])).toEqual([]);
    expect(orders[0].items[0].productId).toBe('a');
    expect(orders[0].items[0].qty).toBe(2);
  });
  it('replaces the displayed product without changing the submitted order', () => {
    const rows = resolvePurchaseHistory(orders, products, [{ original_product_id: 'a', hidden: false, replacement_product_id: 'b' }]);
    expect(rows.map(row => row.product.id)).toEqual(['b']);
    expect(rows[0].originalId).toBe('a');
    expect(orders[0].items[0].productId).toBe('a');
  });
  it('keeps history filtered by company', () => {
    expect(resolvePurchaseHistory(orders, products, [], 'Ilumi')).toEqual([]);
    expect(resolvePurchaseHistory(orders, products, [], 'Cortag').map(row => row.product.id)).toEqual(['a']);
  });
});