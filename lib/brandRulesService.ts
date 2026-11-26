/**
 * Regras comerciais por empresa/marca (editáveis no admin).
 * Cache em memória para resposta imediata e persistência EXCLUSIVA no Supabase.
 */

import { upsertBrandRules, STORAGE_KEYS, cacheGet, cacheSet, persistBrandRules, loadBrandRulesToMemory } from './dataStore';

export interface BrandRules {
  policyText?: string;      // Política Comercial (popup ao selecionar marca)
  noticeText?: string;      // Aviso/Informativo (popup ao selecionar marca)
  minOrderValue?: number;   // Pedido mínimo
  minBoletoValue?: number;  // Boleto mínimo
  freightType?: string;     // (legado) CIF/FOB único
  freightTypes?: string[];  // Tipos de frete habilitados: ['CIF','FOB']
  freightCifValue?: number; // Valor do frete CIF (manual)
  freightFobValue?: number; // Valor do frete FOB (manual)
  freightFreeAbove?: number;// Valor mínimo do pedido para frete grátis (CIF)
  allowedTerms?: string[];  // Ex: ['à vista','28 dias','28/56 dias','28/56/84 dias']
  pixDiscountPct?: number;  // Desconto à vista
  paymentMethods?: string[];// Meios habilitados: ['A Vista','Boleto']
  boletoTerms?: string[];   // Dias do boleto (manual): ['28','28/56','28/56/84']
  logoUrl?: string;         // Logo customizada (data URL ou caminho)
}

const KEY = STORAGE_KEYS.brandRules;
const SESSION_SHOWN = 'moura_brand_rules_shown';

function getAll(): Record<string, BrandRules> {
  // Garante que as regras persistidas em localStorage estejam em memória
  // (evita que apareçam vazias logo após um reload, antes da revalidação).
  loadBrandRulesToMemory();
  return cacheGet<Record<string, BrandRules>>(KEY, {});
}
function saveAll(map: Record<string, BrandRules>) {
  cacheSet(KEY, map);
  persistBrandRules(map);
}

export const brandRulesService = {
  get(brand: string): BrandRules {
    return getAll()[brand] || {};
  },
  /** Todas as regras por marca (usado pela migração de imagens base64 -> Storage). */
  getAllRules(): Record<string, BrandRules> {
    return getAll();
  },
  set(brand: string, rules: BrandRules) {
    const all = getAll();
    all[brand] = { ...all[brand], ...rules };
    saveAll(all);
    // Retorna a Promise da gravação para que a UI possa aguardar a confirmação
    // antes de fechar (evita perder a regra se a tela for atualizada logo após).
    return upsertBrandRules(brand, all[brand]);
  },
  hasPopup(brand: string): boolean {
    const r = getAll()[brand];
    return !!(r && (r.policyText?.trim() || r.noticeText?.trim()));
  },
  markShown(brand: string) {
    try {
      const set = new Set(JSON.parse(sessionStorage.getItem(SESSION_SHOWN) || '[]'));
      set.add(brand);
      sessionStorage.setItem(SESSION_SHOWN, JSON.stringify([...set]));
    } catch {}
  },
  wasShown(brand: string): boolean {
    try {
      const set = new Set(JSON.parse(sessionStorage.getItem(SESSION_SHOWN) || '[]'));
      return set.has(brand);
    } catch { return false; }
  },
};

const GLOBAL_KEY = 'moura_global_texts_v1';
/** Marca-sentinela usada para persistir os textos globais na tabela brand_rules
 *  (evita criar uma tabela nova; o hydrate extrai esta linha para o GLOBAL_KEY). */
export const GLOBAL_TEXTS_BRAND = '__global_texts__';
export interface GlobalTexts { policyText?: string; noticeText?: string }

