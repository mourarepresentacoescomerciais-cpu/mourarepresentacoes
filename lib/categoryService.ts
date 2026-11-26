import type { Category } from './types';
import { upsertRow, deleteRow, syncCompanies, removeCompanyDB, setCompanyActiveDB, updateCompanyMetaDB, renameCompanyDB, STORAGE_KEYS, getCachedRows, setCachedRows, cacheGet, cacheSet, persistCompanyMeta } from './dataStore';

const STORAGE_KEY = STORAGE_KEYS.categories;
const COMPANIES_KEY = STORAGE_KEYS.companies;

const CORTAG_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Cortadores Manuais', brand: 'Cortag', icon: '🔪', active: true, subcategories: ['Linha Mega', 'Linha Prime', 'New Master 125', 'Linha New Master', 'Linha Super', 'Linha Master', 'Top 62', 'Linha PEC', 'Linha HD G2', 'Cortador HD 150', 'KIT Mosaico', 'Cortador de Blocos', 'Cortadores de Telhas', 'Cortadores de Laminados', 'Bancada de Trabalho', 'Cortador Infinity', 'Cortador Infinity Plus', 'Sistema de Movimentação', 'Sistema de Transporte', 'Carrinho Transporte', 'Bancada Infinity', 'Acessórios'] },
  { name: 'Cortadores Elétricos', brand: 'Cortag', icon: '⚡', active: true, subcategories: ['Zapp Titan', 'Zapp G2', 'Zapp Fit', 'Zapp 600', 'Zapp 180BR', 'Acessórios'] },
  { name: 'Grandes Formatos', brand: 'Cortag', icon: '📐', active: true, subcategories: [] },
  { name: 'Sistema de Nivelamento', brand: 'Cortag', icon: '📏', active: true, subcategories: ['Mini Cunha', 'Tradicional', 'Smart', 'ECO', 'Slim', 'Easy Spim', 'Supra', 'Cunha Larga Tradicional', 'Cunha Larga ECO', 'Cunha Slim', 'Porca Easy Spim', 'Base Proteção Easy Spim', 'Alicate para Nivelamento', 'Cantoneira Niveladora', 'Espaçadores Duplos', 'Espaçadores Tipo U', 'Espaçadores Junta Piso', 'Espaçador Bloco de Vidro', 'Junta Dilatação', 'Espaçadores Ferragens', 'Cadeirinha', 'Protetor para Vergalão', 'Acessórios e Rodeis'] },
  { name: 'Transferidor de Perfil', brand: 'Cortag', icon: '📏', active: true, subcategories: [] },
  { name: 'Disco para Madeira', brand: 'Cortag', icon: '🪵', active: true, subcategories: [] },
  { name: 'Gabaritos Angulares', brand: 'Cortag', icon: '📐', active: true, subcategories: [] },
  { name: 'Lâmina Serra Circular', brand: 'Cortag', icon: '🔄', active: true, subcategories: [] },
  { name: 'Balde', brand: 'Cortag', icon: '🪣', active: true, subcategories: [] },
  { name: 'Base para Corte 45°', brand: 'Cortag', icon: '📐', active: true, subcategories: [] },
  { name: 'Masseira', brand: 'Cortag', icon: '🧱', active: true, subcategories: [] },
  { name: 'Acessórios para Assentamento', brand: 'Cortag', icon: '🧱', active: true, subcategories: [] },
  { name: 'Protetor de Piso', brand: 'Cortag', icon: '🛡️', active: true, subcategories: [] },
  { name: 'Diamantados', brand: 'Cortag', icon: '💎', active: true, subcategories: ['Diamantado Contínuo', 'Diamantado Turbo', 'Diamantado Segmentado', 'Segmentado Concreto e Asfalto', 'Super Metal', 'Disco Tungstênio', 'Diamantado para Corte e Desbaste'] },
  { name: 'Ventosas', brand: 'Cortag', icon: '🔘', active: true, subcategories: ['Ventosa Manual', 'Ventosa Bateria', 'Ventosa com Manômetro', 'Ventosa Articulada', 'Ventosa Niveladora'] },
  { name: 'Porcelanato', brand: 'Cortag', icon: '🏗️', active: true, subcategories: ['Porcelanato Corte 45°', 'Porcelanato e Vidro', 'Porcelanato Dureza Elevada'] },
  { name: 'Aplicadores e Raspadores', brand: 'Cortag', icon: '🔧', active: true, subcategories: ['Aplicadores de Silicone', 'Riscadores de Fórmica', 'Batedor para Argamassa', 'Raspador Argamassa', 'Raspador Rejunte', 'Lâmina para Raspador'] },
  { name: 'Ferramentas e Acessórios', brand: 'Cortag', icon: '🛠️', active: true, subcategories: ['Lima Tungstênio', 'Aplicador Argamassa', 'Suportes Niveladores', 'Bloco Espuma', 'Joelheiras', 'Espátula', 'Espátula Desempenadeira', 'Espátula Profissional', 'Espátula Lisa'] },
  { name: 'Medidores e Polimento', brand: 'Cortag', icon: '✨', active: true, subcategories: ['Medidor de Contorno', 'Esponja Diamantada', 'Disco de Polimento Seco/Úmido', 'Disco de Polimento 4 Passos', 'Polimento BUFF', 'Disco Flexível Diamantado', 'Disco Flap Diamantado', 'Suporte para Disco Polimento'] },
  { name: 'Fresas', brand: 'Cortag', icon: '⚙️', active: true, subcategories: ['Fresas Diamantadas'] },
  { name: 'Tesouras', brand: 'Cortag', icon: '✂️', active: true, subcategories: [] },
  { name: 'Perfuração', brand: 'Cortag', icon: '🔩', active: true, subcategories: ['Serra Copo para Furadeira', 'Serra Copo para Esmerilhadeira', 'Serra Copo Alvenaria com Haste', 'Serra Copo', 'Serra Copo Bimetálica', 'Serra Copo Madeira', 'Jogo Serra Copo Madeira', 'Hastes', 'Broca Diamantada', 'Broca Multiuso', 'Broca para Vidro', 'Broca para Concreto', 'Broca para Concreto SDS', 'Jogo Broca Concreto', 'Broca Chata Madeira', 'Broca Madeira 3 Pontas', 'Broca Mourão e Fibrocimento', 'Broca Escalonada para Telhas', 'Broca Escalonada para Metal', 'Broca Aço Rápido', 'Jogo Broca Aço Rápido', 'Ponteiro SDS', 'Talhadeira SDS'] },
  { name: 'Abrasivos', brand: 'Cortag', icon: '🪨', active: true, subcategories: ['Disco Strip', 'Disco Corte Inox', 'Disco Corte Ferro', 'Disco Desbaste para Metais', 'Disco Flap Cerâmica', 'Disco Flap Metais', 'Disco Flap Inox', 'Lixa Ferro', 'Lixa Madeira', 'Lixa Massa', 'Lixa Dágua', 'Suporte Manual de Lixa'] },
  { name: 'Ferramentas Manuais', brand: 'Cortag', icon: '🔨', active: true, subcategories: ['Passador de Fios', 'Alicate Rebitador', 'Cabeçote Rebitador', 'Arco de Serra', 'Lâmina de Serra', 'Serrote', 'Martelo Pedreiro', 'Martelo Unha', 'Marretas', 'Alicates', 'Lápis Carpinteiro', 'Estiletes', 'Talhadeiras', 'Ponteiros', 'Chave Lavatório', 'Torquês', 'Grampeador', 'Chave Ajustável', 'Alavanca', 'Grampo Sargento', 'Chave fenda', 'Chave Fenda Cruzada', 'Jogo de Chaves de Fenda e Cruzada'] },
  { name: 'Desempenadeiras', brand: 'Cortag', icon: '🧹', active: true, subcategories: ['Cabo Removível Inox', 'Assentamento de Pisos', 'Cabo Aberto Emborrachado Inox', 'Cabo Aberto Emborrachado Aço', 'Efeitos Decorativos Emborrachado Inox', 'Especiais Emborrachado Aço', 'Cabo Fechado Emborrachado Aço', 'Cabo Aberto Plástico Aço', 'Cabo Fechado Plástico Inox', 'Cabo Fechado Plástico Aço', 'Cabo Fechado Madeira Aço'] },
  { name: 'Colheres de Pedreiro', brand: 'Cortag', icon: '🔧', active: true, subcategories: ['Cabo Emborrachado', 'Cabo de Madeira', 'Cabo Plástico', 'Colher Para Azulejista'] },
  { name: 'Ferramentas Elétricas', brand: 'Cortag', icon: '🔌', active: true, subcategories: ['Misturadores', 'Máquina de Assentar Piso', 'Desempenadeira', 'Cortador Oscilante', 'Acessórios'] },
  { name: 'Medição', brand: 'Cortag', icon: '📏', active: true, subcategories: ['Nível Laser', 'Trenas a Laser', 'Trenas ABS', 'Fitas em Fibra de Vidro', 'Fitas de Aço', 'Paquímetros', 'Esquadros', 'Nível', 'Nível de Água', 'Prumos', 'Carretéis de Linha com Giz', 'Linha Pedreiro', 'Rejunte'] },
  { name: 'Carrinho de Mão', brand: 'Cortag', icon: '🛒', active: true, subcategories: ['Carrinho de Mão 45L', 'Carrinho de Mão 50L', 'Carrinho de Mão 65L', 'Acessórios', 'Cinto em Lona'] },
  { name: 'Caixa para Ferramenta', brand: 'Cortag', icon: '🧰', active: true, subcategories: ['Caixa Plástica', 'Maletas Plásticas', 'Organizadores Plásticos', 'Bolsa em Lona'] },
  { name: 'Fitas', brand: 'Cortag', icon: '🎗️', active: true, subcategories: ['Isolante', 'Crepe', 'Acrílica', 'Veda Rosca', 'Crepe Azulejista'] },
  { name: 'Cordas', brand: 'Cortag', icon: '🪢', active: true, subcategories: ['Corda Multiuso', 'Corda Trançada', 'Corda Trançada Preta', 'Corda Trançada Branca', 'Corda Trançada Vermelha', 'Corda pra Sinalização', 'Extensores Elásticos'] },
  { name: 'Utilidades', brand: 'Cortag', icon: '🔧', active: true, subcategories: ['Mangueira Jardim', 'Mangueira Multiuso', 'Saco de Ráfia', 'Maçarico Lança Chamas', 'Fibra Anti Trinca'] },
  { name: 'Limpeza', brand: 'Cortag', icon: '🧹', active: true, subcategories: ['Limpador Pós Obra', 'Limpador para Porcelanato', 'Limpador Universal', 'Escovas cabo Plástico', 'Escovas Cabo Madeira', 'Jogo Escovas', 'Fibras Sintéticas'] },
  { name: 'Selantes', brand: 'Cortag', icon: '🧴', active: true, subcategories: ['PU 40', 'PU Fixa Tudo', 'Espuma Expansiva', 'Veda Calha', 'Silicone', 'Vaselina Spray', 'Cola Madeira'] },
  { name: 'Drywall', brand: 'Cortag', icon: '🏗️', active: true, subcategories: ['Alicate Puncionador', 'Raspador', 'Espátulas'] },
];

