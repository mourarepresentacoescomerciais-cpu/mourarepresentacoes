import type { OrderItem } from './types';

// Moeda no PDF: SEMPRE 2 casas decimais (ex.: R$ 21,23).
function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

import { brandPaymentService } from './brandRulesService';
import { productService } from './productService';

interface PdfOrderData {
  type: 'pedido' | 'orcamento';
  brand: string;
  clientName: string;
  clientCnpj: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  clientPhone?: string;
  items: OrderItem[];
  total: number;
  freight?: number;
  ipi?: number;
  paymentMethod: string;
  paymentTerm: string;
  observations?: string;
  purchaseOrder?: string;
  invoiceNote?: string;
  buyer?: string;
  orderNumber?: string;
  hidePrices?: boolean;
  status?: string;
  representative?: string;
  createdAt?: string;
}

function pad(n: number) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fmtTime(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function num(n?: string) { return (n || '').replace(/^#/, ''); }
function esc(s?: string) { return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string)); }
function assetUrl(src?: string) {
  if (!src) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(src)) return src;
  try { return new URL(src, window.location.origin).href; } catch { return src; }
}

function productImage(item: OrderItem) {
  if (item.image) return item.image;
  const product = productService.getProducts().find(p => p.id === item.productId || p.code === item.code);
  return product?.image || '';
}

const LOGO_URL = `${window.location.origin}/moura-logo-pdf.png`;
const SIGNATURE_URL = `${window.location.origin}/moura-signature.png`;
const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent('https://wa.me/5551991997522');
const WATERMARK_URL = `${window.location.origin}/moura-watermark.png`;

// Uploaded PNG icons (placed in /public/pdf-icons)
const ICON_BASE = `${window.location.origin}/pdf-icons`;
function iconImg(file: string) {
  return `<img src="${ICON_BASE}/${file}" class="ico-img" alt="" onerror="this.style.display='none'" />`;
}
const IMG = {
  empresa: () => iconImg('empresa.png'),
  dados: () => iconImg('dados.png'),
  razao: () => iconImg('razao.png'),
  cnpj: () => iconImg('cnpj.png'),
  endereco: () => iconImg('endereco.png'),
  email: () => iconImg('email.png'),
  pagamento: () => iconImg('pagamento.png'),
  data: () => iconImg('data.png'),
  hora: () => iconImg('hora.png'),
};