export const DEFAULT_GLOBAL_POLICY = `POLÍTICA COMERCIAL DE VENDAS

CORTAG
• Pedido mínimo: R$ 1.200,00
• Frete CIF incluso
• Boleto no valor mínimo de R$ 600,00
• Prazo de entrega: até 10 dias úteis

ILUMI
• Pedido mínimo: R$ 1.200,00
• Frete CIF incluso
• Boleto no valor mínimo de R$ 500,00
• Entrega rápida: até 10 dias úteis

CLAW MOTOBOMBAS
• Pedido mínimo: R$ 1.000,00
• Frete: R$ 150,00
• Pedidos acima de R$ 3.000,00 — Frete CIF
• Boleto no valor mínimo de R$ 750,00
• Prazo de entrega: até 6 dias úteis

PLASPOL
• Pedido mínimo: R$ 3.000,00
• Frete CIF incluso
• Prazo de entrega: até 15 dias úteis
• Boleto a combinar`;

export const DEFAULT_GLOBAL_NOTICE = `AVISO IMPORTANTE — CONFIDENCIALIDADE E SEGURANÇA

As informações disponibilizadas neste site são restritas e destinadas exclusivamente a clientes autorizados e previamente cadastrados.

É terminantemente proibido compartilhar, repassar, copiar, divulgar ou encaminhar a terceiros qualquer informação obtida através da plataforma, incluindo:
• tabelas de preços
• condições comerciais
• pedidos e orçamentos
• catálogos e materiais internos
• login e senha de acesso

Toda atividade realizada no sistema poderá ser monitorada e registrada. O uso indevido, compartilhamento não autorizado ou vazamento de informações comerciais poderá resultar em:
• bloqueio imediato do acesso
• cancelamento do cadastro
• suspensão de negociações comerciais
• responsabilização civil e medidas judiciais cabíveis

O usuário é integralmente responsável pela segurança e sigilo de suas credenciais de acesso.

Ao utilizar esta plataforma, o cliente declara estar ciente e de acordo com estas condições de confidencialidade e segurança.`;

export const globalTextsService = {
  get(): GlobalTexts {
    const saved = cacheGet<GlobalTexts>(GLOBAL_KEY, {});
    return {
      policyText: saved.policyText || DEFAULT_GLOBAL_POLICY,
      noticeText: saved.noticeText || DEFAULT_GLOBAL_NOTICE,
    };
  },
  set(t: GlobalTexts) {
    const cur = cacheGet<GlobalTexts>(GLOBAL_KEY, {});
    const merged = { ...cur, ...t };
    cacheSet(GLOBAL_KEY, merged);
    // Persiste no Supabase (linha-sentinela em brand_rules) para sincronizar entre dispositivos.
    void upsertBrandRules(GLOBAL_TEXTS_BRAND, merged);
  },
};

// ====================== PAGAMENTO POR MARCA ======================

export type PayMethod = 'A Vista' | 'Boleto' | 'Cheque';

export interface TermDef {
  label: string;
  installments: number;      // nº de parcelas (1 = à vista)
  minOrderValue?: number;    // pedido mínimo para liberar este prazo
  method?: PayMethod;        // restringe a um meio específico (ex: Plaspol cheque)
}

export interface BrandPaymentConfig {
  methods: PayMethod[];
  pixDiscountPct?: number;       // desconto A Vista
  minBoletoValue?: number;       // valor mínimo por parcela do boleto
  minOrderValue?: number;
  freightFixed?: number;         // valor fixo de frete (opção padrão)
  freightCifAbove?: number;      // se total >= este valor, frete vira CIF (0)
  freightOptions?: { type: string; value: number }[]; // CIF/FOB habilitados e seus valores
  terms: TermDef[];
}

