export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCNPJ(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Progressive CNPJ mask while user types: 00.000.000/0000-00 */
export function formatCNPJMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCNPJ(value: string): boolean {
  return value.replace(/\D/g, '').length === 14;
}

/** Progressive phone mask: (00) 00000-0000 or (00) 0000-0000 */
export function formatPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function isValidPhone(value: string): boolean {
  const d = value.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function parseCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
