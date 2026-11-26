import type { Catalog } from './types';
import { upsertRow, deleteRow, STORAGE_KEYS, getCachedRows, setCachedRows } from './dataStore';
import { adminStorage } from './secureDb';

/**
 * Devolve uma versão LEVE/redimensionada da capa para exibição na tela.
 * As capas enviadas podem ter dezenas de megapixels (ex.: 7944x11332 = 90 MP),
 * o que TRAVA o navegador ao decodificar. Servimos por um proxy de imagem que
 * redimensiona no servidor, entregando ~600px (poucos KB) em vez do arquivo bruto.
 */
export function catalogCoverThumb(url?: string, width = 600): string {
  if (!url) return '';
  // Só passa pelo proxy quando for uma URL http(s) pública.
  if (!/^https?:\/\//i.test(url)) return url;
  const stripped = url.replace(/^https?:\/\//i, '');
  return `https://images.weserv.nl/?url=ssl:${encodeURIComponent(stripped)}&w=${width}&q=72&output=jpg`;
}

/**
 * Reduz uma imagem de capa antes do upload, evitando arquivos gigantes
 * (decompression bombs) que travam o navegador ao serem exibidos.
 */
async function downscaleCover(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', quality),
    );
    return blob ?? file;
  } catch (e) {
    console.warn('[catalog] não foi possível redimensionar a capa, enviando original:', e);
    return file;
  }
}

/**
 * Envia um arquivo (PDF ou imagem de capa) para o Storage do Supabase e
 * devolve a URL pública. Evita salvar base64 gigante no banco/localStorage
 * (que estourava a cota do navegador e impedia o download dos catálogos).
 */
export async function uploadCatalogFile(file: File, kind: 'pdf' | 'cover'): Promise<string> {
  const ext = kind === 'pdf'
    ? (file.name.split('.').pop() || 'pdf').toLowerCase()
    : 'jpg';
  const path = `${kind}/${crypto.randomUUID()}.${ext}`;

  // Capas são comprimidas/redimensionadas para evitar arquivos gigantes que
  // travam o navegador. PDFs vão sem alteração.
  const source: Blob = kind === 'cover' ? await downscaleCover(file) : file;
  const contentType = kind === 'pdf'
    ? (file.type || 'application/pdf')
    : 'image/jpeg';

  // Lê os bytes reais do arquivo ANTES de enviar. Isso evita que a camada de
  // rede do ambiente de desenvolvimento substitua o corpo da requisição pelo index.html
  // (o que gerava PDFs corrompidos contendo HTML em vez do documento).
  const buffer = await source.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Validação de integridade: um PDF válido começa com "%PDF".
  if (kind === 'pdf') {
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (!header.startsWith('%PDF')) {
      throw new Error('O arquivo selecionado não é um PDF válido. Selecione novamente o arquivo PDF.');
    }
  }

  console.log(`[catalog] enviando ${kind} (${bytes.byteLength} bytes) para Storage…`);
  const storage = adminStorage();
  const blob = new Blob([bytes], { type: contentType });
  const { error } = await storage.from('catalogs').upload(path, blob, {
    cacheControl: '31536000',
    upsert: true,
    contentType,
  });
  if (error) {
    console.error('[catalog] erro ao salvar no Storage:', error);
    throw error;
  }

  const { data } = storage.from('catalogs').getPublicUrl(path);

  // Confirma que o que ficou salvo é realmente o documento (e não HTML).
  if (kind === 'pdf') {
    try {
      const check = await fetch(data.publicUrl, { cache: 'no-store' });
      const head = (await check.text()).slice(0, 5);
      if (!head.startsWith('%PDF')) {
        await storage.from('catalogs').remove([path]);
        throw new Error('Falha de upload: o arquivo salvo ficou corrompido. Tente novamente pelo site publicado.');
      }
    } catch (e) {
      console.warn('[catalog] não foi possível verificar o PDF salvo:', e);
    }
  }

  console.log('[catalog] salvo com sucesso:', data.publicUrl);
  return data.publicUrl;
}

const STORAGE_KEY = STORAGE_KEYS.catalogs;

function getAll(): Catalog[] {
  // Fonte única: Supabase (cache em memória hidratado no boot). Sem mock/seed.
  return getCachedRows<Catalog>(STORAGE_KEY) ?? [];
}
function saveAll(items: Catalog[]) {
  setCachedRows(STORAGE_KEY, items);
}

export const catalogService = {
  getActive(): Catalog[] { return getAll().filter(c => c.active).sort((a, b) => a.order - b.order); },
  getAllAdmin(): Catalog[] { return [...getAll()].sort((a, b) => a.order - b.order); },


  async add(data: Omit<Catalog, 'id'>): Promise<Catalog> {
    const item: Catalog = { ...data, id: crypto.randomUUID() };
    const all = getAll(); all.push(item); saveAll(all);
    // Aguarda a gravação no banco ANTES de qualquer refetch para evitar que uma
    // revalidação do servidor (ainda sem a nova linha) sobrescreva o cache e o
    // item "suma" até recarregar a tela 2x.
    await upsertRow('catalogs', item);
    return item;
  },
  async update(id: string, data: Partial<Catalog>) {
    const all = getAll(); const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); await upsertRow('catalogs', all[idx]); }
  },
  async remove(id: string) {
    saveAll(getAll().filter(c => c.id !== id));
    // Aguarda a exclusão no banco ANTES de qualquer refetch, senão uma
    // revalidação do servidor (ainda com a linha) traz o item de volta.
    await deleteRow('catalogs', id);
  },
};
