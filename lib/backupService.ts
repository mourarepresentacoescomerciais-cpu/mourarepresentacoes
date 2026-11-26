/**
 * Backup de produtos em CSV + lembrete periódico.
 *
 * - Alerta padrão a cada 15 dias (configurável).
 * - Modo automático opcional: ao abrir o painel admin, se o período venceu,
 *   o CSV é baixado sozinho e a data é registrada.
 */
import { productService } from './productService';

const SETTINGS_KEY = 'moura_backup_settings';

export interface BackupSettings {
  /** Baixar automaticamente quando o período vencer. */
  auto: boolean;
  /** Período em dias entre backups/alertas. */
  intervalDays: number;
  /** ISO da data do último backup baixado. */
  lastBackupAt: string | null;
}

const DEFAULTS: BackupSettings = { auto: false, intervalDays: 15, lastBackupAt: null };

function read(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BackupSettings>;
    return {
      auto: !!parsed.auto,
      intervalDays: Number(parsed.intervalDays) > 0 ? Number(parsed.intervalDays) : DEFAULTS.intervalDays,
      lastBackupAt: parsed.lastBackupAt ?? null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(s: BackupSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage cheio */ }
}

function buildCsv(): string {
  const products = productService.getProducts();
  const header = [
    'empresa', 'categoria', 'subcategoria', 'codigo', 'nome', 'descricao', 'preco',
    'qtd_minima', 'qtd_embalagem', 'foto_url', 'ipi', 'st', 'promocao', 'novo', 'ativo',
    'espessura', 'combinacao_sku', 'combinacao_preco',
  ];
  const rows: string[][] = [header];
  const num = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));
  products.forEach((p: any) => {
    const base = [
      p.brand || '', String(p.category || ''), p.subcategory || '', p.code || '', p.name || '',
      p.description || '', num(p.price), num(p.minQty), num(p.packQty), p.image || '',
      num(p.ipiRate), num(p.stRate), p.isPromo ? 'sim' : 'nao', p.isNew ? 'sim' : 'nao',
      p.active ? 'sim' : 'nao', p.thickness || '',
    ];
    const combos = p.combinations || [];
    if (combos.length === 0) {
      rows.push([...base, '', '']);
    } else {
      combos.forEach((c: any) => rows.push([...base, c.sku || '', c.price != null ? num(c.price) : '']));
    }
  });
  return rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
}

export const backupService = {
  getSettings: read,

  saveSettings(patch: Partial<BackupSettings>): BackupSettings {
    const next = { ...read(), ...patch };
    if (!(next.intervalDays > 0)) next.intervalDays = DEFAULTS.intervalDays;
    write(next);
    return next;
  },

  /** Dias desde o último backup (null se nunca houve). */
  daysSinceLast(): number | null {
    const { lastBackupAt } = read();
    if (!lastBackupAt) return null;
    const diff = Date.now() - new Date(lastBackupAt).getTime();
    return Math.floor(diff / 86400000);
  },

  /** Está na hora de fazer backup? */
  isDue(): boolean {
    const s = read();
    if (!s.lastBackupAt) return true;
    const days = this.daysSinceLast();
    return days == null || days >= s.intervalDays;
  },

  /** Gera e baixa o CSV, registrando a data. */
  download(): number {
    const csv = buildCsv();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-produtos-moura-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    write({ ...read(), lastBackupAt: new Date().toISOString() });
    return productService.getProducts().length;
  },

  /** Adia o alerta por 1 dia (sem marcar backup feito). */
  snooze() {
    const s = read();
    const base = new Date();
    base.setDate(base.getDate() - Math.max(0, s.intervalDays - 1));
    write({ ...s, lastBackupAt: base.toISOString() });
  },
};