// Inline SVG icons (stroke = currentColor)
const ICO = {
  building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M10 21v-3h4v3"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  userPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M7 14h.01M12 14h.01M17 14h.01M7 17h.01M12 17h.01M17 17h.01"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20"/><path d="M6 15h3"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 2h8a1 1 0 0 1 1 1v2H7V3a1 1 0 0 1 1-1z"/><path d="M9 11h6M9 15h6"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="m3 8 9 5 9-5"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.78 11.78 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84a11.7 11.7 0 0 0 1.6 5.92L0 24l6.4-1.68a11.83 11.83 0 0 0 5.64 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.24-6.13-3.37-8.44zM12.04 21.8h-.01a9.93 9.93 0 0 1-5.06-1.39l-.36-.22-3.78 1 1.01-3.69-.24-.38a9.93 9.93 0 1 1 18.4-5.27c0 5.47-4.47 9.95-9.96 9.95zm5.46-7.42c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2v20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M3.5 7.5h17M3.5 16.5h17"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12z"/></svg>`,
};

const STYLES = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  @page { size: A4; margin: 0; }
  html, body { width: 100%; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Inter', Arial, Helvetica, sans-serif; margin: 0; padding: 0; color: #1f2937; background: #e5e7eb; font-size: 10.5px; }
  .print-btn { position: fixed; top: 12px; right: 12px; background: #f7941d; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .doc { width: 210mm; margin: 12px auto; background: white; position: relative; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
  .watermark { position: absolute; top: 52%; left: 50%; transform: translate(-50%,-50%); width: 60%; opacity: 0.10; pointer-events: none; z-index: 0; }
  .content { position: relative; z-index: 1; }
  .footer-spacer { display: block; width: 100%; height: 0; }
  .pdf-footer-block { background: white; margin-top: 0; padding-top: 0; display: block; break-inside: avoid !important; page-break-inside: avoid !important; page-break-before: auto !important; break-before: auto !important; }
  .pdf-footer-block.locked-footer { position: absolute; left: 0; right: 0; z-index: 5; }
  .page-footer { background: white; margin-top: 0; padding-top: 0; }
  svg { width: 1em; height: 1em; display: inline-block; vertical-align: -0.15em; }
  .ico-img { width: 1em; height: 1em; display: inline-block; vertical-align: -0.15em; object-fit: contain; }

  /* HEADER */
  .hdr { display: grid; grid-template-columns: 1.15fr 1fr; align-items: stretch; }
  .hdr-left { padding: 12px 28px; display: flex; align-items: center; background: white; }
  .hdr-left img { max-height: 78px; max-width: 360px; object-fit: contain; }
  .hdr-right { display: flex; flex-direction: column; background: white; }
  .hdr-right .title-bar { background: #3a3a3a; padding: 14px 28px 12px; }
  .hdr-right .title { font-size: 30px; font-weight: 900; color: #f7941d; letter-spacing: 3px; text-align: left; line-height: 1; }
  .hdr-right .row { display: grid; grid-template-columns: 1fr 1px auto; gap: 18px; align-items: center; padding: 12px 28px 14px; background: white; }
  .hdr-right .row .vdiv { width: 1px; height: 38px; background: #d1d5db; }
  .hdr-right .pedido .lbl { font-size: 10.5px; color: #6b7280; font-weight: 700; letter-spacing: 1px; }
  .hdr-right .pedido .num { font-size: 20px; font-weight: 800; color: #1f2937; line-height: 1.1; }
  .hdr-right .datetime { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
  .hdr-right .datetime .line { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .hdr-right .datetime .line .lbl { color: #6b7280; font-weight: 700; letter-spacing: 0.5px; font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px; }
  .hdr-right .datetime .line .v { color: #1f2937; font-weight: 700; white-space: nowrap; }

  /* ORANGE DIVIDER */
  .hdr-divider { height: 1.5px; background: #f7941d; }

  /* INFO BAR */
  .info-bar { display: grid; grid-template-columns: 1fr 1px 1fr 1px 0.7fr; gap: 18px; padding: 8px 28px 4px; background: white; align-items: center; }
  .info-bar .vdiv { width: 1px; height: 38px; background: #d1d5db; }
  .info-bar .item { display: flex; align-items: center; gap: 12px; }
  .info-bar .icon-sq { width: 30px; height: 30px; color: #374151; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; border: 1.2px solid #cfd4dc; border-radius: 4px; background: #fff; }
  .info-bar .txt { display: flex; flex-direction: column; gap: 1px; line-height: 1.15; }
  .info-bar .lbl { font-size: 9.5px; color: #6b7280; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; }
  .info-bar .val { font-size: 12.5px; font-weight: 800; color: #1f2937; }
  .info-bar .status-col { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 6px; text-align: left; }
  .info-bar .status-col .lbl { text-align: left; }
  .status-pill { display: inline-block; background: #f7941d; color: white; padding: 7px 26px; border-radius: 22px; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; box-shadow: 0 2px 6px rgba(247,148,29,0.35); text-align: center; }

  /* SECTION TITLE */
  .sec-title { font-size: 11px; font-weight: 700; color: #f7941d; letter-spacing: 1px; padding: 4px 24px 2px; text-transform: uppercase; display: flex; align-items: center; gap: 7px; }
  .sec-title .ico-sec { width: 18px; height: 18px; color: #f7941d; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }

  /* CLIENT BLOCK */
  .client { margin: 0 24px 4px; background: #ffffff; border: 1px solid #eef0f3; border-radius: 6px; padding: 6px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; position: relative; }
  .client > div + div { padding-left: 24px; }
  .client .row { display: flex; align-items: center; gap: 7px; font-size: 9.5px; padding: 1.5px 0; }
  .client .row .ico { width: 18px; height: 18px; color: #9ca3af; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
  .client .row .col { display: flex; flex-direction: row; align-items: baseline; gap: 5px; min-width: 0; }
  .client .row .l { color: #6b7280; font-weight: 700; letter-spacing: 0.2px; font-size: 8.5px; text-transform: uppercase; white-space: nowrap; }
  .client .row .v { color: #111827; font-weight: 700; font-size: 9.5px; word-break: break-word; }

  /* ITEMS TABLE */
  .items-wrap { padding: 0 24px; }
  .items-wrap .items-box { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  table.items { width: 100%; border-collapse: separate; border-spacing: 0; }
  table.items thead th { background: #f7941d; color: white; padding: 7px 8px; text-align: center; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; white-space: nowrap; vertical-align: middle; border-right: 1px solid rgba(255,255,255,0.25); }
  table.items thead th:last-child { border-right: none; }
  table.items thead th.empty { background: #f7941d; width: 54px; }
  table.items thead th.item { width: 50px; text-align: center; }
  table.items thead th.code-h { width: 80px; text-align: center; }
  table.items thead th.desc-h { text-align: center; }
  table.items thead th.c { text-align: center; width: 50px; }
  table.items thead th.r { text-align: right; width: 95px; padding-right: 14px; }
  table.items tbody td { padding: 7px 8px; border-bottom: 1px solid #eef0f3; border-right: 1px solid #eef0f3; font-size: 10.5px; vertical-align: middle; }
  table.items tbody td:last-child { border-right: none; }
  table.items tbody td.c { text-align: center; }
  table.items tbody td.r { text-align: right; font-weight: 700; color: #111827; white-space: nowrap; padding-right: 14px; }
  table.items tbody td.code { font-family: 'Courier New', monospace; font-size: 10.5px; font-weight: 700; color: #374151; text-align: center; }
  table.items tbody td.item-num { text-align: center; font-weight: 800; color: #374151; font-size: 12px; }
  table.items tbody td.thumb-cell { border-bottom: 1px solid #eef0f3; padding: 5px 4px; }
  .thumb { width: 32px; height: 46px; border-radius: 4px; object-fit: contain; background: #fff; display: block; margin: 0 auto; }
  .thumb-ph { width: 32px; height: 46px; border-radius: 4px; background: linear-gradient(135deg,#fdebd0,#f7941d); display: block; margin: 0 auto; }

  /* TOTALS */
  .totals-wrap { padding: 6px 24px 0; display: grid; grid-template-columns: 1fr 240px; gap: 16px; align-items: start; margin-top: 0; }
  .totals-summary { display: flex; align-items: center; gap: 12px; padding: 0 0 0 4px; }
  .totals-summary .big-ico { width: 36px; height: 36px; border-radius: 8px; background: #fdebd0; color: #f7941d; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .totals-summary .lines { display: flex; flex-direction: column; gap: 4px; }
  .totals-summary .lines div { font-size: 10.5px; font-weight: 700; color: #111827; letter-spacing: 0.4px; }
  .totals .box { width: 240px; border-radius: 8px; overflow: hidden; border: 1px solid #eef0f3; }
  .totals .line { display: flex; justify-content: space-between; padding: 4px 14px; font-size: 10.5px; background: #f7f8fa; border-bottom: 1px solid #fff; }
  .totals .line .l { color: #6b7280; font-weight: 600; }
  .totals .line .v { color: #111827; font-weight: 700; }
  .totals .grand { display: flex; justify-content: space-between; align-items: center; background: #f7941d; color: white; padding: 7px 14px; font-weight: 700; }
  .totals .grand .lbl { font-size: 11px; letter-spacing: 0.6px; }
  .totals .grand .val { font-size: 15px; }

  /* BOTTOM GRID */
  .bottom { display: grid; grid-template-columns: 1.1fr 1fr 0.9fr; gap: 0; padding: 4px 24px 5px; align-items: start; margin-top: 0; min-height: 0; page-break-before: auto !important; break-before: auto !important; page-break-inside: avoid !important; break-inside: avoid !important; }
  .bottom > div { padding: 0 18px; border-left: 1px solid #d1d5db; min-height: 0; display: block; }
  .bottom > div:first-child { padding-left: 0; border-left: none; }
  .bottom h4 { margin: 0 0 6px; font-size: 11px; font-weight: 800; color: #f7941d; letter-spacing: 1px; text-transform: uppercase; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .bottom h4 svg { font-size: 14px; }
  .bottom ul { margin: 0; padding-left: 14px; font-size: 9px; color: #374151; line-height: 1.38; }
  .bottom ul li { white-space: nowrap; }
  .sign { text-align: center; font-size: 10px; color: #374151; }
  .sign p { margin: 0 0 4px; }
  .sign .sig-img { max-height: 58px; max-width: 180px; object-fit: contain; margin: 0 auto -4px; display: block; }
  .sign .name { font-weight: 800; color: #f7941d; margin-top: 2px; display: block; font-size: 12px; }
  .sign .role { color: #6b7280; font-size: 9.5px; margin-top: 2px; }
  .qr { text-align: center; align-items: center; justify-content: flex-start; }
  .qr .hdr-q { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10.5px; font-weight: 800; color: #f7941d; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .qr .hdr-q svg { color: #f7941d; font-size: 16px; }
  .qr .help { font-size: 9px; color: #6b7280; margin: 4px 0 6px; }
  .qr img { width: 84px; height: 84px; border: 2px solid #f7941d; border-radius: 6px; padding: 3px; background: white; }
  .foot-bar .blk a { color: white; text-decoration: underline; }

  /* OBS */
  .obs { margin: 0 24px 12px; background: #fff7e6; border-left: 3px solid #f7941d; padding: 10px 14px; font-size: 10px; color: #374151; border-radius: 4px; }
  .obs h5 { margin: 0 0 4px; font-size: 10px; font-weight: 800; color: #f7941d; text-transform: uppercase; letter-spacing: 0.5px; }

  /* FOOTER BAR */
  .foot-bar { background: #3a3a3a; color: white; padding: 8px 24px; display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 14px; font-size: 10.5px; page-break-before: auto !important; break-before: auto !important; page-break-inside: avoid !important; break-inside: avoid !important; }
  .foot-bar .blk { display: flex; flex-direction: column; gap: 6px; }
  .foot-bar .blk .line { display: flex; align-items: center; gap: 8px; }
  .foot-bar .blk .ico { color: #f7941d; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; width: 16px; }
  .foot-bar .blk .sub { color: #e5e7eb; padding-left: 24px; }
  .gen { background: #f7941d; color: white; padding: 5px 24px; font-size: 10.5px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; page-break-before: auto !important; break-before: auto !important; page-break-inside: avoid !important; break-inside: avoid !important; }
  .gen strong { color: white; font-weight: 800; }

  @media print {
    html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { background: white; }
    .print-btn { display: none; }
    .doc { box-shadow: none; margin: 0; }
    .content { min-height: auto; }
    .watermark { position: fixed; }
    table.items { page-break-inside: auto; }
    table.items thead { display: table-row-group; }
    table.items tfoot { display: table-footer-group; }
    table.items tbody tr { page-break-inside: avoid; page-break-after: auto; }
    .client, .info-bar { page-break-inside: avoid; }
    .totals-wrap, .obs { page-break-inside: avoid; }
    .footer-spacer { display: block !important; height: 0 !important; }
    .pdf-footer-block { display: block !important; width: 210mm; margin-top: 0; padding-top: 0; background: white; z-index: 5; page-break-inside: avoid !important; break-inside: avoid !important; }
    .pdf-footer-block.locked-footer { position: absolute !important; left: 0 !important; right: 0 !important; }
    .bottom { page-break-inside: avoid; break-inside: avoid; }
    .foot-bar { page-break-inside: avoid; break-inside: avoid; }
    .gen { page-break-inside: avoid; break-inside: avoid; }
    .hdr { page-break-after: avoid; }
    .page-footer { position: static; margin-top: 0; padding-top: 0; }
  }
`;

function buildHtml(data: PdfOrderData): string {
  const typeLabel = data.type === 'pedido' ? 'PEDIDO' : 'ORÇAMENTO';
  const orderNum = num(data.orderNumber);
  const created = data.createdAt ? new Date(data.createdAt) : new Date();
  const date = fmtDate(created);
  const time = fmtTime(created);
  const hide = !!data.hidePrices;
  const status = data.status || 'EM ANÁLISE';
  const rep = data.representative || 'Adriano Moura';

  const subtotal = data.items.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
  const computedFreight = brandPaymentService.computeFreight(data.brand, subtotal);
  const freight = data.freight ?? computedFreight;
  const ipi = data.ipi ?? 0;
  const totalGeral = subtotal + freight + ipi;

  let city = data.clientCity || '';
  if (!city && data.clientAddress && data.clientAddress.includes(' - ')) {
    const parts = data.clientAddress.split(' - ');
    if (parts.length > 1) city = parts.slice(1).join(' - ');
  }

  const rows = data.items.map((item, idx) => {
    const img = assetUrl(productImage(item));
    return `
    <tr>
      <td class="thumb-cell">${img ? `<img src="${esc(img)}" class="thumb" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;thumb-ph&quot;></span>'" />` : '<span class="thumb-ph"></span>'}</td>
      <td class="item-num">${idx + 1}</td>
      <td class="code">${esc(item.code)}</td>
      <td style="font-weight:700;color:#111827;">${esc(item.name)}</td>
      <td class="c">${item.qty}</td>
      ${hide ? '' : `<td class="r">${formatBRL(item.unitPrice)}</td><td class="r">${formatBRL(item.totalPrice)}</td>`}
    </tr>
  `;
  }).join('');

  const totalItems = data.items.length;
  const totalQty = data.items.reduce((s, i) => s + (i.qty || 0), 0);

  const paymentCondition = hide ? '' : `${data.paymentMethod}${data.paymentTerm ? ' - ' + data.paymentTerm : ''}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${typeLabel}${orderNum ? ' ' + orderNum : ''} - Moura Representações</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>${STYLES}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
  <div class="doc">
    <img src="${WATERMARK_URL}" class="watermark" alt="" onerror="this.style.display='none'" />
    <div class="content">
      <!-- HEADER -->
      <div class="hdr">
        <div class="hdr-left">
          <img src="${LOGO_URL}" alt="Moura Representações Comerciais" onerror="this.style.display='none'" />
        </div>
        <div class="hdr-right">
          <div class="title-bar">
            <div class="title">${typeLabel}</div>
          </div>
          <div class="row">
            <div class="pedido">
              <div class="lbl">Nº PEDIDO:</div>
              <div class="num">${orderNum || '—'}</div>
            </div>
            <div class="vdiv"></div>
            <div class="datetime">
              <div class="line"><span class="lbl">${IMG.data()} DATA:</span><span class="v">${date}</span></div>
              <div class="line"><span class="lbl">${IMG.hora()} HORA:</span><span class="v">${time}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="hdr-divider"></div>

      <!-- INFO BAR -->
      <div class="info-bar">
        <div class="item">
          <span class="icon-sq">${IMG.empresa()}</span>
          <span class="txt"><span class="lbl">EMPRESA:</span><span class="val">${esc(data.brand)}</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="item">
          <span class="icon-sq">${ICO.user}</span>
          <span class="txt"><span class="lbl">REPRESENTANTE:</span><span class="val">${esc(rep)}</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="status-col">
          <span class="lbl" style="font-size:10px;color:#6b7280;font-weight:800;letter-spacing:1px;">STATUS:</span>
          <span class="status-pill">${esc(status).toUpperCase()}</span>
        </div>
      </div>

      <!-- DADOS DO CLIENTE -->
      <div class="sec-title"><span class="ico-sec">${IMG.dados()}</span> Dados do Cliente</div>
      <div class="client">
        <div>
          <div class="row"><span class="ico">${IMG.razao()}</span><span class="col"><span class="l">Razão Social:</span><span class="v">${esc(data.clientName) || '—'}</span></span></div>
          <div class="row"><span class="ico">${IMG.cnpj()}</span><span class="col"><span class="l">CNPJ:</span><span class="v">${esc(data.clientCnpj) || '—'}</span></span></div>
          <div class="row"><span class="ico">${IMG.endereco()}</span><span class="col"><span class="l">Endereço:</span><span class="v">${esc(data.clientAddress) || '—'}</span></span></div>
          <div class="row"><span class="ico">${IMG.endereco()}</span><span class="col"><span class="l">Cidade / UF:</span><span class="v">${esc(city) || '—'}</span></span></div>
        </div>
        <div>
          <div class="row"><span class="ico">${IMG.email()}</span><span class="col"><span class="l">E-mail:</span><span class="v">${esc(data.clientEmail) || '—'}</span></span></div>
          <div class="row"><span class="ico">${ICO.phone}</span><span class="col"><span class="l">Telefone:</span><span class="v">${esc(data.clientPhone) || '—'}</span></span></div>
          <div class="row"><span class="ico">${IMG.pagamento()}</span><span class="col"><span class="l">Condição de Pagamento:</span><span class="v">${esc(paymentCondition) || '—'}</span></span></div>
          ${data.buyer ? `<div class="row"><span class="ico">${ICO.user}</span><span class="col"><span class="l">Comprador:</span><span class="v">${esc(data.buyer)}</span></span></div>` : ''}
          ${data.purchaseOrder ? `<div class="row"><span class="ico">${ICO.box}</span><span class="col"><span class="l">Ordem de Compra:</span><span class="v">${esc(data.purchaseOrder)}</span></span></div>` : ''}
        </div>
      </div>

      <!-- ITEMS TABLE -->
      <div class="sec-title"><span class="ico-sec">${ICO.clipboard}</span> Itens</div>
      <div class="items-wrap">

        <div class="items-box">
        <table class="items">
          <thead>
            <tr>
              <th class="empty"></th>
              <th class="item">ITEM</th>
              <th class="code-h">CÓDIGO</th>
              <th class="desc-h">DESCRIÇÃO</th>
              <th class="c">QTD</th>
              ${hide ? '' : `<th class="r">VALOR UNIT.</th><th class="r">TOTAL</th>`}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>

      ${hide ? '' : `
      <!-- TOTALS -->
      <div class="totals totals-wrap">
        <div class="totals-summary">
          <span class="big-ico">${ICO.box}</span>
          <div class="lines">
            <div>TOTAL DE ITENS: ${totalItems}</div>
            <div>QUANTIDADE TOTAL: ${totalQty}</div>
          </div>
        </div>
        <div class="box">
          <div class="line"><span class="l">SUBTOTAL:</span><span class="v">${formatBRL(subtotal)}</span></div>
          <div class="line"><span class="l">FRETE:</span><span class="v">${freight > 0 ? formatBRL(freight) : 'CIF (grátis)'}</span></div>
          ${ipi > 0 ? `<div class="line"><span class="l">IPI:</span><span class="v">${formatBRL(ipi)}</span></div>` : ''}
          <div class="grand"><span class="lbl">TOTAL GERAL</span><span class="val">${formatBRL(totalGeral)}</span></div>
        </div>
      </div>
      `}

      ${data.observations || data.invoiceNote ? `
      <div class="obs">
        ${data.observations ? `<h5>Observações</h5><div>${esc(data.observations)}</div>` : ''}
        ${data.invoiceNote ? `<h5 style="margin-top:6px">Observação Nota Fiscal</h5><div>${esc(data.invoiceNote)}</div>` : ''}
      </div>
      ` : ''}



      <!-- Espaçador dinâmico: empurra o rodapé para o fim da última página A4 -->
      <div class="footer-spacer" id="footerSpacer"></div>

      <!-- PAGE FOOTER (last page only) -->
      <div class="pdf-footer-block">
      <div class="page-footer">

      <div class="bottom">
        <div>
          <h4><span style="color:#f7941d;display:inline-flex;align-items:center;font-size:16px;">${ICO.shield}</span> Condições Comerciais</h4>
          <ul>
            <li>${data.type === 'pedido' ? 'Pedido' : 'Orçamento'} sujeito à análise comercial e de crédito.</li>
            <li>Preços sujeitos a alteração sem aviso prévio.</li>
            <li>Estoque sujeito à disponibilidade no momento do faturamento.</li>
            <li>Prazo de entrega conforme disponibilidade logística.</li>
            <li>${data.type === 'pedido' ? 'Pedido' : 'Orçamento'} gerado através da plataforma B2B Moura Representações.</li>
          </ul>
        </div>
        <div class="sign">
          <p>Atenciosamente,</p>
          <img src="${SIGNATURE_URL}" alt="Assinatura" class="sig-img" onerror="this.style.display='none'" />
          <span class="name">${esc(rep)}</span>
          <div class="role">Moura Representações Comerciais<br/>(51) 99199-7522</div>
        </div>
        <div class="qr">
          <div class="hdr-q">${ICO.whatsapp} Fale Diretamente Conosco</div>
          <div class="help">Escaneie o QR Code e<br/>fale conosco pelo WhatsApp</div>
          <img src="${QR_URL}" alt="QR WhatsApp" onerror="this.style.display='none'" />
        </div>
      </div>

      <!-- FOOTER BAR -->
      <div class="foot-bar">
        <div class="blk">
          <div class="line"><span class="ico">${ICO.pin}</span> <strong>Moura Representações Comerciais</strong></div>
          <div class="sub">Cachoeirinha/RS</div>
        </div>
        <div class="blk">
          <div class="line"><span class="ico">${ICO.phone}</span> (51) 99199-7522</div>
          <div class="line"><span class="ico">${ICO.mail}</span> moura_representacoes@outlook.com</div>
        </div>
        <div class="blk">
          <div class="line"><span class="ico">${ICO.globe}</span> <a href="https://www.mourarepresentacoes.com.br" target="_blank">www.mourarepresentacoes.com.br</a></div>
          <div class="line"><span class="ico">${ICO.instagram}</span> <span class="ico">${ICO.facebook}</span> /mourarepresentacoes</div>
        </div>
      </div>
      <div class="gen">
        <span>Gerado em ${date} às ${time}</span>
        ${orderNum ? `<span>Nº ${data.type === 'pedido' ? 'Pedido' : 'Orçamento'}: <strong>${orderNum}</strong></span>` : ''}
      </div>
      </div>
      </div>
    </div>
  </div>
  <script>
    // Posiciona o rodapé no fim da última folha A4 onde ele cabe.
    // O rodapé fica absoluto dentro do documento para não participar do fluxo
    // e não criar uma página extra apenas para ele.
    function alignFooter() {
      try {
        var doc = document.querySelector('.doc');
        var footer = document.querySelector('.pdf-footer-block');
        var spacer = document.getElementById('footerSpacer');
        if (!doc || !footer || !spacer) return;
        spacer.style.height = '0px';
        footer.classList.remove('locked-footer');
        footer.style.top = '';
        var docW = doc.getBoundingClientRect().width || doc.offsetWidth || 794;
        var pageH = docW * (297 / 210); // A4 real proporcional à largura do documento
        var docTop = doc.getBoundingClientRect().top;
        var contentBottom = spacer.getBoundingClientRect().top - docTop;
        var footerH = footer.getBoundingClientRect().height || footer.offsetHeight;
        if (footerH >= pageH) return;
        var safety = 10; // margem mínima contra arredondamento do Chrome
        var pages = Math.max(1, Math.ceil((contentBottom + footerH + safety) / pageH - 0.002));
        var top = pages * pageH - footerH;
        if (top < contentBottom + safety) top = (pages + 1) * pageH - footerH;
        footer.classList.add('locked-footer');
        footer.style.top = Math.max(0, top) + 'px';
        doc.style.minHeight = Math.ceil(Math.max(top + footerH, contentBottom)) + 'px';
      } catch (e) {}
    }
    window.addEventListener('load', function () { alignFooter(); setTimeout(alignFooter, 300); });
    window.addEventListener('beforeprint', alignFooter);
    window.addEventListener('resize', alignFooter);
    Array.prototype.forEach.call(document.images || [], function (img) {
      if (!img.complete) img.addEventListener('load', alignFooter, { once: true });
    });
  </script>


</body>
</html>`;
}

export function generateOrderPdf(data: PdfOrderData): void {
  const html = buildHtml(data);
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export function generateQuotePdf(data: {
  brand: string;
  clientName?: string;
  clientCnpj?: string;
  items: { code: string; name: string; qty: number; image?: string }[];
}): void {
  const items: OrderItem[] = data.items.map(i => ({
    productId: '', code: i.code, name: i.name, image: i.image, qty: i.qty,
    unitPrice: 0, totalPrice: 0, listPrice: 0, salePrice: 0, discountPct: 0,
    subtotal: 0, extraDiscountPct: 0, subtotalAfterExtra: 0, ipiRate: 0, ipiValue: 0,
    stRate: 0, stValue: 0, totalWithTax: 0,
  }));
  generateOrderPdf({
    type: 'orcamento', brand: data.brand,
    clientName: data.clientName || '', clientCnpj: data.clientCnpj || '',
    items, total: 0,
    paymentMethod: 'A combinar', paymentTerm: '',
    hidePrices: true,
    status: 'Solicitação',
  });
}
