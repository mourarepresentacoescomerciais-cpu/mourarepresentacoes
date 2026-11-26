/**
 * Serviço de Promoções.
 * Persistência EXCLUSIVA no Supabase (tabela product_promotions).
 * Cache em memória via dataStore (chave STORAGE_KEYS.promotions).
 * Escritas via sec_mutate (admin). Leitura pública via `select`.
 */
import { supabase } from './supabase';
import { secMutate } from './secureDb';
import type { Product, ProductCombination, Promotion, PromotionTier } from './types';
import { combinationKey, resolvePriceForSelection, findCombination } from './types';
import { STORAGE_KEYS, getCachedRows, setCachedRows, DATA_READY_EVENT } from './dataStore';
import { applyPromotion } from './promotionPricing';
export { applyPromotion, pickTier } from './promotionPricing';

const KEY = STORAGE_KEYS.promotions;

function all(): Promotion[] { return getCachedRows<Promotion>(KEY) ?? []; }
function saveAll(list: Promotion[]) {
  setCachedRows(KEY, list);
  try { window.dispatchEvent(new CustomEvent(DATA_READY_EVENT, { detail: { scope: 'promotions', rows: list } })); } catch {}
}

function toDB(p: Promotion) {
  return {
    id: p.id,
    product_id: p.productId,
    combination_id: p.combinationId ?? null,
    rule_type: p.ruleType ?? 'simple',
    discount_type: p.discountType,
    discount_value: p.discountValue,
    tiers: p.tiers ?? null,
    sort_order: p.sortOrder ?? 0,
    starts_at: p.startsAt || null,
    ends_at: p.endsAt || null,
    active: p.active,
  };
}
function fromDB(r: any): Promotion {
  return {
    id: r.id,
    productId: r.product_id,
    combinationId: r.combination_id ?? null,
    ruleType: (r.rule_type === 'tiered' ? 'tiered' : 'simple'),
    discountType: r.discount_type,
    discountValue: Number(r.discount_value) || 0,
    tiers: Array.isArray(r.tiers) ? r.tiers.map((t: any) => ({
      minQty: Number(t.minQty) || 1,
      discountType: t.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: Number(t.discountValue) || 0,
    })) : undefined,
    sortOrder: Number(r.sort_order) || 0,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

export async function hydratePromotions(): Promise<void> {
  const { data, error } = await supabase.from('product_promotions').select('*');
  if (error) { console.warn('[hydrate product_promotions]', error.message); return; }
  saveAll((data || []).map(fromDB));
}

function isWithinWindow(p: Promotion, now = Date.now()): boolean {
  if (!p.active) return false;
  if (p.startsAt && now < Date.parse(p.startsAt)) return false;
  if (p.endsAt && now > Date.parse(p.endsAt)) return false;
  return true;
}

/** Encontra a promoção ativa aplicável a uma seleção (combinação > base). */
export function findActivePromotion(
  productId: string,
  combinationId?: string | null,
): Promotion | null {
  const list = all().filter(p => p.productId === productId && isWithinWindow(p));
  if (!list.length) return null;
  if (combinationId) {
    const spec = list.find(p => p.combinationId === combinationId);
    if (spec) return spec;
  }
  return list.find(p => !p.combinationId) || null;
}

/**
 * Resolve preço promocional para uma seleção de opções de um produto.
 * promoPrice é o preço apenas da promoção; o preço final do cliente soma
 * o desconto cadastrado (ver resolveSalePrice em promotionPricing).
 */
export function resolvePromoForSelection(
  product: Product,
  optionIds: string[],
  qty: number = 1,
): { basePrice: number; promoPrice: number; hasPromo: boolean; promo: Promotion | null } {
  const basePrice = resolvePriceForSelection(product, optionIds);
  const combo = optionIds.length ? findCombination(product, optionIds) : null;
  const promo = findActivePromotion(product.id, combo?.id ?? null);
  const promoPrice = applyPromotion(basePrice, promo, qty);
  return { basePrice, promoPrice, hasPromo: !!promo && promoPrice < basePrice, promo };
}

/** Existe alguma promoção ativa para o produto (independente da seleção)? */
export function productHasAnyPromotion(productId: string): boolean {
  return all().some(p => p.productId === productId && isWithinWindow(p));
}

/** Menor preço promocional do produto considerando todas as combinações/base. */
export function minPromoPriceForProduct(product: Product): { basePrice: number; promoPrice: number; hasPromo: boolean } {
  const combos = product.combinations || [];
  const candidates: { base: number; promo: number; hit: boolean }[] = [];
  const baseP = resolvePriceForSelection(product, []);
  const baseHit = findActivePromotion(product.id, null);
  candidates.push({ base: baseP, promo: applyPromotion(baseP, baseHit), hit: !!baseHit });
  for (const c of combos) {
    const bp = c.price ?? product.price ?? 0;
    if (bp <= 0) continue;
    const hit = findActivePromotion(product.id, c.id);
    candidates.push({ base: bp, promo: applyPromotion(bp, hit), hit: !!hit });
  }
  const active = candidates.filter(x => x.hit);
  if (!active.length) return { basePrice: baseP, promoPrice: baseP, hasPromo: false };
  const min = active.reduce((a, b) => (a.promo < b.promo ? a : b));
  return { basePrice: min.base, promoPrice: min.promo, hasPromo: true };
}

function newId(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random());
}

export interface PromotionInput {
  productId: string;
  combinationId?: string | null;
  ruleType?: 'simple' | 'tiered';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  tiers?: PromotionTier[];
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
}

function validateTiers(tiers: PromotionTier[] | undefined): string | null {
  if (!tiers || !tiers.length) return 'Adicione ao menos uma faixa de quantidade.';
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const seen = new Set<number>();
  for (const t of sorted) {
    if (!Number.isFinite(t.minQty) || t.minQty < 1) return 'A quantidade mínima de cada faixa deve ser ≥ 1.';
    if (seen.has(t.minQty)) return `Faixa duplicada para quantidade ${t.minQty}.`;
    seen.add(t.minQty);
    if (!(t.discountValue > 0)) return 'O desconto de cada faixa deve ser maior que zero.';
    if (t.discountType === 'percent' && t.discountValue >= 100) return 'Desconto percentual deve ser menor que 100%.';
  }
  return null;
}

function validate(input: PromotionInput, product: Product): string | null {
  if (!product) return 'Produto não encontrado.';
  if (input.ruleType === 'tiered') {
    const err = validateTiers(input.tiers);
    if (err) return err;
  } else {
    if (!(input.discountValue > 0)) return 'O desconto deve ser maior que zero.';
    if (input.discountType === 'percent' && input.discountValue >= 100) return 'Desconto percentual deve ser menor que 100%.';
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) < Date.parse(input.startsAt)) {
    return 'Data final não pode ser anterior à data inicial.';
  }
  if (input.combinationId) {
    const combos: ProductCombination[] = product.combinations || [];
    if (!combos.some(c => c.id === input.combinationId)) {
      return 'A combinação selecionada não pertence ao produto.';
    }
  }
  return null;
}