const DEFAULT_COMPANIES = ['Cortag', 'Ilumi', 'Claw Motobombas', 'Plaspol'];

function getSeed(): Category[] {
  return CORTAG_CATEGORIES.map((cat, i) => ({
    ...cat,
    id: `cat-${i + 1}`,
  }));
}

function getAll(): Category[] {
  // Fonte única: Supabase (cache em memória hidratado no boot).
  // O seed (CORTAG_CATEGORIES) só é usado em resetToDefault() — ação manual do admin.
  const cached = getCachedRows<Category>(STORAGE_KEY);
  if (cached) {
    // Migra formato antigo (sem 'brand') para o seed atual.
    if (cached.length > 0 && !('brand' in cached[0])) {
      const seed = getSeed();
      saveAll(seed);
      return seed;
    }
    return cached;
  }
  return [];
}

function saveAll(cats: Category[]) {
  setCachedRows(STORAGE_KEY, cats);
}

function getCompanies(): string[] {
  const cached = getCachedRows<string>(COMPANIES_KEY);
  // Fallback para os padrões quando o cache está vazio OU nulo, evitando que a
  // lista de empresas "suma" caso uma hidratação anterior tenha gravado [].
  if (!cached || cached.length === 0) return DEFAULT_COMPANIES;
  return cached;
}

