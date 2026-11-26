export const PRODUCT_CATEGORIES = [
  'Energia Solar',
  'EPIs e EPCs',
  'Ferramentas e Máquinas',
  'Fios e Cabos',
  'Fixação e Vedação',
  'Gás e Incêndio',
  'Hidráulicos e Pneumáticos',
  'Iluminação',
  'Motores e Bombas',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export interface ProductVariation {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  stock?: number;
  active: boolean;
}

/** Opção de uma variação (ex.: "220V"). */
export interface ProductVariationOption {
  id: string;
  name: string;
  active: boolean;
  /** Preço específico desta opção (sobrescreve o preço do produto). */
  price?: number;
  /** Código/SKU específico desta opção. */
  sku?: string;
}

/** Grupo de variação visível ao cliente (ex.: "Voltagem" com opções 127V/220V). */
export interface ProductVariationGroup {
  id: string;
  /** Nome exibido ao cliente (ex.: "Voltagem", "Potência"). */
  name: string;
  options: ProductVariationOption[];
}

/**
 * Combinação de opções de MÚLTIPLAS variações (ex.: 220V + 1000W) com preço e
 * código próprios. Quando existirem combinações, o preço/código de uma seleção
 * completa vem da combinação correspondente, e não das opções individuais.
 */
export interface ProductCombination {
  id: string;
  /** Um optionId por grupo de variação (ordem dos grupos). */
  optionIds: string[];
  /** Preço específico desta combinação. */
  price?: number;
  /** Código/SKU específico desta combinação. */
  sku?: string;
  /** Quantidade mínima específica desta combinação. */
  minQty?: number;
  /** Preço fixo: não recebe desconto do cliente nem promoção de desconto. */
  fixedPrice?: boolean;
  active?: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: ProductCategory | string;
  subcategory?: string;
  price: number;
  hasVariations?: boolean;
  /** Rótulo da variação exibido ao cliente (ex.: "Voltagem") — legado (1 grupo). */
  variationLabel?: string;
  /** Variações legadas (1 grupo com preço/SKU por opção). */
  variations?: ProductVariation[];
  /** Múltiplos grupos de variação (ex.: Voltagem + Potência). Modelo atual. */
  variationGroups?: ProductVariationGroup[];
  /** Combinações de opções (preço/código por combinação de variações). */
  combinations?: ProductCombination[];
  minQty: number;
  packQty: number;
  image?: string;
  brand: string;
  isPromo: boolean;
  isNew: boolean;
  active: boolean;
  discountPct?: number;
  /** Preço fixo: não recebe desconto do cliente. */
  fixedPrice?: boolean;
  thickness?: string;
  ipiRate: number;
  stRate: number;
  synonyms: string[];
  keywords: string[];
  isFeatured?: boolean;
  order?: number;
  /** Ordem de apresentação em "Mais Vendidos" (TOP 10) no painel do cliente. */
  featuredOrder?: number;
}

export interface Client {
  id: string;
  cnpj: string;
  email: string;
  password: string;
  companyName: string;
  tradeName: string;
  address: string;
  whatsapp?: string;
  pocket?: string;
  classification: string;
  network: string;
  creditLimit: number;
  discountPct: number;
  brandDiscounts?: Record<string, number>;
  active: boolean;
  allowedBrands?: string[];
}

export interface AccessRequest {
  id: string;
  cnpj: string;
  companyName: string;
  contactName: string;
  whatsapp: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedClientId?: string;
  generatedPassword?: string;
}

export interface Catalog {
  id: string;
  title: string;
  brand: string;
  description?: string;
  coverImage: string;
  pdfUrl: string;
  active: boolean;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  brand: string;
  icon?: string;
  iconUrl?: string;
  subcategories?: string[];
  active: boolean;
  order?: number;
}

export interface LaunchImage {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  brand?: string;
  active: boolean;
  order: number;
}

export interface QuoteRequest {
  id: string;
  cnpj: string;
  companyName: string;
  contactName: string;
  whatsapp: string;
  email: string;
  brand: string;
  items: QuoteRequestItem[];
  status: OrderStatus;
  type: 'orcamento';
  createdAt: string;
}

export interface QuoteRequestItem {
  productId: string;
  code: string;
  name: string;
  image?: string;
  qty: number;
}

export type OrderStatus = 'Rascunho' | 'Recebido' | 'Em análise' | 'Aprovado' | 'Em separação' | 'Faturado' | 'Finalizado' | 'Cancelado';
export const SIMPLIFIED_STATUSES: OrderStatus[] = ['Recebido', 'Em análise', 'Finalizado'];

export interface Lead {
  id: string;
  cnpj: string;
  email: string;
  password: string;
  companyName: string;
  contactName: string;
  whatsapp: string;
  allowedBrands?: string[];
  active: boolean;
  createdAt: string;
}
export type OrderType = 'pedido' | 'orcamento';

export interface OrderItem {
  productId: string;
  variationId?: string;
  variationName?: string;
  /** Variações escolhidas (ex.: [{groupName:'Voltagem',optionName:'220V'}]). */
  selections?: { groupName: string; optionName: string }[];
  /** Assinatura única do combo de variações (para diferenciar itens no carrinho). */
  variationKey?: string;
  code: string;
  name: string;
  image?: string;
  qty: number;
  minQty?: number;
  isPromo?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  unitPrice: number;
  totalPrice: number;
  listPrice: number;
  salePrice: number;
  discountPct: number;
  subtotal: number;
  extraDiscountPct: number;
  subtotalAfterExtra: number;
  ipiRate: number;
  ipiValue: number;
  stRate: number;
  stValue: number;
  totalWithTax: number;
}

export interface OrderTotals {
  totalBruto: number;
  generalDiscountPct: number;
  totalWithDiscount: number;
  totalIPI: number;
  totalST: number;
  totalWithTax: number;
  withinCreditLimit: boolean;
}

export interface PromotionTier {
  /** Quantidade mínima (inclusive) para aplicar esta faixa. */
  minQty: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

export interface Promotion {
  id: string;
  productId: string;
  /** null = aplica ao produto base (sem combinação). */
  combinationId?: string | null;
  /** 'simple' (padrão) usa discountType+discountValue. 'tiered' usa tiers[]. */
  ruleType?: 'simple' | 'tiered';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  /** Faixas progressivas por quantidade (apenas quando ruleType='tiered'). */
  tiers?: PromotionTier[];
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  /** Ordem de apresentação no painel do cliente (menor = primeiro). */
  sortOrder?: number;
  createdAt?: string;
}

/**
 * Normaliza as variações de um produto em grupos (modelo atual), com retro-
 * compatibilidade ao modelo legado (1 grupo: variationLabel + variations[]).
 * Retorna apenas grupos/opções com nome preenchido. Opções inativas são
 * removidas (parâmetro activeOnly).
 */
export function getVariationGroups(p: Product, activeOnly = true): ProductVariationGroup[] {
  const out: ProductVariationGroup[] = [];
  if (Array.isArray(p.variationGroups) && p.variationGroups.length > 0) {
    for (const g of p.variationGroups) {
      const opts = (g.options || []).filter(o => (o.name || '').trim() && (!activeOnly || o.active));
      if ((g.name || '').trim() && opts.length > 0) out.push({ ...g, options: opts });
    }
    if (out.length > 0) return out;
  }
  // Legado: variations[] vira um único grupo.
  if (p.hasVariations && Array.isArray(p.variations) && p.variations.length > 0) {
    const opts = p.variations
      .filter(v => (v.name || '').trim() && (!activeOnly || v.active))
      .map(v => ({ id: v.id, name: v.name, active: v.active }));
    if (opts.length > 0) {
      out.push({ id: 'legacy', name: (p.variationLabel || 'Variação').trim(), options: opts });
    }
  }
  return out;
}

/** Preço efetivo de uma opção: usa o preço da opção se preenchido (> 0), senão o preço do produto. */
export function resolveOptionPrice(product: Product, optionId: string): number {
  const legacy = (product.variations || []).find(v => v.id === optionId);
  if (legacy?.price != null && legacy.price > 0) return legacy.price;
  for (const g of (product.variationGroups || [])) {
    const o = (g.options || []).find(opt => opt.id === optionId);
    if (o?.price != null && o.price > 0) return o.price;
  }
  return product.price ?? 0;
}

/** Código/SKU efetivo de uma opção: usa o da opção se preenchido, senão o código do produto. */
export function resolveOptionSku(product: Product, optionId: string): string {
  const legacy = (product.variations || []).find(v => v.id === optionId);
  if (legacy?.sku?.trim()) return legacy.sku.trim();
  for (const g of (product.variationGroups || [])) {
    const o = (g.options || []).find(opt => opt.id === optionId);
    if (o?.sku?.trim()) return o.sku.trim();
  }
  return product.code || '';
}

/** Indica se a opção possui preço próprio (diferente do produto principal). */
export function optionHasOwnPrice(product: Product, optionId: string): boolean {
  const legacy = (product.variations || []).find(v => v.id === optionId);
  if (legacy?.price != null && legacy.price > 0) return true;
  for (const g of (product.variationGroups || [])) {
    const o = (g.options || []).find(opt => opt.id === optionId);
    if (o?.price != null && o.price > 0) return true;
  }
  return false;
}

/** Indica se a opção possui código/SKU próprio. */
export function optionHasOwnSku(product: Product, optionId: string): boolean {
  const legacy = (product.variations || []).find(v => v.id === optionId);
  if (legacy?.sku?.trim()) return true;
  for (const g of (product.variationGroups || [])) {
    const o = (g.options || []).find(opt => opt.id === optionId);
    if (o?.sku?.trim()) return true;
  }
  return false;
}

/** Indica se o produto exige escolha de variação(ões) antes de adicionar ao carrinho. */
export function productRequiresVariation(p: Product): boolean {
  return getVariationGroups(p).length > 0;
}

/** Chave canônica (independente da ordem) de um conjunto de optionIds. */
export function combinationKey(optionIds: string[]): string {
  return [...optionIds].filter(Boolean).sort().join('|');
}

/** Encontra a combinação ativa correspondente à seleção de opções, se houver. */
export function findCombination(product: Product, optionIds: string[]): ProductCombination | undefined {
  const key = combinationKey(optionIds);
  if (!key) return undefined;
  return (product.combinations || []).find(
    c => (c.active ?? true) && combinationKey(c.optionIds) === key
  );
}

/**
 * Preço efetivo de uma seleção de variações.
 * Fonte de verdade: a COMBINAÇÃO correspondente (qualquer nº de variações,
 * inclusive uma só). Fallbacks (compatibilidade): preço da opção e preço do produto.
 */
export function resolvePriceForSelection(product: Product, optionIds: string[]): number {
  if (optionIds.length >= 1) {
    const combo = findCombination(product, optionIds);
    if (combo?.price != null && combo.price > 0) return combo.price;
    if (optionIds.length === 1) {
      const op = resolveOptionPrice(product, optionIds[0]);
      if (op > 0) return op;
    }
  }
  return product.price ?? 0;
}

/** Código/SKU efetivo de uma seleção de variações (combinação > opção > produto). */
export function resolveSkuForSelection(product: Product, optionIds: string[]): string {
  if (optionIds.length >= 1) {
    const combo = findCombination(product, optionIds);
    if (combo?.sku?.trim()) return combo.sku.trim();
    if (optionIds.length === 1) {
      const os = resolveOptionSku(product, optionIds[0]);
      if (os && os !== product.code) return os;
    }
  }
  return product.code || '';
}

/** Quantidade mínima efetiva de uma seleção (combinação > produto). */
export function resolveMinQtyForSelection(product: Product, optionIds: string[]): number {
  if (optionIds.length >= 1) {
    const combo = findCombination(product, optionIds);
    if (combo?.minQty != null && combo.minQty > 0) return combo.minQty;
  }
  return product.minQty && product.minQty > 0 ? product.minQty : 1;
}


/**
 * Gera todas as combinações (produto cartesiano) das opções de cada grupo.
 * Preserva preço/código de combinações já existentes (casadas pela chave).
 * Considera apenas grupos com nome e opções com nome.
 */
export function buildCombinations(
  groups: ProductVariationGroup[],
  existing: ProductCombination[] = [],
): ProductCombination[] {
  const valid = groups
    .filter(g => (g.name || '').trim())
    .map(g => ({ ...g, options: (g.options || []).filter(o => (o.name || '').trim()) }))
    .filter(g => g.options.length > 0);
  if (valid.length < 1) return [];
  let combos: string[][] = [[]];
  for (const g of valid) {
    const next: string[][] = [];
    for (const prefix of combos) {
      for (const opt of g.options) next.push([...prefix, opt.id]);
    }
    combos = next;
  }
  const prevByKey = new Map(existing.map(c => [combinationKey(c.optionIds), c] as const));
  return combos.map(optionIds => {
    const prev = prevByKey.get(combinationKey(optionIds));
    return {
      id: prev?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
      optionIds,
      price: prev?.price,
      sku: prev?.sku,
      minQty: prev?.minQty,
      active: prev?.active ?? true,
    };
  });
}

