import { describe, expect, it } from 'vitest';
import { applyPromotion, resolveSalePrice } from './promotionPricing';
import type { Promotion } from './types';

const promo: Promotion = { id: 'test', productId: 'CSBP0002', active: true, ruleType: 'simple', discountType: 'fixed', discountValue: 1476.47 };

describe('promotion pricing', () => {
  it('never discounts a fixed-price product, including with an active promotion', () => {
    expect(resolveSalePrice(1246.24, null, 1, 10, true)).toBe(1246.24);
    expect(resolveSalePrice(1246.24, { ...promo, discountType: 'percent', discountValue: 20 }, 1, 10, true)).toBe(1246.24);
  });
  it('uses the entered R$ 1.476,47 as the final fixed promotional price', () => {
    expect(applyPromotion(2000, promo)).toBe(1476.47);
    expect(resolveSalePrice(2000, promo, 1, 10)).toBe(1476.47);
  });
  it('applies the promotional percent over the client-discounted price', () => {
    expect(resolveSalePrice(100, { ...promo, discountType: 'percent', discountValue: 5 }, 1, 15)).toBe(80.75);
    expect(resolveSalePrice(100, { ...promo, discountType: 'percent', discountValue: 20 }, 1, 10)).toBe(72);
  });
  it('retains the client discount where no promotional quantity tier applies', () => {
    const tiered: Promotion = { ...promo, ruleType: 'tiered', tiers: [{ minQty: 10, discountType: 'percent', discountValue: 20 }] };
    expect(resolveSalePrice(100, tiered, 9, 10)).toBe(90);
    expect(resolveSalePrice(100, tiered, 10, 10)).toBe(72);
  });
  it('matches the commercial table for disco 60863 (25,43 with client 15%)', () => {
    const tiered: Promotion = { ...promo, ruleType: 'tiered', tiers: [
      { minQty: 50, discountType: 'percent', discountValue: 5 },
      { minQty: 70, discountType: 'percent', discountValue: 10 },
      { minQty: 80, discountType: 'percent', discountValue: 15 }] };
    expect(resolveSalePrice(25.43, tiered, 10, 15)).toBe(21.62);
    expect(resolveSalePrice(25.43, tiered, 50, 15)).toBe(20.53);
    expect(resolveSalePrice(25.43, tiered, 70, 15)).toBe(19.45);
    expect(resolveSalePrice(25.43, tiered, 80, 15)).toBe(18.37);
  });
});