function saveCompanies(companies: string[]) {
  setCachedRows(COMPANIES_KEY, companies);
}

export const categoryService = {
  getAll(): Category[] {
    return getAll();
  },

  getActive(): Category[] {
    return getAll().filter(c => c.active);
  },

  getByBrand(brand: string): Category[] {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    return getAll().filter(c => c.active && norm(c.brand) === norm(brand)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  /** Define a ordem completa dos subgrupos de uma categoria (drag and drop). */
  setSubcategoriesOrder(brand: string, categoryName: string, orderedSubs: string[]): void {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const all = getAll();
    const idx = all.findIndex(c => norm(c.brand) === norm(brand) && norm(c.name) === norm(categoryName));
    if (idx < 0) return;
    all[idx] = { ...all[idx], subcategories: orderedSubs };
    saveAll(all);
    void upsertRow('categories', all[idx]);
  },

  add(data: Omit<Category, 'id'>): Category {
    const all = getAll();
    const maxOrder = all.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
    const cat: Category = { ...data, id: crypto.randomUUID(), order: data.order ?? maxOrder + 1 };
    all.push(cat); saveAll(all);
    void upsertRow('categories', cat);
    return cat;
  },

  update(id: string, data: Partial<Category>): void {
    const all = getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...data }; saveAll(all); void upsertRow('categories', all[idx]); }
  },

  remove(id: string): void {
    saveAll(getAll().filter(c => c.id !== id));
    void deleteRow('categories', id);
  },

  getSubcategories(categoryName: string): string[] {
    const cat = getAll().find(c => c.name === categoryName);
    return cat?.subcategories || [];
  },

  getSubcategoriesByBrand(brand: string, categoryName: string): string[] {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const cat = getAll().find(c => norm(c.brand) === norm(brand) && norm(c.name) === norm(categoryName));
    return cat?.subcategories || [];
  },

  /** Reordena um subgrupo dentro da categoria (igual aos produtos). */
  reorderSubcategory(brand: string, categoryName: string, sub: string, dir: -1 | 1): void {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const all = getAll();
    const idx = all.findIndex(c => norm(c.brand) === norm(brand) && norm(c.name) === norm(categoryName));
    if (idx < 0) return;
    const subs = [...(all[idx].subcategories || [])];
    let i = subs.findIndex(s => norm(s) === norm(sub));
    if (i < 0) { subs.push(sub); i = subs.length - 1; }
    const j = i + dir;
    if (j < 0 || j >= subs.length) { all[idx] = { ...all[idx], subcategories: subs }; saveAll(all); void upsertRow('categories', all[idx]); return; }
    [subs[i], subs[j]] = [subs[j], subs[i]];
    all[idx] = { ...all[idx], subcategories: subs };
    saveAll(all);
    void upsertRow('categories', all[idx]);
  },

  resetToDefault(): void {
    const seed = getSeed();
    saveAll(seed);
    seed.forEach(c => { void upsertRow('categories', c); });
  },

  getCompanies(): string[] { return getCompanies(); },

  addCompany(name: string): void {
    const companies = getCompanies();
    if (!companies.includes(name)) {
      companies.push(name); saveCompanies(companies);
      void syncCompanies(companies);
    }
  },

  /** Salva a ordem completa das empresas (drag and drop) e persiste no banco. */
  async setCompaniesOrder(ordered: string[]): Promise<boolean> {
    saveCompanies(ordered);
    return await syncCompanies(ordered) !== false;
  },

  removeCompany(name: string): void {
    const companies = getCompanies().filter(c => c !== name);
    saveCompanies(companies);
    void removeCompanyDB(name);
  },

  getInactiveCompanies(): string[] {
    return cacheGet<string[]>('moura_inactive_companies', []);
  },
  isCompanyActive(name: string): boolean {
    return !this.getInactiveCompanies().includes(name);
  },
  async setCompanyActive(name: string, active: boolean): Promise<boolean> {
    const list = this.getInactiveCompanies().filter(c => c !== name);
    if (!active) list.push(name);
    cacheSet('moura_inactive_companies', list);
    return await setCompanyActiveDB(name, active) !== false;
  },

  getCompanyMeta(name: string): { description?: string; logoUrl?: string } {
    const all = cacheGet<Record<string, { description?: string; logoUrl?: string }>>('moura_company_meta', {});
    return all[name] || {};
  },

  async updateCompanyMeta(name: string, meta: { description?: string; logoUrl?: string }): Promise<boolean> {
    const all = { ...cacheGet<Record<string, { description?: string; logoUrl?: string }>>('moura_company_meta', {}) };
    all[name] = { ...all[name], ...meta };
    persistCompanyMeta(all);
    return await updateCompanyMetaDB(name, meta) !== false;
  },

  /** Renomeia a empresa na lista e metadados. O cascateamento de marca em
   *  categorias/produtos/lançamentos/catálogos é feito pelo chamador. */
  renameCompany(oldName: string, newName: string): void {
    const companies = getCompanies().map(c => (c === oldName ? newName : c));
    saveCompanies(companies);
    // Move os metadados para o novo nome.
    const meta = { ...cacheGet<Record<string, { description?: string; logoUrl?: string }>>('moura_company_meta', {}) };
    if (meta[oldName]) { meta[newName] = meta[oldName]; delete meta[oldName]; persistCompanyMeta(meta); }
    // Preserva o status de inatividade.
    const inactive = cacheGet<string[]>('moura_inactive_companies', []).map(c => (c === oldName ? newName : c));
    cacheSet('moura_inactive_companies', inactive);
    void renameCompanyDB(oldName, newName);
  },
};
