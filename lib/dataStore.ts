/**
 * Camada de dados: cache em memória <-> Supabase.
 * - Persistência EXCLUSIVA no Supabase (produtos, categorias, pedidos, orçamentos,
 *   catálogos, lançamentos, perfis, etc.). NADA de dados de negócio em localStorage.
 * - Boot: hidrata o cache em memória a partir do Supabase (read-through).
 * - Escritas: cada service atualiza o cache em memória (UI imediata, síncrona) e
 *   replica no Supabase (write-through).
 * - localStorage fica reservado a token de autenticação, preferências e sessão.
 */
import { supabase } from './supabase';
import { toast } from 'sonner';
import type { Product, Client, Category, Catalog, LaunchImage, Lead, AccessRequest, QuoteRequest } from './types';
import type { Order } from './orders';
import {
  secMutate, adminSelect, adminListProfiles, adminOrders, adminQuotes,
  clientOrders, placeOrder, publicSubmit, getSessionRole, updateOrderRPC,
} from './secureDb';

export const SYSTEM_ERROR_EVENT = 'moura-system-error';
export interface SystemErrorInfo { op: string; table: string; msg: string; ts: number; }
let lastSystemError: SystemErrorInfo | null = null;
export function getLastSystemError(): SystemErrorInfo | null { return lastSystemError; }
export function clearSystemError() {
  lastSystemError = null;
  try { window.dispatchEvent(new CustomEvent(SYSTEM_ERROR_EVENT, { detail: null })); } catch {}
}

function notifyDbError(op: string, table: string, msg: string) {
  console.error(`[supabase ${op} ${table}]`, msg);
  lastSystemError = { op, table, msg, ts: Date.now() };
  try { window.dispatchEvent(new CustomEvent(SYSTEM_ERROR_EVENT, { detail: lastSystemError })); } catch {}
  try {
    toast.error(`Falha ao ${op === 'upsert' ? 'salvar' : op === 'delete' ? 'excluir' : op} em "${table}"`, {
      description: msg.includes('row-level security')
        ? 'Sem permissão (RLS). Verifique se o seu perfil é admin no Supabase (rode supabase/SETUP.sql).'
        : msg,
      duration: 8000,
    });
  } catch {}
}

const sameStringSet = (a: unknown, b: unknown) => {
  const aa = Array.isArray(a) ? a.map(String).sort() : [];
  const bb = Array.isArray(b) ? b.map(String).sort() : [];
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
};

export const STORAGE_KEYS = {
  products: 'moura_products',
  clients: 'moura_clients',
  categories: 'moura_categories',
  companies: 'moura_companies',
  catalogs: 'moura_catalogs',
  launches: 'moura_launches',
  leads: 'moura_leads',
  panic: 'moura_panic_brands',
  access: 'moura_access_requests',
  contacts: 'moura_contacts',
  pwRecovery: 'moura_password_recoveries',
  orders: 'moura_orders',
  quotes: 'moura_quote_requests',
  brandRules: 'moura_brand_rules_v1',
  promotions: 'moura_promotions_v1',
  visits: 'moura_visits_v1',
  migrated: 'moura_migrated_v1',
  bootstrapped: 'moura_bootstrap_v1',
} as const;

// Cache em memória — única fonte síncrona dos dados de negócio.
// A persistência (fonte da verdade) é EXCLUSIVAMENTE no Supabase.
const memoryCache = new Map<string, unknown>();

// Cache de exibição rápida (stale-while-revalidate): apenas dados PÚBLICOS da
// vitrine são espelhados no localStorage para que a tela apareça instantaneamente
// no refresh, enquanto o Supabase revalida em segundo plano. NUNCA é fonte
// principal — o Supabase sempre sobrescreve assim que carrega.
const FAST_CACHE_PREFIX = 'moura_fastcache_';
const FAST_CACHE_KEYS = new Set<string>([
  STORAGE_KEYS.products,
  STORAGE_KEYS.categories,
  STORAGE_KEYS.catalogs,
  STORAGE_KEYS.launches,
  STORAGE_KEYS.promotions,
  STORAGE_KEYS.companies,
  STORAGE_KEYS.panic,
]);

const CATEGORY_ICON_CACHE_KEY = 'moura_category_icon_urls_v1';
const normCacheKey = (v?: string | null) => (v || '').trim().toLowerCase();
const categoryIconNameKey = (brand?: string | null, name?: string | null) => `${normCacheKey(brand)}::${normCacheKey(name)}`;

function readCategoryIconCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CATEGORY_ICON_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function writeCategoryIconCache(cache: Record<string, string>) {
  try { localStorage.setItem(CATEGORY_ICON_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function isImageValue(v?: string | null): v is string {
  const s = (v || '').trim();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/') || s.startsWith('blob:');
}

function isPersistentImageUrl(v?: string | null): v is string {
  const s = (v || '').trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

function stripHeavyCategoryIcons<T>(rows: T[]): T[] {
  return rows.map((row: any) => {
    if (!row?.iconUrl || !String(row.iconUrl).startsWith('data:')) return row;
    const { iconUrl, ...rest } = row;
    return rest;
  }) as T[];
}

function preloadCategoryIcons() {
  if (typeof window === 'undefined') return;
  try {
    // Só pré-carrega URLs persistentes (Storage). Imagens legadas em base64 são
    // pesadas (~300KB cada) e decodificá-las todas de uma vez no boot inflava a
    // memória e travava a aba (aviso "guia deixando o navegador mais lento").
    // Base64 continua renderizando normalmente quando exibido no DOM.
    const urls = new Set(Object.values(readCategoryIconCache()).filter(isPersistentImageUrl));
    const cats = memoryCache.get(STORAGE_KEYS.categories);
    if (Array.isArray(cats)) (cats as Category[]).forEach(c => { if (isPersistentImageUrl(c.iconUrl)) urls.add(c.iconUrl); });
    urls.forEach(u => { const img = new Image(); img.decoding = 'async'; img.src = u; });
  } catch {}
}

function rememberCategoryIcons(rows: Partial<Category>[]) {
  const cache = readCategoryIconCache();
  let changed = false;
  for (const c of rows) {
    if (!isPersistentImageUrl(c?.iconUrl)) continue;
    if (c.id && cache[c.id] !== c.iconUrl) { cache[c.id] = c.iconUrl; changed = true; }
    const nameKey = categoryIconNameKey(c.brand, c.name);
    if (nameKey !== '::' && cache[nameKey] !== c.iconUrl) { cache[nameKey] = c.iconUrl; changed = true; }
  }
  if (changed) writeCategoryIconCache(cache);
}

function mergeKnownCategoryIcons<T>(rows: T[]): T[] {
  const current = memoryCache.get(STORAGE_KEYS.categories);
  const known = readCategoryIconCache();
  if (Array.isArray(current)) {
    for (const c of current as Category[]) {
      if (!c.iconUrl) continue;
      known[c.id] = c.iconUrl;
      known[categoryIconNameKey(c.brand, c.name)] = c.iconUrl;
    }
  }
  return rows.map((row: any) => {
    if (!row || row.iconUrl) return row;
    const url = known[row.id] || known[categoryIconNameKey(row.brand, row.name)];
    return url ? { ...row, iconUrl: url } : row;
  }) as T[];
}

function prepareRowsForCache<T>(key: string, value: T[]): T[] {
  if (key !== STORAGE_KEYS.categories) return value;
  const merged = mergeKnownCategoryIcons(value);
  rememberCategoryIcons(merged as Partial<Category>[]);
  return merged;
}

function readFastCache<T>(key: string): T[] | null {
  if (!FAST_CACHE_KEYS.has(key)) return null;
  try {
    const raw = localStorage.getItem(FAST_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch { return null; }
}

function writeFastCache<T>(key: string, value: T[]) {
  if (!FAST_CACHE_KEYS.has(key)) return;
  const safeValue = key === STORAGE_KEYS.categories ? stripHeavyCategoryIcons(value) : value;
  try { localStorage.setItem(FAST_CACHE_PREFIX + key, JSON.stringify(safeValue)); } catch {}
}

export function setCachedRows<T>(key: string, value: T[]) {
  const prepared = prepareRowsForCache(key, value);
  memoryCache.set(key, prepared);
  writeFastCache(key, prepared);
}

export function getCachedRows<T>(key: string): T[] | null {
  const rows = memoryCache.get(key);
  if (Array.isArray(rows)) return rows as T[];
  // Sem dados em memória ainda (refresh): usa o cache rápido para render imediato.
  const cached = readFastCache<T>(key);
  if (cached) { memoryCache.set(key, cached); return cached; }
  return null;
}

/** Leitura genérica do cache em memória (não-arrays: mapas, flags, etc.). */
export function cacheGet<T>(key: string, fb: T): T {
  return memoryCache.has(key) ? (memoryCache.get(key) as T) : fb;
}
/** Escrita genérica no cache em memória. */
export function cacheSet<T>(key: string, value: T) {
  memoryCache.set(key, value);
}

/* ---------- Metadados de empresa (descrição/logo de capa) persistidos ----------
 * Antes os metadados ficavam SÓ em memória, então a cada refresh as CAPAS das
 * empresas sumiam até a rede responder (delay de 1–2s). Agora persistimos em
 * localStorage para render imediato, sem esperar o Supabase. */
const COMPANY_META_LS = 'moura_company_meta_v1';
export type CompanyMetaMap = Record<string, { description?: string; logoUrl?: string }>;

export function persistCompanyMeta(meta: CompanyMetaMap) {
  cacheSet('moura_company_meta', meta);
  try { localStorage.setItem(COMPANY_META_LS, JSON.stringify(meta)); } catch {}
}

/** Carrega os metadados persistidos para a memória (chamado no boot, síncrono). */
export function loadCompanyMetaToMemory() {
  if (memoryCache.has('moura_company_meta')) return;
  try {
    const raw = localStorage.getItem(COMPANY_META_LS);
    if (raw) cacheSet('moura_company_meta', JSON.parse(raw));
  } catch {}
}

/** Pré-carrega as imagens de capa para o cache do navegador (render instantâneo). */
export function preloadCompanyLogos() {
  if (typeof window === 'undefined') return;
  try {
    const meta = cacheGet<CompanyMetaMap>('moura_company_meta', {});
    const urls = new Set<string>();
    // Só URLs persistentes (Storage) — base64 pesado não é pré-decodificado.
    Object.values(meta).forEach(m => { if (isPersistentImageUrl(m?.logoUrl)) urls.add(m!.logoUrl!); });
    urls.forEach(u => { const img = new Image(); img.decoding = 'async'; img.src = u; });
  } catch {}
}

function setLS<T>(key: string, value: T) {
  const prepared = Array.isArray(value) ? prepareRowsForCache(key, value as unknown[]) : value;
  memoryCache.set(key, prepared);
  if (Array.isArray(prepared)) writeFastCache(key, prepared as unknown[]);
}
function getLS<T>(key: string, fb: T): T {
  return memoryCache.has(key) ? (memoryCache.get(key) as T) : fb;
}

function shouldKeepLocalRows<T>(key: string, incoming: T[]) {
  return incoming.length === 0 && getLS<T[]>(key, []).length > 0;
}

const cleanDigits = (v?: string | null) => (v || '').replace(/\D/g, '');

function authEmailForProfile(p: { cnpj?: string | null; email?: string | null }) {
  const cnpj = cleanDigits(p.cnpj);
  return cnpj ? `${cnpj}@moura.local` : (p.email || '').trim().toLowerCase();
}

function keepLocalPassword<T extends { id: string; cnpj?: string; email?: string; password?: string }>(item: T, current: T[]): T {
  const cnpj = cleanDigits(item.cnpj);
  const email = (item.email || '').toLowerCase();
  const saved = current.find(x =>
    x.id === item.id ||
    (!!cnpj && cleanDigits(x.cnpj) === cnpj) ||
    (!!email && (x.email || '').toLowerCase() === email)
  );
  return saved?.password ? { ...item, password: saved.password } : item;
}

/* ---------- Mapeadores DB <-> APP ---------- */

const mapProductFromDB = (r: any): Product => ({
  id: r.id, code: r.code, name: r.name, description: r.description ?? '',
  category: r.category ?? '', subcategory: r.subcategory ?? undefined,
  brand: r.brand, price: Number(r.price ?? 0),
  hasVariations: !!r.has_variations,
  variationLabel: r.variation_label ?? undefined,
  variations: Array.isArray(r.variations) ? r.variations : [],
  variationGroups: (Array.isArray(r.variation_groups) ? r.variation_groups : []).map(g => ({
    ...g,
    options: (g.options || []).map((o: any) => ({
      id: o.id,
      name: o.name,
      active: o.active,
      price: o.price != null ? Number(o.price) : undefined,
      sku: o.sku?.trim() || undefined,
    })),
  })),
  combinations: (Array.isArray(r.combinations) ? r.combinations : []).map((c: any) => ({
    id: c.id,
    optionIds: Array.isArray(c.optionIds) ? c.optionIds : (Array.isArray(c.option_ids) ? c.option_ids : []),
    price: c.price != null ? Number(c.price) : undefined,
    sku: c.sku?.trim() || undefined,
    minQty: c.minQty != null ? Number(c.minQty) : (c.min_qty != null ? Number(c.min_qty) : undefined),
    fixedPrice: !!(c.fixedPrice ?? c.fixed_price),
    active: c.active ?? true,
  })),
  minQty: r.min_qty ?? 1, packQty: r.pack_qty ?? 1, image: r.image ?? undefined,
  isPromo: !!r.is_promo, isNew: !!r.is_new, isFeatured: !!r.is_featured,
  active: !!r.active, discountPct: Number(r.discount_pct ?? 0),
  fixedPrice: !!r.fixed_price,
  thickness: r.thickness ?? undefined,
  ipiRate: Number(r.ipi_rate ?? 0), stRate: Number(r.st_rate ?? 0),
  synonyms: r.synonyms ?? [], keywords: r.keywords ?? [],
  order: r.sort_order ?? 0,
  featuredOrder: r.featured_order ?? 0,
});
const mapProductToDB = (p: Product) => ({
  id: p.id, code: p.code, name: p.name, description: p.description,
  category: p.category, subcategory: p.subcategory ?? null, brand: p.brand,
  price: p.price, has_variations: !!p.hasVariations, variation_label: p.variationLabel ?? null, variations: p.variations ?? [], variation_groups: (p.variationGroups || []).map(g => ({ ...g, options: (g.options || []).map(o => ({ id: o.id, name: o.name, active: o.active, price: o.price ?? null, sku: o.sku?.trim() || null })) })), combinations: (p.combinations || []).map(c => ({ id: c.id, optionIds: c.optionIds, price: c.price ?? null, sku: c.sku?.trim() || null, minQty: c.minQty ?? null, fixedPrice: !!c.fixedPrice, active: c.active ?? true })),
  min_qty: p.minQty, pack_qty: p.packQty, image: p.image ?? null,
  is_promo: p.isPromo, is_new: p.isNew, is_featured: !!p.isFeatured, active: p.active,
  discount_pct: p.discountPct ?? 0, fixed_price: !!p.fixedPrice, thickness: p.thickness ?? null,
  ipi_rate: p.ipiRate, st_rate: p.stRate, synonyms: p.synonyms, keywords: p.keywords,
  sort_order: p.order ?? 0,
  featured_order: p.featuredOrder ?? 0,
});

const mapCategoryFromDB = (r: any): Category => ({
  id: r.id, name: r.name, brand: r.brand, icon: r.icon ?? undefined,
  iconUrl: r.icon_url ?? (isImageValue(r.icon) ? r.icon : undefined), subcategories: r.subcategories ?? [], active: !!r.active,
  order: r.sort_order ?? 0,
});
const mapCategoryToDB = (c: Category) => ({
  id: c.id, name: c.name, brand: c.brand, icon: c.icon ?? null,
  icon_url: c.iconUrl ?? null, subcategories: c.subcategories ?? [], active: c.active,
  sort_order: c.order ?? 0,
});

const mapCatalogFromDB = (r: any): Catalog => ({
  id: r.id, title: r.title, brand: r.brand, description: r.description ?? '',
  coverImage: r.cover_image ?? '', pdfUrl: r.pdf_url ?? '',
  active: !!r.active, order: r.sort_order ?? 0,
});
const mapCatalogToDB = (c: Catalog) => ({
  id: c.id, title: c.title, brand: c.brand, description: c.description ?? null,
  cover_image: c.coverImage, pdf_url: c.pdfUrl, active: c.active, sort_order: c.order,
});

const mapLaunchFromDB = (r: any): LaunchImage => ({
  id: r.id, imageUrl: r.image_url, title: r.title ?? undefined,
  description: r.description ?? undefined,
  ctaLabel: r.cta_label ?? undefined, ctaUrl: r.cta_url ?? undefined,
  brand: r.brand ?? undefined,
  active: !!r.active, order: r.sort_order ?? 0,
});
const mapLaunchToDB = (l: LaunchImage) => ({
  id: l.id, image_url: l.imageUrl, title: l.title ?? null,
  description: l.description ?? null,
  cta_label: l.ctaLabel ?? null, cta_url: l.ctaUrl ?? null,
  brand: l.brand ?? null,
  active: l.active, sort_order: l.order,
});

const mapAccessFromDB = (r: any): AccessRequest => ({
  id: r.id, cnpj: r.cnpj, companyName: r.company_name, contactName: r.contact_name,
  whatsapp: r.whatsapp, email: r.email, status: r.status,
  createdAt: r.created_at, approvedClientId: r.approved_client_id ?? undefined,
  generatedPassword: r.generated_password ?? undefined,
});
const mapAccessToDB = (a: AccessRequest) => ({
  id: a.id, cnpj: a.cnpj, company_name: a.companyName, contact_name: a.contactName,
  whatsapp: a.whatsapp, email: a.email, status: a.status,
  approved_client_id: a.approvedClientId ?? null, generated_password: a.generatedPassword ?? null,
  created_at: a.createdAt,
});

/* ---------- Tabelas configuradas ---------- */

type TableCfg<T> = {
  table: string;
  storageKey: string;
  fromDB: (r: any) => T;
  toDB: (item: T) => any;
  sortBy?: (a: T, b: T) => number;
  /** Colunas específicas a consultar (anti-egress). Quando ausente, usa '*'. */
  selectCols?: string;
};

// Colunas explícitas dos produtos: evita SELECT * e só traz o necessário para a
// vitrine. `image` é uma URL curta do Storage (não base64), então é leve.
const PRODUCT_COLS = [
  'id', 'code', 'name', 'description', 'category', 'subcategory', 'brand',
  'price', 'has_variations', 'variation_label', 'variations', 'variation_groups', 'combinations', 'min_qty', 'pack_qty', 'image',
  'is_promo', 'is_new', 'is_featured', 'active', 'discount_pct', 'fixed_price', 'thickness',
  'ipi_rate', 'st_rate', 'synonyms', 'keywords', 'sort_order', 'featured_order',
].join(',');
const PRODUCT_COLS_LEGACY = PRODUCT_COLS.split(',').filter(col => col !== 'variation_label' && col !== 'variation_groups' && col !== 'combinations' && col !== 'featured_order' && col !== 'fixed_price').join(',');
// Não traz icon_url no carregamento principal: imagens antigas em base64 nessa
// coluna causavam timeout e faziam categorias/subcategorias demorarem ou sumirem.
const CATEGORY_COLS = 'id,name,brand,icon,subcategories,active,sort_order';

const cfgs = {
  products: { table: 'products', storageKey: STORAGE_KEYS.products, fromDB: mapProductFromDB, toDB: mapProductToDB, sortBy: (a, b) => (a.order ?? 0) - (b.order ?? 0), selectCols: PRODUCT_COLS } as TableCfg<Product>,
  categories: { table: 'categories', storageKey: STORAGE_KEYS.categories, fromDB: mapCategoryFromDB, toDB: mapCategoryToDB, sortBy: (a, b) => (a.order ?? 0) - (b.order ?? 0), selectCols: CATEGORY_COLS } as TableCfg<Category>,
  catalogs: { table: 'catalogs', storageKey: STORAGE_KEYS.catalogs, fromDB: mapCatalogFromDB, toDB: mapCatalogToDB } as TableCfg<Catalog>,
  launches: { table: 'launches', storageKey: STORAGE_KEYS.launches, fromDB: mapLaunchFromDB, toDB: mapLaunchToDB } as TableCfg<LaunchImage>,
  access_requests: { table: 'access_requests', storageKey: STORAGE_KEYS.access, fromDB: mapAccessFromDB, toDB: mapAccessToDB } as TableCfg<AccessRequest>,
};

/* ---------- API genérica de write-through ---------- */

/* ---------- Fila de escritas pendentes (resiliência a falhas de rede) ----------
 * Quando o upsert falha por erro de REDE (ex.: "Failed to fetch", típico do
 * preview/conexão instável), o registro é colocado numa fila persistida. Assim
 * o produto NÃO some: ele continua no cache, é re-mesclado ao recarregar e a
 * gravação é retentada automaticamente até sincronizar com o Supabase. */
const PENDING_KEY = 'moura_pending_upserts_v1';
interface PendingUpsert { cfgKey: string; table: string; id: string; item: any; ts: number; }

function readPending(): PendingUpsert[] {
  try { const raw = localStorage.getItem(PENDING_KEY); const p = raw ? JSON.parse(raw) : []; return Array.isArray(p) ? p : []; }
  catch { return []; }
}
function writePending(list: PendingUpsert[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch {}
}
function enqueuePending(cfgKey: string, table: string, item: any) {
  const list = readPending().filter(p => !(p.table === table && p.id === item.id));
  list.push({ cfgKey, table, id: item.id, item, ts: Date.now() });
  writePending(list);
}
function dequeuePending(table: string, id: string) {
  writePending(readPending().filter(p => !(p.table === table && p.id === id)));
}

/** Mescla registros pendentes (ainda não confirmados no servidor) sobre as linhas
 *  carregadas do Supabase, para que itens recém-criados não desapareçam no refresh. */
function mergePending<T extends { id: string }>(table: string, rows: T[]): T[] {
  const pend = readPending().filter(p => p.table === table);
  if (pend.length === 0) return rows;
  const byId = new Map(rows.map(r => [(r as any).id, r] as const));
  for (const p of pend) byId.set(p.id, p.item as T);
  return Array.from(byId.values());
}

function isNetworkError(msg: string) {
  const m = (msg || '').toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed') || m.includes('timeout');
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function upsertRow<T extends { id: string }>(
  cfgKey: keyof typeof cfgs, item: T
): Promise<boolean> {
  const cfg = cfgs[cfgKey] as unknown as TableCfg<T>;
  console.log(`[supabase] 💾 Salvando em "${cfg.table}" (id=${(item as any).id})…`);
  const payload: Record<string, any> = { ...(cfg.toDB(item) as any) };
  if (cfg.table === 'categories' && !payload.icon_url) delete payload.icon_url;
  // Escrita SEGURA: passa pela RPC sec_mutate (valida token de admin no servidor).
  // Até 4 tentativas com backoff para erros de rede transitórios.
  for (let net = 0; net < 4; net++) {
    try {
      let { error } = await secMutate(cfg.table, 'upsert', payload);
      if (!error) {
        if (cfg.table === 'products' && ((payload.variation_groups?.length || 0) > 0 || (payload.combinations?.length || 0) > 0)) {
          const check = await supabase.from('products').select('id,variation_groups,combinations,min_qty,price').eq('id', (item as any).id).maybeSingle();
          if (check.error) {
            notifyDbError('upsert', cfg.table, `Banco sem colunas de variação/combinação. Rode o SQL supabase/HOTFIX_SALVAR_VARIACOES_EMPRESAS.sql. Detalhe: ${check.error.message}`);
            return false;
          }
          const savedGroups = Array.isArray(check.data?.variation_groups) ? check.data.variation_groups : [];
          const savedCombos = Array.isArray(check.data?.combinations) ? check.data.combinations : [];
          if (savedGroups.length !== (payload.variation_groups?.length || 0) || savedCombos.length !== (payload.combinations?.length || 0)) {
            notifyDbError('upsert', cfg.table, 'Variações/combinações não persistiram no banco. Rode o SQL supabase/HOTFIX_SALVAR_VARIACOES_EMPRESAS.sql.');
            return false;
          }
        }
        console.log(`[supabase] ✅ Salvo em "${cfg.table}" (id=${(item as any).id}).`);
        dequeuePending(cfg.table, (item as any).id);
        return true;
      }
      if (isNetworkError(error.message)) throw new Error(error.message);
      // Código duplicado: mostra QUAL produto já usa esse código.
      if (cfg.table === 'products' && /products_code_brand_uniq|duplicate key/i.test(error.message)) {
        const code = String(payload.code || '').trim();
        const brand = String(payload.brand || '').trim();
        let detail = `O código "${code}" já existe na empresa ${brand}.`;
        try {
          const { data } = await supabase.from('products')
            .select('id,name,code,brand,category,subcategory,active')
            .ilike('code', code).ilike('brand', brand).limit(1);
          const ex: any = data?.[0];
          if (ex) {
            detail = `O código "${code}" já está no produto "${ex.name}" (${ex.category || 'sem categoria'}${ex.subcategory ? ' › ' + ex.subcategory : ''})${ex.active === false ? ' — produto INATIVO, por isso não aparece na busca' : ''}. Edite esse produto ou use outro código.`;
          } else {
            detail += ' Ele está oculto (inativo ou excluído só da tela). Atualize a página e procure o código no cadastro de produtos.';
          }
        } catch {}
        toast.error('Código de produto já cadastrado', { description: detail, duration: 12000 });
        return false;
      }
      // Erro do servidor (sessão/permissão/validação): não adianta reter.
      notifyDbError('upsert', cfg.table, error.message);
      return false;
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (isNetworkError(msg) && net < 3) {
        console.warn(`[supabase upsert ${cfg.table}] rede instável (${msg}); tentativa ${net + 1}/4…`);
        await sleep(800 * (net + 1));
        continue;
      }
      // Falha de rede persistente: enfileira para não perder o registro.
      enqueuePending(cfgKey as string, cfg.table, item);
      console.error(`[supabase upsert ${cfg.table}] falha de rede; registro enfileirado para reenvio.`, msg);
      try {
        if (cfg.table !== 'products') {
          toast.warning('Alteração guardada — sincronizando em segundo plano', {
            description: 'O registro foi mantido e será reenviado automaticamente.',
            duration: 6000,
          });
        }
      } catch {}
      return false;
    }
  }
  return false;
}

/** Reenvia registros pendentes ao Supabase (chamado no bootstrap). */
export async function flushPendingUpserts() {
  const list = readPending();
  if (list.length === 0) return;
  console.log(`[supabase] ↻ Reenviando ${list.length} registro(s) pendente(s)…`);
  for (const p of list) {
    const cfg = (cfgs as any)[p.cfgKey] as TableCfg<any> | undefined;
    if (!cfg) { dequeuePending(p.table, p.id); continue; }
    const payload: Record<string, any> = { ...(cfg.toDB(p.item) as any) };
    if (p.table === 'categories' && !payload.icon_url) delete payload.icon_url;
    try {
      let { error } = await secMutate(p.table, 'upsert', payload);
      if (!error) dequeuePending(p.table, p.id);
    } catch { /* segue pendente; tenta de novo no próximo boot */ }
  }
}

export async function deleteRow(cfgKey: keyof typeof cfgs, id: string) {
  const cfg = cfgs[cfgKey];
  console.log(`[supabase] 🗑️ Excluindo de "${cfg.table}" (id=${id})…`);
  const { error } = await secMutate(cfg.table, 'delete', {}, { id });
  if (error) { notifyDbError('delete', cfg.table, error.message); return false; }
  console.log(`[supabase] ✅ Excluído de "${cfg.table}" (id=${id}).`);
  return true;
}

/* ---------- Bootstrap: hidrata cache no app start ---------- */

export const DATA_READY_EVENT = 'moura:data-ready';
function notifyDataReady(scope: string, rows?: unknown) {
  try { window.dispatchEvent(new CustomEvent(DATA_READY_EVENT, { detail: { scope, rows } })); } catch {}
}

// O banco devolve no máximo 1000 linhas por consulta. Busca em páginas para
// trazer TODOS os registros (sem isso, produtos além do 1000º sumiam do admin).
async function selectAll(table: string, cols: string): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const PAGE = 1000;
  const all: any[] = [];
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    const rows = (data as any[]) || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: all, error: null };
}

async function hydrateTable(cfg: TableCfg<any>) {
  try {
    console.log(`[supabase] ⬇️ Carregando "${cfg.table}"…`);
    let cols = cfg.selectCols ?? '*';
    let { data, error } = await selectAll(cfg.table, cols);
    // Se alguma coluna ainda não existe no banco, remove APENAS a coluna
    // faltante e tenta de novo (preserva variações, combinações etc.).
    let tries = 0;
    while (error && cfg.table === 'products' && cols !== '*' && tries < 8) {
      const missing = /column\s+\S*?\.?"?([a-z0-9_]+)"?\s+does not exist/i.exec(error.message)?.[1];
      if (!missing) break;
      const next = cols.split(',').filter(c => c !== missing).join(',');
      if (next === cols) break;
      cols = next;
      tries++;
      const retry = await selectAll(cfg.table, cols);
      data = retry.data;
      error = retry.error;
    }
    if (error && cfg.table === 'products') {
      const retry = await selectAll(cfg.table, PRODUCT_COLS_LEGACY);
      data = retry.data;
      error = retry.error;
    }

    if (error) { console.warn(`[hydrate ${cfg.table}]`, error.message); return; }
    if (!data) return;
    const rows = mergePending(cfg.table, data.map(cfg.fromDB));
    if (cfg.sortBy) rows.sort(cfg.sortBy);
    console.log(`[supabase] ✅ "${cfg.table}" carregado: ${rows.length} registro(s).`);
    if (rows.length === 0 && shouldKeepLocalRows(cfg.storageKey, rows)) {
      notifyDataReady(cfg.table, getLS<any[]>(cfg.storageKey, []));
      return;
    }
    setLS(cfg.storageKey, rows);
    notifyDataReady(cfg.table, rows);
    // Categorias: as capas (icon_url) NÃO vêm na consulta principal (rápida).
    // Carregamos as imagens em segundo plano e mesclamos, para que apareçam sem
    // travar/atrasar o carregamento das categorias e subcategorias.
    if (cfg.table === 'categories') void hydrateCategoryIcons();
  } catch (e) { console.warn(e); }
}

/** Carrega APENAS as capas (icon_url) das categorias em segundo plano e mescla
 *  no cache já hidratado, evitando o timeout da consulta principal. */
async function hydrateCategoryIcons() {
  try {
    // As capas (icon_url) costumam ser base64 pesado (~300KB cada). Buscar tudo
    // de uma vez (≈12MB) estoura o tempo limite e às vezes nem carrega. Por isso
    // buscamos APENAS os ids primeiro (consulta leve) e depois as imagens em
    // lotes pequenos, mesclando de forma incremental — assim as capas aparecem
    // progressivamente e nunca somem por timeout.
    const base = getLS<any[]>(STORAGE_KEYS.categories, []);
    const ids: string[] = base.map((c: any) => c.id).filter(Boolean);
    if (!ids.length) {
      notifyDataReady('category-icons', base);
      return;
    }

    const CHUNK = 6;
    let loadedCount = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      let attempt = 0;
      let chunk: any[] | null = null;
      while (attempt < 2 && chunk === null) {
        attempt++;
        const { data, error } = await supabase
          .from('categories')
          .select('id,name,brand,icon_url')
          .in('id', slice);
        if (error) { console.warn('[hydrateCategoryIcons chunk]', error.message); continue; }
        chunk = data ?? [];
      }
      if (!chunk || !chunk.length) continue;

      const iconById = new Map<string, string>();
      const iconByName = new Map<string, string>();
      for (const r of chunk as any[]) {
        if (!r.icon_url) continue;
        iconById.set(r.id, r.icon_url);
        iconByName.set(categoryIconNameKey(r.brand, r.name), r.icon_url);
        loadedCount++;
      }
      if (iconById.size === 0) continue;

      const current = getLS<any[]>(STORAGE_KEYS.categories, []);
      if (!current.length) continue;
      const merged = current.map(c => {
        if (c.iconUrl) return c;
        const url = iconById.get(c.id) || iconByName.get(categoryIconNameKey(c.brand, c.name));
        return url ? { ...c, iconUrl: url } : c;
      });
      rememberCategoryIcons(merged as Partial<Category>[]);
      setLS(STORAGE_KEYS.categories, merged);
      notifyDataReady('categories', merged);
      notifyDataReady('category-icons', merged);
    }

    cacheSet('moura_category_icons_loaded', true);
    notifyDataReady('category-icons', getLS<any[]>(STORAGE_KEYS.categories, []));
    console.log(`[supabase] 🖼️ Capas de categorias carregadas: ${loadedCount}.`);
  } catch (e) { console.warn('[hydrateCategoryIcons]', e); }
}

const DEFAULT_COMPANIES = ['Cortag', 'Ilumi', 'Claw Motobombas', 'Plaspol'];

async function hydrateCompanies() {
  try {
    console.log('[supabase] ⬇️ Carregando "companies"…');
    // UMA ÚNICA consulta traz lista + status + metadados (descrição/logo).
    // Se as colunas description/logo_url ainda não existirem (migração pendente),
    // a query completa falha e caímos para a consulta mínima garantida.
    let data: any[] | null = null;
    let hasMeta = true;
    {
      const full = await supabase
        .from('companies')
        .select('name, active, sort_order, description, logo_url')
        .order('sort_order');
      if (full.error) {
        hasMeta = false;
        const min = await supabase
          .from('companies')
          .select('name, active, sort_order')
          .order('sort_order');
        if (min.error) { console.warn('[hydrate companies]', min.error.message); return; }
        data = min.data;
      } else {
        data = full.data;
      }
    }
    if (!data) return;
    let rows = data.map(c => c.name);
    // Se o banco voltar VAZIO, não apagamos a lista local: mantemos o que já
    // existe ou semeamos os padrões (e os gravamos no banco) para nunca ficar
    // sem empresas — o que quebraria as abas Pânico/CSV.
    if (rows.length === 0) {
      const existing = getLS<string[]>(STORAGE_KEYS.companies, []);
      rows = existing.length > 0 ? existing : DEFAULT_COMPANIES;
      void syncCompanies(rows);
      console.log(`[supabase] ⚠️ "companies" vazio no banco — usando ${rows.length} padrão(ões) e ressincronizando.`);
    } else {
      console.log(`[supabase] ✅ "companies" carregado: ${rows.length} registro(s).`);
    }
    setLS(STORAGE_KEYS.companies, rows);
    notifyDataReady('companies', rows);
    // Reconstrói a lista de empresas inativas a partir da coluna active.
    const inactive = data.filter(c => c.active === false).map(c => c.name);
    cacheSet('moura_inactive_companies', inactive);
    // Metadados (descrição/logo) — só quando vieram na mesma consulta.
    if (hasMeta) {
      const meta: Record<string, { description?: string; logoUrl?: string }> = {};
      data.forEach((c: any) => { meta[c.name] = { description: c.description ?? '', logoUrl: c.logo_url ?? '' }; });
      persistCompanyMeta(meta);
      preloadCompanyLogos();
    }
  } catch (e) { console.warn('[hydrate companies]', e); }
}

/** Atualiza descrição/logo de uma empresa (admin). */
export async function updateCompanyMetaDB(name: string, meta: { description?: string; logoUrl?: string }) {
  const payload: Record<string, any> = {};
  if (meta.description !== undefined) payload.description = meta.description;
  if (meta.logoUrl !== undefined) payload.logo_url = meta.logoUrl;
  if (Object.keys(payload).length === 0) return true;
  const { error } = await secMutate('companies', 'update', payload, { name });
  if (error) { notifyDbError('upsert', 'companies', error.message); return false; }
  return true;
}

/** Renomeia uma empresa no banco (mantém sort_order/active via update por nome). */
export async function renameCompanyDB(oldName: string, newName: string) {
  const { error } = await secMutate('companies', 'update', { name: newName }, { name: oldName });
  if (error) notifyDbError('upsert', 'companies', error.message);
}

async function hydratePanic() {
  try {
    const { data } = await supabase.from('panic_brands').select('brand');
    if (data) { const rows = data.map(p => p.brand); setLS(STORAGE_KEYS.panic, rows); notifyDataReady('panic_brands', rows); }
  } catch {}
}

async function hydrateContacts() {
  try {
    const { data, error } = await adminSelect('contacts');
    if (error || !data) return;
    const rows = data
      .map((c: any) => ({
        id: c.id, cnpj: c.cnpj ?? '', empresa: c.empresa ?? '', nome: c.nome ?? '',
        whatsapp: c.whatsapp ?? '', email: c.email ?? '', mensagem: c.mensagem ?? '',
        status: c.status ?? 'pending', createdAt: c.created_at,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLS(STORAGE_KEYS.contacts, rows);
    notifyDataReady('contacts', rows);
  } catch {}
}

async function hydratePwRecoveries() {
  try {
    const { data, error } = await adminSelect('password_recoveries');
    if (error || !data) return;
    const rows = data
      .map((p: any) => ({
        id: p.id, cnpj: p.cnpj ?? '', whatsapp: p.whatsapp ?? undefined,
        status: p.status ?? 'pending', createdAt: p.created_at,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLS(STORAGE_KEYS.pwRecovery, rows);
    notifyDataReady('password_recoveries', rows);
  } catch {}
}

export interface VisitRow { ts: number; path: string; ref?: string }

async function hydrateVisits() {
  try {
    const { data, error } = await adminSelect('visits');
    if (error || !data) return;
    const rows: VisitRow[] = data
      .map((v: any) => ({ ts: new Date(v.created_at).getTime(), path: v.path, ref: v.ref ?? undefined }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-5000);
    setLS(STORAGE_KEYS.visits, rows);
    notifyDataReady('visits', rows);
  } catch {}
}

async function hydrateAccessRequests() {
  try {
    const { data, error } = await adminSelect('access_requests');
    if (error || !data) return;
    const rows = data.map(mapAccessFromDB);
    setLS(STORAGE_KEYS.access, rows);
    notifyDataReady('access_requests', rows);
  } catch {}
}

export async function insertVisitDB(row: { path: string; ref?: string }) {
  try {
    const { error } = await supabase.rpc('track_visit', { _path: row.path, _ref: row.ref ?? null });
    if (error) console.warn('[track_visit]', error.message);
  } catch (e: any) { console.warn('[track_visit]', e?.message || String(e)); }
}

/** Solicitação de acesso (pré-cadastro): criada por visitante NÃO logado. */
export async function submitAccessRequest(a: AccessRequest) {
  const { error } = await publicSubmit('access_request', mapAccessToDB(a));
  if (error) notifyDbError('insert', 'access_requests', error.message);
}




const BRAND_RULES_LS = 'moura_brand_rules_persist_v1';
const GLOBAL_TEXTS_LS = 'moura_global_texts_persist_v1';

/** Carrega as regras de marca e textos globais persistidos para a memória
 *  (chamado no boot, síncrono). As regras vivem só em memória, então sem isto
 *  elas "sumiam" a cada reload até a revalidação em segundo plano rodar. */
export function loadBrandRulesToMemory() {
  try {
    if (!memoryCache.has(STORAGE_KEYS.brandRules)) {
      const raw = localStorage.getItem(BRAND_RULES_LS);
      if (raw) cacheSet(STORAGE_KEYS.brandRules, JSON.parse(raw));
    }
    if (!memoryCache.has('moura_global_texts_v1')) {
      const raw = localStorage.getItem(GLOBAL_TEXTS_LS);
      if (raw) cacheSet('moura_global_texts_v1', JSON.parse(raw));
    }
  } catch {}
}

/** Persiste as regras de marca em localStorage (usado pelo serviço ao salvar). */
export function persistBrandRules(map: Record<string, any>) {
  try { localStorage.setItem(BRAND_RULES_LS, JSON.stringify(map)); } catch {}
}

async function hydrateBrandRules() {
  try {
    const { data, error } = await supabase.from('brand_rules').select('*');
    if (error || !data) return;
    const rules = data.reduce((acc: Record<string, any>, row: any) => {
      acc[row.brand] = row.rules || {};
      return acc;
    }, {});
    // Extrai a linha-sentinela de textos globais (política/aviso) para o seu próprio storage.
    const globalTexts = rules['__global_texts__'];
    if (globalTexts && typeof globalTexts === 'object') {
      cacheSet('moura_global_texts_v1', globalTexts);
      try { localStorage.setItem(GLOBAL_TEXTS_LS, JSON.stringify(globalTexts)); } catch {}
      delete rules['__global_texts__'];
    }
    if (Object.keys(rules).length) {
      setLS(STORAGE_KEYS.brandRules, rules);
      persistBrandRules(rules);
    }
    notifyDataReady('brand_rules', rules);
  } catch {}
}


/**
 * Lê perfis por papel. O admin entra via login local (sem sessão Supabase),
 * então o select direto é bloqueado pela RLS. Usamos a RPC SECURITY DEFINER
 * admin_list_profiles (anon) e, se ela não existir, caímos no select direto.
 */
async function fetchProfilesByRole(role: 'client' | 'lead'): Promise<any[] | null> {
  // Leitura segura via RPC admin_list_profiles (valida token de admin no servidor).
  return await adminListProfiles(role);
}

async function hydrateLeads() {
  try {
    const data = await fetchProfilesByRole('lead');
    if (!data) return;
    const current = getLS<Lead[]>(STORAGE_KEYS.leads, []);
    const leads: Lead[] = data.map((p): Lead => ({
      id: p.id, cnpj: p.cnpj ?? '', email: p.email ?? '', password: p.password ?? '',
      companyName: p.company_name ?? '', contactName: p.name ?? '',
      whatsapp: p.whatsapp ?? '', allowedBrands: p.allowed_brands ?? [],
      active: !!p.active, createdAt: p.created_at,
    })).map(l => keepLocalPassword<Lead>(l, current));
    if (!shouldKeepLocalRows(STORAGE_KEYS.leads, leads)) setLS(STORAGE_KEYS.leads, leads);
    notifyDataReady('leads', leads);
  } catch {}
}

async function hydrateClients() {
  try {
    const data = await fetchProfilesByRole('client');
    if (!data) return;
    const current = getLS<Client[]>(STORAGE_KEYS.clients, []);
    const clients: Client[] = data.map((p): Client => ({
      id: p.id, cnpj: p.cnpj ?? '', email: p.email ?? '', password: p.password ?? '',
      companyName: p.company_name ?? '', tradeName: p.trade_name ?? p.name ?? '',
      address: p.address ?? '', whatsapp: p.whatsapp ?? undefined,
      pocket: p.pocket ?? undefined,
      classification: p.classification ?? 'Standard', network: p.network ?? '',
      creditLimit: Number(p.credit_limit ?? 0), discountPct: Number(p.discount_pct ?? 0),
      brandDiscounts: (p.brand_discounts && typeof p.brand_discounts === 'object') ? p.brand_discounts : {},
      active: !!p.active, allowedBrands: p.allowed_brands ?? [],
    })).map(c => keepLocalPassword<Client>(c, current));
    if (!shouldKeepLocalRows(STORAGE_KEYS.clients, clients)) setLS(STORAGE_KEYS.clients, clients);
    notifyDataReady('clients', clients);
  } catch {}
}

export async function hydrateOrders() {
  try {
    // Admin vê todos os pedidos; cliente/lead vê apenas os próprios (RPC scoped).
    const data = getSessionRole() === 'admin' ? await adminOrders() : await clientOrders();
    if (!data) return;
    const orders: Order[] = data.map((o: any) => ({
      id: o.id, clientId: o.client_id ?? '', clientName: o.client_name ?? '', clientCnpj: o.client_cnpj ?? '',
      brand: o.brand, type: o.type, generalDiscountPct: Number(o.general_discount_pct ?? 0),
      totalBruto: Number(o.total_bruto ?? 0), totalWithDiscount: Number(o.total_with_discount ?? 0),
      totalIPI: Number(o.total_ipi ?? 0), totalST: Number(o.total_st ?? 0), totalWithTax: Number(o.total_with_tax ?? 0),
      status: o.status, createdAt: o.created_at,
      observations: o.observations ?? undefined, purchaseOrder: o.purchase_order ?? undefined,
      invoiceNote: o.invoice_note ?? undefined, buyer: o.buyer ?? undefined,
      paymentMethod: o.payment_method ?? undefined, paymentTerm: o.payment_term ?? undefined,
      items: (o.order_items ?? []).map((it: any) => ({
        productId: it.product_id, code: it.code, name: it.name,
        qty: it.qty, unitPrice: Number(it.unit_price ?? 0), totalPrice: Number(it.total_price ?? 0),
        listPrice: Number(it.list_price ?? 0), salePrice: Number(it.sale_price ?? 0), discountPct: Number(it.discount_pct ?? 0),
        subtotal: Number(it.subtotal ?? 0), extraDiscountPct: Number(it.extra_discount_pct ?? 0),
        subtotalAfterExtra: Number(it.subtotal_after_extra ?? 0), ipiRate: Number(it.ipi_rate ?? 0), ipiValue: Number(it.ipi_value ?? 0),
        stRate: Number(it.st_rate ?? 0), stValue: Number(it.st_value ?? 0), totalWithTax: Number(it.total_with_tax ?? 0),
      })),
    }));
    if (!shouldKeepLocalRows(STORAGE_KEYS.orders, orders)) setLS(STORAGE_KEYS.orders, orders);
    notifyDataReady('orders', orders);
  } catch (e) { console.warn(e); }
}

async function hydrateQuotes() {
  try {
    const data = await adminQuotes();
    if (!data) return;
    data.forEach((q: any) => { q.quote_request_items = q.quote_request_items ?? []; });
    const quotes: QuoteRequest[] = data.map((q: any) => ({
      id: q.id, cnpj: q.cnpj ?? '', companyName: q.company_name ?? '', contactName: q.contact_name ?? '',
      whatsapp: q.whatsapp ?? '', email: q.email ?? '', brand: q.brand ?? '', status: q.status,
      type: 'orcamento', createdAt: q.created_at,
      items: (q.quote_request_items ?? []).map((it: any) => ({
        productId: it.product_id, code: it.code, name: it.name, qty: it.qty,
      })),
    }));
    if (!shouldKeepLocalRows(STORAGE_KEYS.quotes, quotes)) setLS(STORAGE_KEYS.quotes, quotes);
    notifyDataReady('quotes', quotes);
  } catch (e) { console.warn(e); }
}

let bootPromise: Promise<void> | null = null;
let bootInFlight = false;
let adminBootPromise: Promise<void> | null = null;
let adminBootInFlight = false;

/* ---------- Controle de frescor (anti-egress) ----------
 * A vitrine pública (produtos, categorias, catálogos, lançamentos…) muda com
 * pouca frequência. Refazer o SELECT completo a cada refresh/navegação gera
 * egress enorme no Supabase. Guardamos o instante da última hidratação; se o
 * cache rápido (localStorage) ainda estiver "fresco", renderizamos a partir
 * dele SEM bater no banco. Admin (force=true) sempre revalida. */
const FRESHNESS_KEY = 'moura_public_hydrated_at_v1';
const FRESHNESS_TTL_MS = 10 * 60 * 1000; // 10 minutos

/* ---------- Cooldown de revalidação (anti-flood) ----------
 * No caminho "cache fresco" (stale-while-revalidate) o bootstrap dispara uma
 * revalidação em segundo plano (os SELECTs de products/categories/…). Se algum
 * componente chama bootstrapDataStore() repetidamente (ex.: re-render no admin),
 * isso reexecutava a revalidação INTEIRA a cada chamada — inundando o console de
 * "Carregando" e gerando egress em laço. Guardamos o instante da última
 * revalidação em memória e só permitimos uma nova após o cooldown. */
let lastRevalidateAt = 0;
const REVALIDATE_COOLDOWN_MS = 30 * 1000; // 30s entre revalidações em background

function publicCacheIsFresh(): boolean {
  try {
    const raw = localStorage.getItem(FRESHNESS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    // Só consideramos fresco se o bootstrap público essencial estiver completo.
    const hasRequiredRows = [
      STORAGE_KEYS.products,
      STORAGE_KEYS.categories,
      STORAGE_KEYS.companies,
    ].every(key => (readFastCache(key)?.length ?? 0) > 0);
    const hasCache = hasRequiredRows && !!readFastCache(STORAGE_KEYS.catalogs) && !!readFastCache(STORAGE_KEYS.launches);
    return hasCache && Date.now() - ts < FRESHNESS_TTL_MS;
  } catch { return false; }
}

function markPublicHydrated() {
  try { localStorage.setItem(FRESHNESS_KEY, String(Date.now())); } catch {}
}

/**
 * Hidrata APENAS os dados públicos da vitrine (produtos, categorias, catálogos,
 * lançamentos, empresas, pânico e regras de marca). Estas são as únicas tabelas
 * que um visitante anônimo precisa — evita egress enorme baixando pedidos,
 * perfis, orçamentos, contatos e visitas a cada abertura de página.
 *
 * Stale-while-revalidate: se o cache local ainda estiver fresco (< TTL) e não
 * for forçado, usamos o cache e NÃO consultamos o Supabase (zero egress).
 */
export function bootstrapDataStore(force = false): Promise<void> {
  if (bootInFlight && bootPromise) return bootPromise;
  if (force) bootPromise = null;
  // Carrega as capas persistidas para a memória ANTES de qualquer render, e
  // pré-aquece o cache de imagens — assim as capas aparecem na hora, sem delay.
  loadCompanyMetaToMemory();
  loadBrandRulesToMemory();
  preloadCompanyLogos();
  preloadCategoryIcons();
  if (bootPromise) return bootPromise;

  // Cache fresco: STALE-WHILE-REVALIDATE.
  // 1) Renderiza IMEDIATAMENTE a partir do cache (vitrine aparece na hora, sem
  //    tela vazia nem delay nas capas).
  // 2) AINDA ASSIM revalida em segundo plano contra o Supabase, para que
  //    produtos novos, categorias/subcategorias e nomes de variação cadastrados
  //    no admin apareçam para o cliente SEM depender de refresh manual.
  if (!force && publicCacheIsFresh()) {
    // Render imediato a partir do cache (síncrono, sem rede).
    getCachedRows(STORAGE_KEYS.products);
    getCachedRows(STORAGE_KEYS.categories);
    getCachedRows(STORAGE_KEYS.catalogs);
    getCachedRows(STORAGE_KEYS.launches);
    getCachedRows(STORAGE_KEYS.companies);
    cacheSet(STORAGE_KEYS.bootstrapped, '1');

    // Só revalida em background se o cooldown passou. Sem isso, chamadas
    // repetidas de bootstrapDataStore() (re-renders no admin) refariam os
    // SELECTs em laço, inundando o console e gerando egress.
    const canRevalidate = Date.now() - lastRevalidateAt > REVALIDATE_COOLDOWN_MS;
    if (!canRevalidate) {
      notifyDataReady('all');
      return Promise.resolve();
    }
    lastRevalidateAt = Date.now();

    bootInFlight = true;
    bootPromise = (async () => {
      console.log('[supabase] ⚡ Cache da vitrine — render imediato + revalidação em segundo plano.');
      notifyDataReady('all');
      // Revalidação em segundo plano (não bloqueia o render inicial).
      void (async () => {
        await flushPendingUpserts();
        await Promise.allSettled([
          hydrateTable(cfgs.products),
          hydrateTable(cfgs.categories),
          hydrateTable(cfgs.catalogs),
          hydrateTable(cfgs.launches),
        hydrateCompanies(),
        hydratePanic(),
        hydrateBrandRules(),
        (async () => { const m = await import('./promotionService'); await m.hydratePromotions(); })(),
      ]);
        markPublicHydrated();
        lastRevalidateAt = Date.now();
        notifyDataReady('all');
      })().finally(() => { bootInFlight = false; });
    })();
    return bootPromise;
  }


  bootInFlight = true;
  bootPromise = (async () => {
    await flushPendingUpserts();
    await Promise.allSettled([
      hydrateTable(cfgs.products),
      hydrateTable(cfgs.categories),
      hydrateTable(cfgs.catalogs),
      hydrateTable(cfgs.launches),
      hydrateCompanies(),
      hydratePanic(),
      hydrateBrandRules(),
      (async () => { const m = await import('./promotionService'); await m.hydratePromotions(); })(),
    ]);
    markPublicHydrated();
    lastRevalidateAt = Date.now();
    cacheSet(STORAGE_KEYS.bootstrapped, '1');
    notifyDataReady('all');
  })().finally(() => { bootInFlight = false; });
  return bootPromise;
}

/**
 * Hidrata os dados restritos (admin/área logada): perfis, pedidos, orçamentos,
 * solicitações, contatos, recuperações de senha e visitas. Só deve ser chamado
 * quando há um usuário autenticado, para não gerar egress desnecessário.
 */
export function bootstrapAdminData(force = false): Promise<void> {
  if (adminBootInFlight && adminBootPromise) return adminBootPromise;
  if (force) adminBootPromise = null;
  if (adminBootPromise) return adminBootPromise;
  adminBootInFlight = true;
  adminBootPromise = (async () => {
    await Promise.allSettled([
      hydrateAccessRequests(),
      hydrateClients(),
      hydrateLeads(),
      hydrateOrders(),
      hydrateQuotes(),
      hydrateContacts(),
      hydratePwRecoveries(),
      hydrateVisits(),
    ]);
    notifyDataReady('all');
  })().finally(() => { adminBootInFlight = false; });
  return adminBootPromise;
}

/* ---------- Refresh seletivo (anti-egress) ----------
 * Após uma ação no admin, recarregamos APENAS a tabela afetada em vez de
 * rebaixar TODO o conjunto de dados (bootstrapAdminData(true)/bootstrapDataStore(true)),
 * que multiplicava o egress a cada salvamento. */
export const refreshTable = {
  accessRequests: () => hydrateAccessRequests(),
  clients: () => hydrateClients(),
  leads: () => hydrateLeads(),
  orders: () => hydrateOrders(),
  quotes: () => hydrateQuotes(),
  contacts: () => hydrateContacts(),
  pwRecoveries: () => hydratePwRecoveries(),
  visits: () => hydrateVisits(),
  catalogs: () => hydrateTable(cfgs.catalogs),
  launches: () => hydrateTable(cfgs.launches),
  products: () => hydrateTable(cfgs.products),
  categories: () => hydrateTable(cfgs.categories),
  companies: () => hydrateCompanies(),
};

export async function syncCompanies(list: string[]) {
  // Não enviamos "active" para não sobrescrever empresas marcadas como inativas;
  // novas empresas usam o default da coluna (true).
  for (let i = 0; i < list.length; i++) {
    const { error } = await secMutate('companies', 'upsert', { name: list[i], sort_order: i + 1 }, {}, 'name');
    if (error) { notifyDbError('upsert', 'companies', error.message); return false; }
  }
  return true;
}

export async function setCompanyActiveDB(name: string, active: boolean) {
  // Update por nome; se a empresa ainda não existir na tabela, faz upsert
  // (sem isso a reativação "não salvava" e voltava inativa após o refresh).
  const { error } = await secMutate('companies', 'update', { active }, { name });
  if (error) {
    const up = await secMutate('companies', 'upsert', { name, active }, {}, 'name');
    if (up.error) { notifyDbError('upsert', 'companies', up.error.message); return false; }
  }
  return true;
}


export async function removeCompanyDB(name: string) {
  const { error } = await secMutate('companies', 'delete', {}, { name });
  if (error) notifyDbError('delete', 'companies', error.message);
}

export async function setPanicBrand(brand: string, blocked: boolean) {
  const { error } = blocked
    ? await secMutate('panic_brands', 'upsert', { brand }, {}, 'brand')
    : await secMutate('panic_brands', 'delete', {}, { brand });
  if (error) notifyDbError(blocked ? 'upsert' : 'delete', 'panic_brands', error.message);
}

export async function upsertBrandRules(brand: string, rules: any) {
  const { error } = await secMutate('brand_rules', 'upsert', { brand, rules }, {}, 'brand');
  if (error) notifyDbError('upsert', 'brand_rules', error.message);
}

type ProfileInput = Partial<Client> & {
  id: string;
  role: 'client' | 'lead' | 'admin';
  contactName?: string;
};

function mapProfileToDB(p: ProfileInput) {
  return {
    id: p.id,
    cnpj: p.cnpj || null,
    email: p.email || null,
    auth_email: p.role === 'admin' ? (p.email || '').trim().toLowerCase() : authEmailForProfile(p),
    password: p.password || null,
    name: p.contactName ?? p.tradeName ?? p.companyName ?? null,
    role: p.role,
    company_name: p.companyName ?? null,
    trade_name: p.tradeName ?? null,
    address: p.address ?? null,
    whatsapp: p.whatsapp ?? null,
    pocket: p.pocket ?? null,
    classification: p.classification ?? null,
    network: p.network ?? null,
    credit_limit: p.creditLimit ?? 0,
    discount_pct: p.discountPct ?? 0,
    brand_discounts: p.brandDiscounts ?? {},
    allowed_brands: p.allowedBrands ?? [],
    active: p.active ?? true,
  };
}

export async function upsertProfile(p: ProfileInput) {
  console.log(`[supabase] 💾 Salvando perfil (${p.role}, id=${p.id})…`);
  const payload = mapProfileToDB(p);
  // Escrita SEGURA: sec_mutate valida o token de admin e faz o hash da senha no servidor.
  const { error } = await secMutate('profiles', 'upsert', payload);
  if (error) notifyDbError('upsert', 'profiles', error.message);
  else {
    if ((p.role === 'client' || p.role === 'lead') && p.allowedBrands) {
      const rows = await adminListProfiles(p.role);
      const saved = rows?.find((row: any) => row.id === p.id);
      if (saved && !sameStringSet(saved.allowed_brands, p.allowedBrands)) {
        notifyDbError('upsert', 'profiles', 'Empresas liberadas não persistiram no banco. Rode o SQL supabase/HOTFIX_SALVAR_VARIACOES_EMPRESAS.sql.');
        return;
      }
    }
    console.log(`[supabase] ✅ Perfil salvo (${p.role}, id=${p.id}).`);
  }
}

export async function deleteProfile(id: string) {
  console.log(`[supabase] 🗑️ Excluindo perfil (id=${id})…`);
  const { error } = await secMutate('profiles', 'delete', {}, { id });
  if (error) notifyDbError('delete', 'profiles', error.message);
  else console.log(`[supabase] ✅ Perfil excluído (id=${id}).`);
}

/* ---------- Tickets (contacts / pw recovery) ---------- */

export async function insertContact(row: any) {
  // Formulário público de contato: insert-only via RPC submit_contact (anon).
  const { error } = await publicSubmit('contact', row);
  if (error) notifyDbError('insert', 'contacts', error.message);
}
export async function updateContact(id: string, row: any) {
  const { error } = await secMutate('contacts', 'update', row, { id });
  if (error) notifyDbError('update', 'contacts', error.message);
}
export async function deleteContact(id: string) {
  const { error } = await secMutate('contacts', 'delete', {}, { id });
  if (error) { notifyDbError('delete', 'contacts', error.message); return false; }
  return true;
}

export async function insertPwRec(row: any) {
  // Recuperação de senha pública: insert-only via RPC submit_password_recovery (anon).
  const { error } = await publicSubmit('password_recovery', row);
  if (error) notifyDbError('insert', 'password_recoveries', error.message);
}
export async function updatePwRec(id: string, row: any) {
  const { error } = await secMutate('password_recoveries', 'update', row, { id });
  if (error) notifyDbError('update', 'password_recoveries', error.message);
}
export async function deletePwRec(id: string) {
  const { error } = await secMutate('password_recoveries', 'delete', {}, { id });
  if (error) { notifyDbError('delete', 'password_recoveries', error.message); return false; }
  return true;
}

/* ---------- Orders ---------- */

const orderItemToDB = (orderId: string, it: any) => ({
  id: it.id ?? crypto.randomUUID(),
  order_id: orderId, product_id: it.productId, code: it.code, name: it.name,
  qty: it.qty, unit_price: it.unitPrice,
  total_price: it.totalPrice, list_price: it.listPrice, sale_price: it.salePrice,
  discount_pct: it.discountPct, subtotal: it.subtotal,
  extra_discount_pct: it.extraDiscountPct, subtotal_after_extra: it.subtotalAfterExtra,
  ipi_rate: it.ipiRate, ipi_value: it.ipiValue,
  st_rate: it.stRate, st_value: it.stValue, total_with_tax: it.totalWithTax,
});

export async function insertOrderDB(order: any) {
  const { items, ...header } = order;
  // Criação SEGURA: place_order (cliente/lead cria em nome próprio; admin em nome de terceiros).
  const _order = {
    id: header.id, client_id: header.clientId, client_name: header.clientName,
    client_cnpj: header.clientCnpj, brand: header.brand, type: header.type,
    general_discount_pct: header.generalDiscountPct,
    total_bruto: header.totalBruto, total_with_discount: header.totalWithDiscount,
    total_ipi: header.totalIPI, total_st: header.totalST,
    total_with_tax: header.totalWithTax, status: header.status, created_at: header.createdAt,
    observations: header.observations ?? null, purchase_order: header.purchaseOrder ?? null,
    invoice_note: header.invoiceNote ?? null, buyer: header.buyer ?? null,
    payment_method: header.paymentMethod ?? null, payment_term: header.paymentTerm ?? null,
    items: (items ?? []).map((it: any) => orderItemToDB(header.id, it)),
  };
  const { error } = await placeOrder(_order);
  if (error) notifyDbError('insert', 'orders', error.message);
}

export async function updateOrderDB(id: string, data: any) {
  // Atualização via RPC update_order (dono OU admin). Substitui os itens quando
  // enviados. Antes usava sec_mutate (somente admin), o que fazia o cliente
  // receber "Falha ao update em order_items" ao editar o próprio pedido.
  const patch: any = {};
  if (data.status) patch.status = data.status;
  if (data.type) patch.type = data.type;
  // Campos de cabeçalho (só enviados quando presentes no patch recebido).
  if (data.observations !== undefined) patch.observations = data.observations ?? null;
  if (data.purchaseOrder !== undefined) patch.purchase_order = data.purchaseOrder ?? null;
  if (data.invoiceNote !== undefined) patch.invoice_note = data.invoiceNote ?? null;
  if (data.buyer !== undefined) patch.buyer = data.buyer ?? null;
  if (data.paymentMethod !== undefined) patch.payment_method = data.paymentMethod ?? null;
  if (data.paymentTerm !== undefined) patch.payment_term = data.paymentTerm ?? null;
  if (data.generalDiscountPct !== undefined) patch.general_discount_pct = data.generalDiscountPct ?? 0;
  let items: any[] | null = null;
  if (data.items) {
    const order = getLS<Order[]>(STORAGE_KEYS.orders, []).find(o => o.id === id);
    if (order) {
      patch.total_bruto = order.totalBruto;
      patch.total_with_discount = order.totalWithDiscount;
      patch.total_ipi = order.totalIPI;
      patch.total_st = order.totalST;
      patch.total_with_tax = order.totalWithTax;
    }
    items = data.items.map((it: any) => orderItemToDB(id, it));
  }
  const { error } = await updateOrderRPC(id, patch, items);
  if (error) notifyDbError('update', 'orders', error.message);
}

export async function deleteOrderDB(id: string) {
  await secMutate('order_items', 'delete', {}, { order_id: id });
  const { error } = await secMutate('orders', 'delete', {}, { id });
  if (error) notifyDbError('delete', 'orders', error.message);
}

export async function insertQuoteDB(quote: any) {
  const { items, ...header } = quote;
  // Orçamento criado por visitante (lead) NÃO logado: insert-only via submit_quote (anon).
  const _quote = {
    id: header.id, cnpj: header.cnpj, company_name: header.companyName,
    contact_name: header.contactName, whatsapp: header.whatsapp,
    email: header.email, brand: header.brand, status: header.status,
    type: header.type, created_at: header.createdAt,
    items: (items ?? []).map((it: any) => ({
      product_id: it.productId, code: it.code, name: it.name, qty: it.qty,
    })),
  };
  const { error } = await publicSubmit('quote', _quote);
  if (error) notifyDbError('insert', 'quote_requests', error.message);
}

export async function updateQuoteDB(id: string, data: any) {
  if (!data.status) return;
  const { error } = await secMutate('quote_requests', 'update', { status: data.status }, { id });
  if (error) notifyDbError('update', 'quote_requests', error.message);
}

export async function deleteQuoteDB(id: string) {
  await secMutate('quote_request_items', 'delete', {}, { quote_id: id });
  const { error } = await secMutate('quote_requests', 'delete', {}, { id });
  if (error) notifyDbError('delete', 'quote_requests', error.message);
}