const PAYMENT_CONFIGS: Record<string, BrandPaymentConfig> = {
  'Cortag': {
    methods: ['A Vista', 'Boleto'],
    pixDiscountPct: 2,
    minBoletoValue: 600,
    minOrderValue: 1200,
    terms: [
      { label: 'A Vista (2% Desconto)', installments: 1, method: 'A Vista' },
      { label: '14d', installments: 1, method: 'Boleto' },
      { label: '28d', installments: 1, method: 'Boleto' },
      { label: '28/56d', installments: 2, method: 'Boleto' },
      { label: '28/42/56d', installments: 3, method: 'Boleto' },
      { label: '28/56/84d', installments: 3, method: 'Boleto' },
      { label: '28/56/84/112d (Pedido acima 10 mil)', installments: 4, method: 'Boleto', minOrderValue: 10000 },
      { label: '42/56/70/84d (Pedido acima de 10 mil)', installments: 4, method: 'Boleto', minOrderValue: 10000 },
      { label: '42/56/70/84/112d (Pedido acima de 15 mil)', installments: 5, method: 'Boleto', minOrderValue: 15000 },
    ],
  },
  'Ilumi': {
    methods: ['A Vista', 'Boleto'],
    pixDiscountPct: 2,
    minBoletoValue: 500,
    minOrderValue: 1200,
    terms: [
      { label: 'A Vista (2% Desconto)', installments: 1, method: 'A Vista' },
      { label: '28d', installments: 1, method: 'Boleto' },
      { label: '28/56d', installments: 2, method: 'Boleto' },
      { label: '28/42/56d', installments: 3, method: 'Boleto' },
      { label: '28/56/84d', installments: 3, method: 'Boleto' },
      { label: '28/56/70/84d', installments: 4, method: 'Boleto' },
    ],
  },
  'Claw Motobombas': {
    methods: ['A Vista', 'Boleto'],
    pixDiscountPct: 3,
    minBoletoValue: 750,
    minOrderValue: 1000,
    freightFixed: 150,
    freightCifAbove: 3000,
    terms: [
      { label: 'A Vista (3% Desconto)', installments: 1, method: 'A Vista' },
      { label: '14d', installments: 1, method: 'Boleto' },
      { label: '28d', installments: 1, method: 'Boleto' },
      { label: '28/56d', installments: 2, method: 'Boleto' },
      { label: '28/42/56d', installments: 3, method: 'Boleto' },
      { label: '28/56/84d', installments: 3, method: 'Boleto' },
      { label: '28/56/70/84d', installments: 4, method: 'Boleto' },
      { label: '28/56/84/112d (Pedido acima 15 mil)', installments: 4, method: 'Boleto', minOrderValue: 15000 },
      { label: '28/56/84/112/140d (Pedido acima 20 mil)', installments: 5, method: 'Boleto', minOrderValue: 20000 },
    ],
  },
  'Plaspol': {
    methods: ['Boleto', 'Cheque'],
    minOrderValue: 3000,
    terms: [
      { label: '28/42d Boleto', installments: 2, method: 'Boleto' },
      { label: '56/70d Cheque', installments: 2, method: 'Cheque' },
    ],
  },
};

