/**
 * Migração one-shot: localStorage -> Supabase.
 * Roda uma única vez (gated por flag em localStorage). Quando logado como admin,
 * faz upload de todos os dados em massa via RPC segura sec_mutate (valida o token
 * de admin no servidor). Falhas individuais não quebram o app.
 */
import { STORAGE_KEYS, upsertProfile } from './dataStore';
import { secMutate } from './secureDb';

const FLAG = STORAGE_KEYS.migrated;

function read<T>(key: string): T[] {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : []; } catch { return []; }
}

/** Faz upsert seguro de um conjunto de linhas (uma a uma) numa tabela. */
async function bulkUpsert(table: string, rows: Record<string, unknown>[], conflict = 'id') {
  for (const row of rows) {
    const { error } = await secMutate(table, 'upsert', row, {}, conflict);
    if (error) { console.warn(`[migration ${table}]`, error.message); break; }
  }
}

async function syncLocalProfiles() {
  const clients = read<any>(STORAGE_KEYS.clients);
  const leads = read<any>(STORAGE_KEYS.leads);
  await Promise.all([
    ...clients.map(c => upsertProfile({ ...c, role: 'client' })),
    ...leads.map(l => upsertProfile({ ...l, tradeName: l.contactName, role: 'lead' })),
  ]);
}

export async function runMigrationIfNeeded(isAdmin: boolean) {
  if (!isAdmin) return;
  await syncLocalProfiles();
  if (localStorage.getItem(FLAG) === '1') return;

  console.log('[migration] iniciando upload do localStorage para Supabase…');

  // Products
  const products = read<any>(STORAGE_KEYS.products);
  if (products.length) {
    await bulkUpsert('products', products.map(p => ({
      id: p.id, code: p.code, name: p.name, description: p.description ?? '',
      category: p.category ?? null, subcategory: p.subcategory ?? null, brand: p.brand,
      price: p.price ?? 0, min_qty: p.minQty ?? 1, pack_qty: p.packQty ?? 1,
      image: p.image ?? null, is_promo: !!p.isPromo, is_new: !!p.isNew,
      is_featured: !!p.isFeatured, active: p.active !== false,
      discount_pct: p.discountPct ?? 0, thickness: p.thickness ?? null,
      ipi_rate: p.ipiRate ?? 0, st_rate: p.stRate ?? 0,
      synonyms: p.synonyms ?? [], keywords: p.keywords ?? [], sort_order: p.order ?? 0,
    })));
  }

  // Categories
  const cats = read<any>(STORAGE_KEYS.categories);
  if (cats.length) {
    await bulkUpsert('categories', cats.map(c => ({
      id: c.id, name: c.name, brand: c.brand, icon: c.icon ?? null,
      icon_url: c.iconUrl ?? null, subcategories: c.subcategories ?? [], active: c.active !== false, sort_order: c.order ?? 0,
    })));
  }

  // Companies
  const companies = read<string>(STORAGE_KEYS.companies);
  if (companies.length) {
    await bulkUpsert('companies', companies.map((name, i) => ({ name, sort_order: i + 1, active: true })), 'name');
  }

  // Catalogs
  const catalogs = read<any>(STORAGE_KEYS.catalogs);
  if (catalogs.length) {
    await bulkUpsert('catalogs', catalogs.map(c => ({
      id: c.id, title: c.title, brand: c.brand, description: c.description ?? null,
      cover_image: c.coverImage, pdf_url: c.pdfUrl, active: c.active !== false, sort_order: c.order,
    })));
  }

  // Launches
  const launches = read<any>(STORAGE_KEYS.launches);
  if (launches.length) {
    await bulkUpsert('launches', launches.map(l => ({
      id: l.id, image_url: l.imageUrl, title: l.title ?? null,
      active: l.active !== false, sort_order: l.order,
    })));
  }

  // Panic brands
  const panic = read<string>(STORAGE_KEYS.panic);
  if (panic.length) {
    await bulkUpsert('panic_brands', panic.map(brand => ({ brand })), 'brand');
  }

  // Brand rules
  try {
    const rules = JSON.parse(localStorage.getItem(STORAGE_KEYS.brandRules) || '{}');
    const rows = Object.entries(rules).map(([brand, value]) => ({ brand, rules: value }));
    if (rows.length) await bulkUpsert('brand_rules', rows, 'brand');
  } catch {}

  // Access requests
  const access = read<any>(STORAGE_KEYS.access);
  if (access.length) {
    await bulkUpsert('access_requests', access.map(a => ({
      id: a.id, cnpj: a.cnpj, company_name: a.companyName, contact_name: a.contactName,
      whatsapp: a.whatsapp, email: a.email, status: a.status,
      approved_client_id: a.approvedClientId ?? null, generated_password: a.generatedPassword ?? null,
      created_at: a.createdAt,
    })));
  }

  // Contacts
  const contacts = read<any>(STORAGE_KEYS.contacts);
  if (contacts.length) {
    await bulkUpsert('contacts', contacts.map(c => ({
      id: c.id, cnpj: c.cnpj, empresa: c.empresa, nome: c.nome,
      whatsapp: c.whatsapp, email: c.email, mensagem: c.mensagem,
      status: c.status, created_at: c.createdAt,
    })));
  }

  // Pw recoveries
  const pw = read<any>(STORAGE_KEYS.pwRecovery);
  if (pw.length) {
    await bulkUpsert('password_recoveries', pw.map(p => ({
      id: p.id, cnpj: p.cnpj, whatsapp: p.whatsapp ?? null,
      status: p.status, created_at: p.createdAt,
    })));
  }

  // NOTE: clients/leads contêm senhas plain em localStorage. Não criamos usuários
  // no auth.users automaticamente — o admin deve cadastrar via Auth do Supabase.
  // Aqui apenas marcamos a flag.

  localStorage.setItem(FLAG, '1');
  console.log('[migration] concluída.');
}
