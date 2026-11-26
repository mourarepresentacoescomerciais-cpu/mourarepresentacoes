import Papa from 'papaparse';

export function parsePriceRows(text: string): { code: string; price: number }[] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error('Arquivo CSV inválido. Confira separadores e aspas.');
  const [header, ...rows] = result.data;
  if (!header) return [];
  const normalized = header.map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, ''));
  const ci = normalized.findIndex(h => ['codigo', 'code', 'cod'].includes(h));
  const pi = normalized.findIndex(h => ['preco', 'price', 'valor'].includes(h));
  if (ci < 0 || pi < 0) throw new Error('O arquivo precisa das colunas codigo e preco.');
  return rows.flatMap(row => {
    const code = (row[ci] || '').trim();
    const raw = (row[pi] || '').trim().replace(/R\$|\s/g, '');
    const price = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
    return code && raw && Number.isFinite(price) && price >= 0 ? [{ code, price }] : [];
  });
}