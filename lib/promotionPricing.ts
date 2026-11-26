import type { Promotion, PromotionTier } from './types';

export function pickTier(promo: Promotion | null, qty: number): PromotionTier | null {
  if (promo?.ruleType !== 'tiered') return null;
  const q = Math.max(1, Math.floor(qty || 1));
  return [...(promo.tiers ?? [])].sort((a, b) => b.minQty - a.minQty).find(t => q >= t.minQty) ?? null;
}

export function promotionApplies(promo: Promotion | null, qty = 1): boolean {
  return !!promo && (promo.ruleType !== 'tiered' || !!pickTier(promo, qty));
}

/** Fixed values are final unit prices; percentages use the imported table price. */
export function applyPromotion(basePrice: number, promo: Promotion | null, qty = 1): number {
  if (!promo) return basePrice;
  const rule = promo.ruleType === 'tiered' ? pickTier(promo, qty) : promo;
  if (!rule) return basePrice;
  const price = rule.discountType === 'fixed'
    ? rule.discountValue
    : basePrice * (1 - rule.discountValue / 100);
  return Math.max(0.01, Number(price.toFixed(2)));
}

/**
 * Discount policy is cumulative for percentage rules: the promotional
 * percentage adds to the client's registered discount (15% client + 5%
 * promotion = 20%). Fixed promotions set the final unit price, ignoring the
 * client discount.
 */
export function resolveSalePrice(basePrice: number, promo: Promotion | null, qty: number, discountPct = 0, fixedPrice = false): number {
  if (fixedPrice) return basePrice;
  const rule = promo?.ruleType === 'tiered' ? pickTier(promo, qty) : promo;
  if (rule && rule.discountType === 'fixed') {
    return applyPromotion(basePrice, promo, qty);
  }
  if (rule) {
    // Cascaded: client discount first, then promotion on the discounted price
    // (25,43 → -15% = 21,62 → -5% = 20,53), matching the commercial table.
    const afterClient = basePrice * (1 - Math.min(100, discountPct || 0) / 100);
    const price = afterClient * (1 - Math.min(100, rule.discountValue) / 100);
    return Math.max(0.01, Number(price.toFixed(2)));
  }
  return Number((basePrice * (1 - discountPct / 100)).toFixed(2));
}