export const promotionService = {
  getAll(): Promotion[] {
    return [...all()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },

  /** Persiste a ordem de apresentação (índice na lista informada). */
  async reorder(orderedIds: string[]): Promise<{ error: string | null }> {
    const prev = all();
    const pos = new Map(orderedIds.map((id, i) => [id, i + 1]));
    const next = prev.map(p => (pos.has(p.id) ? { ...p, sortOrder: pos.get(p.id)! } : p));
    saveAll(next);
    for (const p of next.filter(x => pos.has(x.id))) {
      const { error } = await secMutate('product_promotions', 'upsert', toDB(p));
      if (error) { saveAll(prev); return { error: error.message }; }
    }
    return { error: null };
  },
  getByProduct(productId: string): Promotion[] {
    return all().filter(p => p.productId === productId);
  },
  findActive: findActivePromotion,
  resolveForSelection: resolvePromoForSelection,
  hydrate: hydratePromotions,

  async create(input: PromotionInput, product: Product): Promise<{ error: string | null; promotion?: Promotion }> {
    const err = validate(input, product);
    if (err) return { error: err };
    // Impede duplicata (mesmo produto+combinação) — checagem local (UX rápido).
    const dup = all().some(p =>
      p.productId === input.productId &&
      (p.combinationId ?? null) === (input.combinationId ?? null)
    );
    if (dup) return { error: 'Já existe uma promoção para este alvo. Edite a existente.' };
    const promo: Promotion = {
      id: newId(),
      productId: input.productId,
      combinationId: input.combinationId ?? null,
      ruleType: input.ruleType ?? 'simple',
      discountType: input.discountType,
      discountValue: input.discountValue,
      tiers: input.ruleType === 'tiered' ? (input.tiers ?? []) : undefined,
      startsAt: input.startsAt || null,
      endsAt: input.endsAt || null,
      active: input.active ?? true,
      sortOrder: all().reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1,
    };
    saveAll([...all(), promo]);
    const { error } = await secMutate('product_promotions', 'upsert', toDB(promo));
    if (error) {
      // rollback local
      saveAll(all().filter(p => p.id !== promo.id));
      return { error: error.message };
    }
    return { error: null, promotion: promo };
  },

  async update(id: string, patch: Partial<PromotionInput>, product: Product): Promise<{ error: string | null }> {
    const cur = all().find(p => p.id === id);
    if (!cur) return { error: 'Promoção não encontrada.' };
    const merged: PromotionInput = {
      productId: cur.productId,
      combinationId: patch.combinationId !== undefined ? patch.combinationId : cur.combinationId,
      ruleType: patch.ruleType ?? cur.ruleType ?? 'simple',
      discountType: patch.discountType ?? cur.discountType,
      discountValue: patch.discountValue ?? cur.discountValue,
      tiers: patch.tiers !== undefined ? patch.tiers : cur.tiers,
      startsAt: patch.startsAt !== undefined ? patch.startsAt : cur.startsAt,
      endsAt: patch.endsAt !== undefined ? patch.endsAt : cur.endsAt,
      active: patch.active ?? cur.active,
    };
    const err = validate(merged, product);
    if (err) return { error: err };
    const next: Promotion = {
      ...cur,
      ...merged,
      tiers: merged.ruleType === 'tiered' ? (merged.tiers ?? []) : undefined,
    };
    saveAll(all().map(p => (p.id === id ? next : p)));
    const { error } = await secMutate('product_promotions', 'upsert', toDB(next));
    if (error) { saveAll(all().map(p => (p.id === id ? cur : p))); return { error: error.message }; }
    return { error: null };
  },

  async setActive(id: string, active: boolean): Promise<{ error: string | null }> {
    const cur = all().find(p => p.id === id);
    if (!cur) return { error: 'Promoção não encontrada.' };
    const next: Promotion = { ...cur, active };
    saveAll(all().map(p => (p.id === id ? next : p)));
    const { error } = await secMutate('product_promotions', 'upsert', toDB(next));
    if (error) { saveAll(all().map(p => (p.id === id ? cur : p))); return { error: error.message }; }
    return { error: null };
  },

  async remove(id: string): Promise<{ error: string | null }> {
    const prev = all();
    saveAll(prev.filter(p => p.id !== id));
    const { error } = await secMutate('product_promotions', 'delete', {}, { id });
    if (error) { saveAll(prev); return { error: error.message }; }
    return { error: null };
  },
};