/** Mescla a config base com as Regras editadas no admin (brandRulesService). */
function mergedConfig(brand: string): BrandPaymentConfig | undefined {
  const base = PAYMENT_CONFIGS[brand];
  const rules = getAll()[brand];
  if (!base && !rules) return undefined;
  const cfg: BrandPaymentConfig = base
    ? { ...base, terms: [...base.terms] }
    : { methods: ['A Vista', 'Boleto'], terms: [] };
  if (rules) {
    if (rules.minOrderValue != null) cfg.minOrderValue = rules.minOrderValue;
    if (rules.minBoletoValue != null) cfg.minBoletoValue = rules.minBoletoValue;
    if (rules.pixDiscountPct != null) cfg.pixDiscountPct = rules.pixDiscountPct;

    // Meios de pagamento e prazos definidos manualmente no admin sobrescrevem a base.
    if (rules.paymentMethods?.length) {
      cfg.methods = rules.paymentMethods as PayMethod[];
      const terms: TermDef[] = [];
      if (rules.paymentMethods.includes('A Vista')) {
        terms.push({
          label: rules.pixDiscountPct ? `A Vista (${rules.pixDiscountPct}% Desconto)` : 'A Vista',
          installments: 1, method: 'A Vista',
        });
      }
      if (rules.paymentMethods.includes('Boleto')) {
        const defined = (rules.boletoTerms || []).map(d => (d || '').trim()).filter(Boolean);
        if (defined.length) {
          defined.forEach(clean => {
            terms.push({ label: clean, installments: clean.split('/').length, method: 'Boleto' });
          });
        } else {
          // Sem prazos definidos no admin: mantém os prazos base da empresa
          // (ex.: Cortag) para o cliente não ficar sem opção de Boleto.
          (base?.terms || []).filter(t => t.method === 'Boleto').forEach(t => terms.push(t));
        }
      }
      if (terms.length) cfg.terms = terms;
    }

    // Frete: tipos habilitados (CIF e/ou FOB) e seus valores manuais.
    const types = (rules.freightTypes && rules.freightTypes.length)
      ? rules.freightTypes
      : (rules.freightType ? [rules.freightType] : []);
    if (types.length) {
      cfg.freightOptions = types.map(t => ({
        type: t,
        value: t === 'CIF' ? (rules.freightCifValue ?? 0) : (rules.freightFobValue ?? 0),
      }));
      cfg.freightFixed = cfg.freightOptions[0].value;
      cfg.freightCifAbove = rules.freightFreeAbove != null ? rules.freightFreeAbove : undefined;
    } else if (rules.freightFreeAbove != null) {
      cfg.freightCifAbove = rules.freightFreeAbove;
    }
  }
  return cfg;
}

export const brandPaymentService = {
  get(brand: string): BrandPaymentConfig | undefined {
    return mergedConfig(brand);
  },
  /** Valida prazo selecionado vs total; retorna mensagem de erro ou null se ok */
  validate(brand: string, method: PayMethod, termLabel: string, orderTotal: number): string | null {
    const cfg = mergedConfig(brand);
    if (!cfg) return null;
    if (cfg.minOrderValue && orderTotal < cfg.minOrderValue) {
      return `Pedido mínimo para ${brand}: R$ ${cfg.minOrderValue.toLocaleString('pt-BR')}.`;
    }
    const term = cfg.terms.find(t => t.label === termLabel);
    if (!term) return 'Selecione um prazo de pagamento válido.';
    if (term.minOrderValue && orderTotal < term.minOrderValue) {
      return `Este prazo exige pedido acima de R$ ${term.minOrderValue.toLocaleString('pt-BR')}.`;
    }
    if (method === 'Boleto' && cfg.minBoletoValue) {
      const parcela = orderTotal / term.installments;
      if (parcela < cfg.minBoletoValue) {
        return `Boleto mínimo de R$ ${cfg.minBoletoValue.toLocaleString('pt-BR')} por parcela. Parcela atual: R$ ${parcela.toFixed(2)}.`;
      }
    }
    return null;
  },
  /** Tipos de frete habilitados (CIF/FOB) com seus valores. */
  freightOptions(brand: string): { type: string; value: number }[] {
    return mergedConfig(brand)?.freightOptions ?? [];
  },
  computeFreight(brand: string, total: number, freightType?: string): number {
    const cfg = mergedConfig(brand);
    if (!cfg) return 0;
    if (cfg.freightCifAbove && total >= cfg.freightCifAbove) return 0;
    if (cfg.freightOptions && cfg.freightOptions.length) {
      const opt = freightType
        ? cfg.freightOptions.find(o => o.type === freightType)
        : cfg.freightOptions[0];
      return opt?.value ?? 0;
    }
    if (!cfg.freightFixed) return 0;
    if (cfg.freightCifAbove && total >= cfg.freightCifAbove) return 0;
    return cfg.freightFixed;
  },
  computeDiscount(brand: string, method: PayMethod, subtotal: number): number {
    const cfg = mergedConfig(brand);
    if (!cfg || method !== 'A Vista' || !cfg.pixDiscountPct) return 0;
    return +(subtotal * cfg.pixDiscountPct / 100).toFixed(2);
  },
};
