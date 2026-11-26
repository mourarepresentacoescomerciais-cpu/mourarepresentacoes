/**
 * Migração de imagens base64 (legado) -> Supabase Storage.
 *
 * Histórico: logos de empresas (companies.logo_url) e imagens de produtos
 * (products.image) eram salvas como data URLs base64. Isso inflava cada linha
 * carregada no bootstrap público (egress alto, dezenas de KB por registro).
 *
 * Esta rotina roda UMA vez (admin), detecta valores `data:` ainda presentes em
 * memória, faz upload para o Storage e regrava APENAS a URL pública. Nada é
 * apagado de forma destrutiva: a coluna apenas passa de base64 para URL.
 */
import { adminStorage } from './secureDb';
import { categoryService } from './categoryService';
import { productService } from './productService';
import { brandRulesService } from './brandRulesService';
import { launchService } from './launchService';
import { cacheGet } from './dataStore';

const MIGRATION_FLAG = 'moura_base64_images_migrated_v5';

export function isDataUrl(v?: string | null): boolean {
  return typeof v === 'string' && v.startsWith('data:');
}

/** Converte uma data URL (base64) em Blob para upload. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mime = /data:([^;]+);/.exec(header)?.[1] || 'image/png';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Envia um blob ao Storage (bucket `catalogs`) e devolve a URL pública. */
export async function uploadImageBlob(blob: Blob, folder: string, ext = 'png'): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const storage = adminStorage();
  const { error } = await storage.from('catalogs').upload(path, blob, {
    cacheControl: '31536000',
    upsert: true,
    contentType: blob.type || 'image/png',
  });
  if (error) throw error;
  const { data } = storage.from('catalogs').getPublicUrl(path);
  return data.publicUrl;
}

/** Upload de logo de empresa (a partir de um Blob já comprimido). */
export async function uploadCompanyLogo(blob: Blob, ext = 'png'): Promise<string> {
  return uploadImageBlob(blob, 'companies', ext);
}

/**
 * Migra imagens base64 legadas (produtos + logos de empresas) para o Storage.
 * Idempotente e gated por flag — só processa registros que ainda têm `data:`.
 */
let migrationInFlight: Promise<{ products: number; logos: number; categories: number; brandLogos: number; launches: number }> | null = null;

export async function migrateLegacyBase64Images(isAdmin: boolean): Promise<{ products: number; logos: number; categories: number; brandLogos: number; launches: number }> {
  const empty = { products: 0, logos: 0, categories: 0, brandLogos: 0, launches: 0 };
  if (!isAdmin) return empty;
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return empty;
  // Evita varreduras concorrentes/repetidas (CPU): reusa a execução em andamento.
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = runMigration();
  try { return await migrationInFlight; } finally { migrationInFlight = null; }
}

async function runMigration(): Promise<{ products: number; logos: number; categories: number; brandLogos: number; launches: number }> {
  const result = { products: 0, logos: 0, categories: 0, brandLogos: 0, launches: 0 };

  // ---- Produtos com image base64 ----
  try {
    const products = productService.getProducts().filter(p => isDataUrl(p.image));
    for (const p of products) {
      const blob = dataUrlToBlob(p.image as string);
      if (!blob) continue;
      try {
        const url = await uploadImageBlob(blob, 'products', 'jpg');
        productService.updateProduct(p.id, { image: url });
        result.products++;
      } catch (e) {
        console.warn('[migrateBase64 product]', p.id, e);
      }
    }
  } catch (e) {
    console.warn('[migrateBase64 products]', e);
  }

  // ---- Logos de empresas base64 ----
  try {
    const companies = categoryService.getCompanies();
    for (const name of companies) {
      const meta = categoryService.getCompanyMeta(name);
      if (!isDataUrl(meta.logoUrl)) continue;
      const blob = dataUrlToBlob(meta.logoUrl as string);
      if (!blob) continue;
      try {
        const url = await uploadCompanyLogo(blob, 'png');
        await categoryService.updateCompanyMeta(name, { logoUrl: url });
        result.logos++;
      } catch (e) {
        console.warn('[migrateBase64 logo]', name, e);
      }
    }
  } catch (e) {
    console.warn('[migrateBase64 logos]', e);
  }

  // ---- Imagens de categorias base64 ----
  try {
    const categories = categoryService.getAll().filter(c => isDataUrl(c.iconUrl));
    for (const c of categories) {
      const blob = dataUrlToBlob(c.iconUrl as string);
      if (!blob) continue;
      try {
        const url = await uploadImageBlob(blob, 'categories', 'png');
        categoryService.update(c.id, { iconUrl: url });
        result.categories++;
      } catch (e) {
        console.warn('[migrateBase64 category]', c.id, e);
      }
    }
  } catch (e) {
    console.warn('[migrateBase64 categories]', e);
  }

  // ---- Logo customizada em brand_rules (logoUrl base64) ----
  try {
    const all = brandRulesService.getAllRules();
    for (const brand of Object.keys(all)) {
      const rules = all[brand];
      if (!isDataUrl(rules?.logoUrl)) continue;
      const blob = dataUrlToBlob(rules.logoUrl as string);
      if (!blob) continue;
      try {
        const url = await uploadImageBlob(blob, 'brand-logos', 'png');
        brandRulesService.set(brand, { logoUrl: url });
        result.brandLogos++;
      } catch (e) {
        console.warn('[migrateBase64 brandLogo]', brand, e);
      }
    }
  } catch (e) {
    console.warn('[migrateBase64 brandLogos]', e);
  }

  // ---- Imagens de lançamentos (carrossel da home) base64 ----
  // Cada lançamento base64 pesava ~150–210KB e era baixado por TODO visitante
  // na home, deixando o carregamento lento. Migra para URL curta do Storage.
  try {
    const launches = launchService.getAllAdmin().filter(l => isDataUrl(l.imageUrl));
    for (const l of launches) {
      const blob = dataUrlToBlob(l.imageUrl as string);
      if (!blob) continue;
      try {
        const url = await uploadImageBlob(blob, 'launches', 'jpg');
        launchService.update(l.id, { imageUrl: url });
        result.launches++;
      } catch (e) {
        console.warn('[migrateBase64 launch]', l.id, e);
      }
    }
  } catch (e) {
    console.warn('[migrateBase64 launches]', e);
  }

  // Só marca a migração como concluída depois que as capas de categorias já
  // foram carregadas; antes disso elas não existem no cache principal e ficavam
  // para sempre em base64, causando delay no cliente e sumiço no admin.
  if (cacheGet<boolean>('moura_category_icons_loaded', false)) {
    localStorage.setItem(MIGRATION_FLAG, '1');
  }
  if (result.products || result.logos || result.categories || result.brandLogos || result.launches) {
    console.log(`[migrateBase64] migrados: ${result.products} produto(s), ${result.logos} logo(s), ${result.categories} categoria(s), ${result.brandLogos} logo(s) de marca, ${result.launches} lançamento(s).`);
  }
  return result;
}
