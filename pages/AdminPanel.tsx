import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { useOrders, type Order } from '@/lib/orders';
import { Button } from '@/components/ui/button';
import { SystemFooter } from '@/components/SystemFooter';
import { ProductThumb } from '@/components/ProductThumb';
import { PurchaseHistory } from '@/components/PurchaseHistory';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBRL, formatCNPJMask, formatPhoneMask, isValidCNPJ } from '@/lib/formatters';
import type { Product, ProductVariation, ProductVariationGroup, ProductVariationOption, ProductCombination, Client, Category, LaunchImage, OrderStatus, QuoteRequest, AccessRequest, Catalog, Lead, Promotion } from '@/lib/types';
import { getVariationGroups as normalizeVariationGroups, combinationKey } from '@/lib/types';
import seloPromocao from '@/assets/selo-promocao.png';
import { categoryService } from '@/lib/categoryService';
import { launchService } from '@/lib/launchService';
import { accessRequestService } from '@/lib/accessRequestService';
import { catalogService, uploadCatalogFile, catalogCoverThumb } from '@/lib/catalogService';
import { toast } from 'sonner';
import { leadService } from '@/lib/leadService';
import { passwordRecoveryService, type PasswordRecovery } from '@/lib/passwordRecoveryService';
import { contactService, type ContactRequest } from '@/lib/contactService';
import { productService, uploadProductImage } from '@/lib/productService';
import { dataUrlToBlob, migrateLegacyBase64Images, uploadCompanyLogo, uploadImageBlob } from '@/lib/imageMigration';
import { panicService } from '@/lib/panicService';
import { promotionService } from '@/lib/promotionService';
import { brandRulesService, globalTextsService, type BrandRules, type GlobalTexts } from '@/lib/brandRulesService';
import { BRANDS, SITE } from '@/lib/constants';
import { generateOrderPdf } from '@/lib/pdfGenerator';
import { orderNumber } from '@/lib/orderNumber';
import {
  LayoutDashboard, ShoppingCart, FileText, KeyRound, Package, Building2, Users, Sparkles,
  BookOpen, FileUp, UserPlus, Bell, Filter, Download, MessageCircle, Trash2, RefreshCw,
  Pencil, Check, X, Search, ShieldAlert, Mail, BarChart3, TrendingUp, Eye, Activity, Menu, ChevronDown, GripVertical, LogOut, Tag, Flame,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { visitService } from '@/lib/visitService';
import { SYSTEM_ERROR_EVENT, DATA_READY_EVENT, getLastSystemError, clearSystemError, refreshTable, setCachedRows, type SystemErrorInfo } from '@/lib/dataStore';
import { backupService } from '@/lib/backupService';
import { activityService, type ActivityRow } from '@/lib/activityService';

const ALL_STATUSES: OrderStatus[] = ['Recebido', 'Em análise', 'Finalizado'];
const statusColors: Record<string, string> = {
  'Recebido': 'bg-blue-100 text-blue-800',
  'Em análise': 'bg-yellow-100 text-yellow-800',
  'Aprovado': 'bg-green-100 text-green-800',
  'Em separação': 'bg-purple-100 text-purple-800',
  'Faturado': 'bg-teal-100 text-teal-800',
  'Finalizado': 'bg-gray-200 text-gray-800',
  'Cancelado': 'bg-red-100 text-red-800',
};

const normalizeAdminText = (value?: string | null) =>
  (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.length > 3 && part.endsWith('s') ? part.slice(0, -1) : part)
    .join(' ');
const adminKey = (...parts: (string | null | undefined)[]) => parts.map(normalizeAdminText).join('|');

const parseMoneyInput = (val: string): number | undefined => {
  const cleaned = (val || '').replace(/[^\d.,]/g, '');
  if (!cleaned) return undefined;
  let norm = cleaned;
  if (cleaned.includes(',')) {
    norm = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    const last = cleaned.lastIndexOf('.');
    norm = cleaned.slice(0, last).replace(/\./g, '') + cleaned.slice(last);
  }
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const formatMoneyInput = (value?: number | null): string => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Formata preservando o separador decimal digitado pelo usuário:
// "10.00" continua com PONTO; "10,00" continua com VÍRGULA. Sem separador,
// mantém o padrão brasileiro (vírgula). Usado no onBlur dos campos de preço.
const formatMoneyPreserve = (raw: string, fallback?: number | null): string => {
  const num = parseMoneyInput(raw);
  if (num == null) return formatMoneyInput(fallback);
  const usedComma = raw.includes(',');
  const usedDotDecimal = !usedComma && raw.includes('.');
  if (usedDotDecimal) {
    // Decimal com PONTO (separador de milhar vira vírgula) — en-US.
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Aviso de backup vencido (padrão: a cada 15 dias) + download automático opcional. */
function BackupReminder({ onGoToBackup, onChanged }: { onGoToBackup: () => void; onChanged: () => void }) {
  const [due, setDue] = useState(() => backupService.isDue());
  const [autoDone, setAutoDone] = useState(false);
  const settings = backupService.getSettings();

  useEffect(() => {
    if (!due) return;
    if (backupService.getSettings().auto) {
      // Backup automático: baixa e registra a data.
      backupService.download();
      setAutoDone(true);
      setDue(false);
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  if (autoDone) {
    return (
      <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <Download size={16} /> Backup automático dos produtos baixado agora (a cada {settings.intervalDays} dias).
      </div>
    );
  }
  if (!due) return null;

  const days = backupService.daysSinceLast();
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm text-amber-900">
        <strong>Backup dos produtos pendente.</strong>{' '}
        {days == null ? 'Você ainda não fez nenhum backup.' : `Último backup há ${days} dia(s).`} Recomendado a cada {settings.intervalDays} dias.
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { backupService.download(); setDue(false); onChanged(); }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#f7941d] to-[#ff7a00] text-white text-sm font-semibold shadow-sm hover:opacity-90"
        >
          <Download size={15} /> Baixar agora
        </button>
        <button
          onClick={onGoToBackup}
          className="px-3 py-2 rounded-lg border border-amber-400 text-amber-800 text-sm font-semibold hover:bg-amber-100"
        >
          Configurar
        </button>
        <button
          onClick={() => { backupService.snooze(); setDue(false); onChanged(); }}
          className="px-3 py-2 rounded-lg text-amber-800 text-sm hover:bg-amber-100"
        >
          Lembrar amanhã
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { logout } = useAuth();
  const store = useStore();
  const orderStore = useOrders();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab = tabParam || 'dash';
  const setTab = (id: string) => { navigate(id === 'dash' ? '/admin/painel' : `/admin/painel/${id}`); setSidebarOpen(false); };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 30000);
    const onDataReady = () => setTick(t => t + 1);
    window.addEventListener(DATA_READY_EVENT, onDataReady);
    return () => {
      clearInterval(i);
      window.removeEventListener(DATA_READY_EVENT, onDataReady);
    };
  }, []);
  const newOrdersCount = orderStore.orders.filter(o => o.status === 'Recebido' && o.type === 'pedido').length;
  const newQuotesCount = orderStore.orders.filter(o => o.status === 'Recebido' && o.type === 'orcamento').length + orderStore.quoteRequests.filter(q => q.status === 'Recebido').length;
  const pendingAccess = useMemo(() => accessRequestService.getAll().filter(r => r.status === 'pending').length, [tick, tab]);
  const pendingRecovery = useMemo(() => passwordRecoveryService.pendingCount(), [tick, tab]);
  const pendingContacts = useMemo(() => contactService.pendingCount(), [tick, tab]);
  // Leads recebidos nos últimos 7 dias (contador de novidade no menu).
  const newLeadsCount = useMemo(() => {
    const limit = Date.now() - 7 * 86400000;
    return leadService.getAll().filter(l => new Date(l.createdAt).getTime() >= limit).length;
  }, [tick, tab]);
  // Rascunhos antigos: agrupa por cliente + status (mantém o mais recente de cada combinação).
  const dedupeByClientStatus = (list: typeof orderStore.orders) => {
    const map = new Map<string, typeof list[number]>();
    for (const o of list) {
      const key = `${(o.clientName || '').trim().toLowerCase()}|${o.status}`;
      const prev = map.get(key);
      if (!prev || new Date(o.createdAt).getTime() > new Date(prev.createdAt).getTime()) map.set(key, o);
    }
    return Array.from(map.values());
  };
  const visibleOrders = useMemo(() => {
    const all = orderStore.orders.filter(o => o.type === 'pedido');
    return [...all.filter(o => o.status !== 'Rascunho'), ...dedupeByClientStatus(all.filter(o => o.status === 'Rascunho'))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orderStore.orders]);
  const visibleQuotes = useMemo(() => {
    const all = orderStore.orders.filter(o => o.type === 'orcamento');
    return [...all.filter(o => o.status !== 'Rascunho'), ...dedupeByClientStatus(all.filter(o => o.status === 'Rascunho'))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orderStore.orders]);
  const draftsCount = visibleOrders.filter(o => o.status === 'Rascunho').length;
  const backupDue = useMemo(() => backupService.isDue(), [tick, tab]);

  const tabs: { id: string; label: string; Icon: any; badge?: number }[] = [
    { id: 'dash', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', Icon: BarChart3 },
    { id: 'orders', label: 'Pedidos', Icon: ShoppingCart, badge: (newOrdersCount + draftsCount) || undefined },
    { id: 'quotes', label: 'Orçamentos', Icon: FileText, badge: newQuotesCount || undefined },
    { id: 'products', label: 'Produtos', Icon: Package },
    { id: 'promotions', label: 'Promoções', Icon: Tag },
    { id: 'bestsellers', label: 'Mais Vendidos', Icon: Flame },
    { id: 'launches', label: 'Lançamentos', Icon: Sparkles },
    { id: 'catalogs', label: 'Catálogos', Icon: BookOpen },
    { id: 'empresas', label: 'Empresas', Icon: Building2 },
    { id: 'access', label: 'Solicitações', Icon: KeyRound, badge: pendingAccess || undefined },
    { id: 'recovery', label: 'Recuperações', Icon: RefreshCw, badge: pendingRecovery || undefined },
    { id: 'clients', label: 'Clientes', Icon: Users },
    { id: 'leads', label: 'Leads', Icon: UserPlus, badge: newLeadsCount || undefined },
    { id: 'contacts', label: 'Contatos', Icon: Mail, badge: pendingContacts || undefined },

    { id: 'panic', label: 'Botão do Pânico', Icon: ShieldAlert },
    { id: 'csv', label: 'Importar CSV', Icon: FileUp, badge: backupDue ? 1 : undefined },
  ];

  return (
    <div className="app-light flex min-h-screen bg-gradient-to-br from-[#f3f4f6] via-[#f8f9fb] to-[#eef0f3] font-sans text-[#111827]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }} translate="no" lang="pt-BR">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden" />
      )}
      <aside className={`fixed lg:static top-0 left-0 z-50 h-screen lg:h-auto w-64 bg-gradient-to-b from-[#1a2030] via-[#1f2937] to-[#111827] text-white flex flex-col p-4 shrink-0 shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="mb-6 flex items-center justify-between lg:justify-center">
          <img src="/logo-white.png" alt="Moura" className="h-12 object-contain" />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/70 hover:text-white p-1" aria-label="Fechar menu"><X size={22} /></button>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 px-2 mb-2">Menu Principal</div>
        <nav className="space-y-1 overflow-y-auto">
          {tabs.map(t => {
            const active = tab === t.id;
            const Icon = t.Icon;
            const hasBadge = t.badge !== undefined && t.badge > 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-2.5 group ${active ? 'bg-gradient-to-r from-[#f7941d] to-[#ff7a00] text-white font-semibold shadow-lg shadow-orange-500/30 scale-[1.02]' : 'text-gray-300 hover:bg-white/10 hover:translate-x-0.5'}`}>
                <Icon size={16} className={`shrink-0 transition-transform ${active ? '' : 'group-hover:scale-110'}`} />
                <span className="flex-1">{t.label}</span>
                {hasBadge && (
                  <span className="relative flex items-center">
                    <span className="bg-white text-[#f7941d] text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow">{t.badge}</span>
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
          <button onClick={logout} className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-2.5 text-gray-300 hover:bg-white/10 hover:translate-x-0.5 mt-1 border-t border-white/10 pt-3">
            <LogOut size={16} className="shrink-0" />
            <span className="flex-1">Sair do sistema</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-auto min-w-0 w-full">
        {/* Mobile topbar */}
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-[#111827]" aria-label="Abrir menu"><Menu size={22} /></button>
          <img src="/logo.png" alt="Moura" className="h-8 object-contain" />
          <div className="w-10" />
        </div>
        <div className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
        <BackupReminder onGoToBackup={() => setTab('csv')} onChanged={() => setTick(t => t + 1)} />

        {tab === 'dash' && <DashTab products={store.products} clients={store.clients} orders={orderStore.orders} quoteRequests={orderStore.quoteRequests} />}
        {tab === 'reports' && <ReportsTab products={store.products} clients={store.clients} orders={orderStore.orders} quoteRequests={orderStore.quoteRequests} />}
        {tab === 'orders' && <OrdersTab orders={visibleOrders} updateStatus={orderStore.updateStatus} refresh={orderStore.refresh} title="Pedidos" deleteOrder={orderStore.deleteOrder} />}
        {tab === 'quotes' && <OrdersTab orders={visibleQuotes} updateStatus={orderStore.updateStatus} refresh={orderStore.refresh} title="Orçamentos" extraQuotes={orderStore.quoteRequests} updateQuoteStatus={orderStore.updateQuoteStatus} deleteOrder={orderStore.deleteOrder} deleteQuoteRequest={orderStore.deleteQuoteRequest} />}
        {tab === 'access' && <AccessRequestsTab addClient={store.addClient} />}
        {tab === 'recovery' && <RecoveryTab clients={store.clients} updateClient={store.updateClient} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'leads' && <LeadsTabPlaceholder addClient={store.addClient} clients={store.clients} />}
        {tab === 'products' && <ProductsTab {...store} />}
        {tab === 'empresas' && <EmpresasTab />}
        {tab === 'clients' && <ClientsTab {...store} />}
        {tab === 'launches' && <LaunchesTab />}
        {tab === 'catalogs' && <CatalogsTab />}
        {tab === 'promotions' && <PromotionsTab products={store.products} />}
        {tab === 'bestsellers' && <BestSellersTab products={store.products} />}
        {tab === 'panic' && <PanicTab />}
        {tab === 'csv' && <CSVTab importCSV={store.importCSV} refresh={store.refresh} />}
        </div>
        <SystemFooter />
      </main>
    </div>
  );
}

/* ==================== DASHBOARD ==================== */
function DashTab({ products, clients, orders, quoteRequests }: { products: Product[]; clients: Client[]; orders: Order[]; quoteRequests: QuoteRequest[] }) {
  const [visitsVersion, setVisitsVersion] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'visits' || scope === 'all') setVisitsVersion(v => v + 1);
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);
  const visits14 = useMemo(() => visitService.byDay(14), [visitsVersion]);
  const totalVisits = useMemo(() => visitService.total(), [visitsVersion]);

  const [sysError, setSysError] = useState<SystemErrorInfo | null>(() => getLastSystemError());
  useEffect(() => {
    const handler = (e: Event) => setSysError((e as CustomEvent).detail as SystemErrorInfo | null);
    window.addEventListener(SYSTEM_ERROR_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_ERROR_EVENT, handler);
  }, []);

  const totalPedidos = orders.filter(o => o.type === 'pedido').length;
  const totalOrcamentos = orders.filter(o => o.type === 'orcamento').length + quoteRequests.length;
  const totalRevenue = orders.filter(o => o.type === 'pedido').reduce((s, o) => s + (o.totalWithTax || 0), 0);
  const pendingCount = orders.filter(o => o.status === 'Recebido').length + quoteRequests.filter(q => q.status === 'Recebido').length;

  const stats = [
    { label: 'Receita (pedidos)', value: formatBRL(totalRevenue), icon: TrendingUp, color: 'from-emerald-500 to-emerald-700', sub: `${totalPedidos} pedidos` },
    { label: 'Produtos Ativos', value: products.filter(p => p.active).length, icon: Package, color: 'from-blue-500 to-blue-700', sub: `${products.length} no total` },
    { label: 'Clientes Ativos', value: clients.filter(c => c.active).length, icon: Users, color: 'from-purple-500 to-purple-700', sub: `${clients.length} cadastrados` },
    { label: 'Visitas no Site', value: totalVisits, icon: Eye, color: 'from-[#f7941d] to-[#ff6a00]', sub: 'páginas públicas' },
    { label: 'Orçamentos', value: totalOrcamentos, icon: FileText, color: 'from-indigo-500 to-indigo-700', sub: 'recebidos' },
    { label: 'Pendentes', value: pendingCount, icon: Bell, color: 'from-rose-500 to-rose-700', sub: 'aguardando análise' },
  ];


  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="admin-title-gradient">Painel Administrativo</h1>
          <p className="text-sm text-[#6b7280] mt-1">Visão geral em tempo real do seu negócio</p>
        </div>
        {sysError ? (
          <button
            onClick={clearSystemError}
            title={`${sysError.op} em "${sysError.table}": ${sysError.msg}\n(clique para limpar)`}
            className="flex items-center gap-2 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 max-w-sm"
          >
            <Activity size={14} className="text-red-500 shrink-0" />
            <span className="truncate">Erro detectado: falha ao {sysError.op === 'upsert' ? 'salvar' : sysError.op === 'delete' ? 'excluir' : sysError.op} em "{sysError.table}"</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#6b7280] bg-white px-3 py-2 rounded-lg border border-gray-200">
            <Activity size={14} className="text-emerald-500" /> Sistema operando normalmente
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="admin-card admin-stat p-4">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${s.color} text-white flex items-center justify-center mb-3 shadow-lg`}>
                <Icon size={18} />
              </div>
              <div className="text-xl font-extrabold text-[#111827] leading-tight">{s.value}</div>
              <div className="text-[11px] text-[#6b7280] font-semibold uppercase tracking-wide mt-1">{s.label}</div>
              <div className="text-[10px] text-[#9ca3af] mt-0.5">{s.sub}</div>
            </div>
          );
        })}
      </div>

      <RaioXPanel orders={orders} quoteRequests={quoteRequests} clients={clients} />
    </div>
  );
}


/* ==================== RAIO X DO CLIENTE ==================== */
type RaioSection = 'acesso' | 'interesse' | 'carrinho' | 'pedidos' | 'frequencia' | 'mix' | 'oportunidades';

function RaioXPanel({ orders, quoteRequests, clients }: { orders: Order[]; quoteRequests: QuoteRequest[]; clients: Client[] }) {
  const [section, setSection] = useState<RaioSection>('acesso');
  const [q, setQ] = useState('');
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    activityService.list().then(rows => { setActivity(rows); setLoading(false); });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (section !== 'carrinho') return;
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [section]);

  const term = q.trim().toLowerCase();
  const matches = (...vals: (string | undefined | null)[]) =>
    !term || vals.some(v => (v || '').toLowerCase().includes(term));

  const acts = useMemo(
    () => activity.filter(a => matches(a.client_name, a.client_cnpj, a.brand, a.detail)),
    [activity, term],
  );
  const pedidos = useMemo(
    () => orders.filter(o => o.type === 'pedido' && matches(o.clientName, o.clientCnpj, o.brand)),
    [orders, term],
  );
  const fmtDate = (d: string | number | Date) => new Date(d).toLocaleString('pt-BR');

  /* por cliente */
  const porCliente = useMemo(() => {
    const map: Record<string, { nome: string; cnpj: string; pedidos: Order[] }> = {};
    pedidos.forEach(o => {
      const key = o.clientCnpj || o.clientName || 'N/D';
      if (!map[key]) map[key] = { nome: o.clientName || 'N/D', cnpj: o.clientCnpj || '', pedidos: [] };
      map[key].pedidos.push(o);
    });
    return Object.values(map).map(c => {
      const sorted = [...c.pedidos].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      const datas = sorted.map(o => +new Date(o.createdAt));
      let intervalo = 0;
      if (datas.length > 1) {
        const gaps = datas.slice(1).map((d, i) => (d - datas[i]) / 86400000);
        intervalo = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }
      const ultimo = sorted[sorted.length - 1];
      const total = c.pedidos.reduce((t, o) => t + (o.totalWithTax || 0), 0);
      const itens = c.pedidos.flatMap(o => o.items || []);
      return { ...c, qtd: c.pedidos.length, total, ultimo, intervalo, itens };
    }).sort((a, b) => b.total - a.total);
  }, [pedidos]);

  const sections: { id: RaioSection; label: string; icon: typeof Eye; hint: string }[] = [
    { id: 'acesso', label: 'Acesso', icon: Users, hint: 'Quem acessou e qual empresa procurou' },
    { id: 'interesse', label: 'Interesse', icon: Search, hint: 'O que o cliente procurou' },
    { id: 'carrinho', label: 'Carrinho', icon: ShoppingCart, hint: 'Itens adicionados e carrinho abandonado' },
    { id: 'pedidos', label: 'Pedidos', icon: FileText, hint: 'Quantidade, último pedido e produtos' },
    { id: 'frequencia', label: 'Frequência', icon: Activity, hint: 'Intervalo entre pedidos e última compra' },
    { id: 'mix', label: 'Mix', icon: Building2, hint: 'Compras por empresa' },
    { id: 'oportunidades', label: 'Oportunidades', icon: Flame, hint: 'Pesquisou e não comprou' },
  ];

  const Table = ({ head, rows }: { head: string[]; rows: (React.ReactNode[])[] }) => (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-[#f3f4f6]">
          <tr>{head.map(h => <th key={h} className="p-2 text-left font-semibold text-[#374151]">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={head.length} className="p-6 text-center text-[#9ca3af]">Sem informações para esta busca.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb]">
              {r.map((c, j) => <td key={j} className="p-2 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSection = () => {
    if (section === 'acesso') {
      const rows = acts.filter(a => a.kind === 'acesso').slice(0, 80)
        .map(a => [a.client_name || 'Visitante', a.client_cnpj || '—', a.brand || '—', fmtDate(a.created_at)]);
      return <Table head={['Cliente', 'CNPJ', 'Empresa procurada', 'Quando']} rows={rows} />;
    }
    if (section === 'interesse') {
      const map: Record<string, { termo: string; cliente: string; empresa: string; vezes: number; ultima: string }> = {};
      acts.filter(a => a.kind === 'busca').forEach(a => {
        const key = `${a.client_cnpj || a.client_name}|${(a.detail || '').toLowerCase()}`;
        if (!map[key]) map[key] = { termo: a.detail || '', cliente: a.client_name || '—', empresa: a.brand || '—', vezes: 0, ultima: a.created_at };
        map[key].vezes += 1;
        if (+new Date(a.created_at) > +new Date(map[key].ultima)) map[key].ultima = a.created_at;
      });
      const rows = Object.values(map).sort((a, b) => b.vezes - a.vezes).slice(0, 80)
        .map(r => [r.cliente, <strong key="t">{r.termo}</strong>, r.empresa, r.vezes, fmtDate(r.ultima)]);
      return <Table head={['Cliente', 'Pesquisou', 'Empresa', 'Vezes', 'Última vez']} rows={rows} />;
    }
    if (section === 'carrinho') {
      const latestByClientBrand = new Map<string, ActivityRow>();
      acts.filter(a => a.kind === 'carrinho_salvo').forEach(a => {
        const key = `${a.client_id || a.client_cnpj || a.client_name || 'sem-cliente'}|${a.brand || ''}`;
        if (!latestByClientBrand.has(key)) latestByClientBrand.set(key, a);
      });
      const salvos = [...latestByClientBrand.values()].filter(a => Number((a.meta as any)?.itens || 0) > 0);
      const abandonados = salvos.filter(a => {
        const depois = pedidos.some(o =>
          (o.clientCnpj || '') === (a.client_cnpj || '') && +new Date(o.createdAt) > +new Date(a.created_at));
        return !depois;
      });
      const snapshotItems = salvos.flatMap(a => {
        const cartItems = Array.isArray((a.meta as any)?.items) ? (a.meta as any).items : [];
        return cartItems.map((item: any) => ({
          client: a.client_name || '—',
          product: item?.name || item?.code || '—',
          qty: String(item?.qty ?? ''),
          brand: a.brand || '—',
          createdAt: a.created_at,
        }));
      });
      const rowsItens = snapshotItems.length > 0
        ? snapshotItems.slice(0, 80).map(item => [item.client, item.product, item.qty, item.brand, fmtDate(item.createdAt)])
        : acts.filter(a => a.kind === 'carrinho').slice(0, 60)
          .map(a => [a.client_name || '—', a.detail || '—', String((a.meta as any)?.qty ?? ''), a.brand || '—', fmtDate(a.created_at)]);
      return (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-bold text-[#111827] mb-2">Carrinho abandonado ({abandonados.length})</h4>
            <Table
              head={['Cliente', 'Empresa', 'Itens', 'Valor', 'Salvo em']}
              rows={abandonados.slice(0, 40).map(a => [
                a.client_name || '—', a.brand || '—',
                String((a.meta as any)?.itens ?? ''),
                formatBRL(Number((a.meta as any)?.total || 0)),
                fmtDate(a.created_at),
              ])}
            />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#111827] mb-2">Itens adicionados ao carrinho</h4>
            <Table head={['Cliente', 'Produto', 'Qtd', 'Empresa', 'Quando']} rows={rowsItens} />
          </div>
        </div>
      );
    }
    if (section === 'pedidos') {
      const rows = porCliente.map(c => [
        <strong key="n">{c.nome}</strong>, c.cnpj || '—', c.qtd,
        c.ultimo ? `${orderNumber(c.ultimo)} — ${fmtDate(c.ultimo.createdAt)}` : '—',
        formatBRL(c.total),
        <span key="p" className="text-[11px] text-[#6b7280]">{[...new Set(c.itens.map(i => i.name))].slice(0, 4).join(' • ') || '—'}</span>,
      ]);
      return <Table head={['Cliente', 'CNPJ', 'Qtd. pedidos', 'Último pedido', 'Total comprado', 'Produtos comprados']} rows={rows} />;
    }
    if (section === 'frequencia') {
      const rows = porCliente.map(c => [
        <strong key="n">{c.nome}</strong>,
        c.qtd,
        c.intervalo ? `${c.intervalo.toFixed(0)} dias` : '—',
        c.ultimo ? fmtDate(c.ultimo.createdAt) : '—',
        c.ultimo ? `${Math.floor((Date.now() - +new Date(c.ultimo.createdAt)) / 86400000)} dias` : '—',
      ]);
      return <Table head={['Cliente', 'Pedidos', 'Intervalo médio', 'Última compra', 'Sem comprar há']} rows={rows} />;
    }
    if (section === 'mix') {
      const map: Record<string, { pedidos: number; total: number; clientes: Set<string> }> = {};
      pedidos.forEach(o => {
        const b = o.brand || 'N/D';
        if (!map[b]) map[b] = { pedidos: 0, total: 0, clientes: new Set() };
        map[b].pedidos += 1;
        map[b].total += o.totalWithTax || 0;
        map[b].clientes.add(o.clientCnpj || o.clientName || '');
      });
      const rows = Object.entries(map).sort((a, b) => b[1].total - a[1].total)
        .map(([b, v]) => [<strong key="b">{b}</strong>, v.pedidos, v.clientes.size, formatBRL(v.total),
          formatBRL(v.pedidos ? v.total / v.pedidos : 0)]);
      return <Table head={['Empresa', 'Pedidos', 'Clientes', 'Faturamento', 'Ticket médio']} rows={rows} />;
    }
    // oportunidades
    const comprados: Record<string, string> = {};
    pedidos.forEach(o => {
      const key = o.clientCnpj || o.clientName || '';
      comprados[key] = `${comprados[key] || ''} ${(o.items || []).map(i => `${i.name} ${i.code}`).join(' ')}`.toLowerCase();
    });
    const interesses = acts.filter(a => a.kind === 'busca' || a.kind === 'carrinho');
    const map: Record<string, { cliente: string; item: string; origem: string; quando: string }> = {};
    interesses.forEach(a => {
      const key = a.client_cnpj || a.client_name || '';
      const alvo = (a.detail || '').toLowerCase();
      if (!alvo) return;
      if ((comprados[key] || '').includes(alvo)) return;
      const k = `${key}|${alvo}`;
      if (!map[k] || +new Date(a.created_at) > +new Date(map[k].quando)) {
        map[k] = {
          cliente: a.client_name || '—',
          item: a.detail || '',
          origem: a.kind === 'busca' ? 'Pesquisou' : 'Colocou no carrinho',
          quando: a.created_at,
        };
      }
    });
    const rows = Object.values(map).sort((a, b) => +new Date(b.quando) - +new Date(a.quando)).slice(0, 80)
      .map(r => [r.cliente, <strong key="i">{r.item}</strong>, r.origem, fmtDate(r.quando)]);
    return <Table head={['Cliente', 'Procurou / adicionou', 'Origem', 'Quando']} rows={rows} />;
  };

  const active = sections.find(s => s.id === section)!;

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="font-bold text-[#111827] flex items-center gap-2">
            <BarChart3 size={16} className="text-[#f7941d]" /> Raio X do Cliente
          </h3>
          <p className="text-xs text-[#6b7280] mt-0.5">{active.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar cliente, CNPJ, empresa ou produto"
              className="pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-72 max-w-full"
            />
          </div>
          <button onClick={load} className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 text-[#374151] hover:bg-gray-50 inline-flex items-center gap-1">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {sections.map((s, i) => {
          const Icon = s.icon;
          const on = s.id === section;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition-all ${
                on ? 'bg-gradient-to-r from-[#f7941d] to-[#ff7a00] text-white border-[#f7941d] shadow' : 'bg-white text-[#374151] border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} /> {i + 1}º {s.label}
            </button>
          );
        })}
      </div>

      {loading
        ? <div className="text-sm text-[#9ca3af] text-center py-10">Carregando informações…</div>
        : renderSection()}
    </div>
  );
}

/* ==================== REPORTS ==================== */
function ReportsTab({ products, clients, orders, quoteRequests }: { products: Product[]; clients: Client[]; orders: Order[]; quoteRequests: QuoteRequest[] }) {
  const [period, setPeriod] = useState<7 | 14 | 30 | 90>(30);
  const [visitsVersion, setVisitsVersion] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'visits' || scope === 'all') setVisitsVersion(v => v + 1);
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);
  const visits = useMemo(() => visitService.byDay(period), [period, visitsVersion]);
  const totalVisits = useMemo(() => visitService.total(), [visitsVersion]);
  const topPages = useMemo(() => visitService.uniquePaths().slice(0, 8), [visitsVersion]);

  const periodOrders = useMemo(() => {
    const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
    return orders.filter(o => new Date(o.createdAt).getTime() >= cutoff);
  }, [orders, period]);

  const revenue = periodOrders.filter(o => o.type === 'pedido').reduce((s, o) => s + (o.totalWithTax || 0), 0);
  const avgTicket = periodOrders.filter(o => o.type === 'pedido').length
    ? revenue / periodOrders.filter(o => o.type === 'pedido').length : 0;
  const conversion = totalVisits > 0 ? (periodOrders.length / totalVisits) * 100 : 0;

  // Top clients
  const topClients = useMemo(() => {
    const map: Record<string, { name: string; total: number; orders: number }> = {};
    orders.filter(o => o.type === 'pedido').forEach(o => {
      const key = o.clientName || 'N/D';
      if (!map[key]) map[key] = { name: key, total: 0, orders: 0 };
      map[key].total += o.totalWithTax || 0;
      map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders]);

  // Revenue by brand
  const brandRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    periodOrders.filter(o => o.type === 'pedido').forEach(o => {
      map[o.brand || 'N/D'] = (map[o.brand || 'N/D'] || 0) + (o.totalWithTax || 0);
    });
    return Object.entries(map).map(([brand, total]) => ({ brand, total })).sort((a, b) => b.total - a.total);
  }, [periodOrders]);

  const exportCSV = () => {
    const rows = [
      ['Tipo', 'Métrica', 'Valor'],
      ['Período', 'dias', String(period)],
      ['Receita', 'BRL', String(revenue.toFixed(2))],
      ['Pedidos', 'total', String(periodOrders.filter(o => o.type === 'pedido').length)],
      ['Orçamentos', 'total', String(periodOrders.filter(o => o.type === 'orcamento').length + quoteRequests.length)],
      ['Ticket médio', 'BRL', String(avgTicket.toFixed(2))],
      ['Visitas', 'total', String(totalVisits)],
      ['Conversão', '%', String(conversion.toFixed(2))],
      [],
      ['Top Clientes', '', ''],
      ...topClients.map(c => [c.name, String(c.orders) + ' pedidos', c.total.toFixed(2)]),
      [],
      ['Top Páginas', '', ''],
      ...topPages.map(p => [p.path, String(p.count) + ' visitas', '']),
    ];
    const csv = rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `relatorio-moura-${period}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="admin-title-gradient">Relatórios</h1>
          <p className="text-sm text-[#6b7280] mt-1">Análise completa de desempenho e tráfego</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-lg p-1">
            {([7, 14, 30, 90] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${period === p ? 'bg-gradient-to-r from-[#f7941d] to-[#ff7a00] text-white shadow' : 'text-[#6b7280] hover:bg-gray-50'}`}>
                {p}d
              </button>
            ))}
          </div>
          <Button variant="cta" size="sm" onClick={exportCSV}><Download size={14} className="mr-1" /> Exportar CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="admin-card admin-stat p-5">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold">Receita ({period}d)</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-2">{formatBRL(revenue)}</div>
        </div>
        <div className="admin-card admin-stat p-5">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold">Ticket Médio</div>
          <div className="text-2xl font-extrabold text-[#f7941d] mt-2">{formatBRL(avgTicket)}</div>
        </div>
        <div className="admin-card admin-stat p-5">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold">Visitas Totais</div>
          <div className="text-2xl font-extrabold text-blue-600 mt-2">{totalVisits}</div>
        </div>
        <div className="admin-card admin-stat p-5">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold">Taxa Conversão</div>
          <div className="text-2xl font-extrabold text-purple-600 mt-2">{conversion.toFixed(2)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-card p-5">
          <h3 className="font-bold text-[#111827] mb-4 flex items-center gap-2"><Eye size={16} className="text-[#f7941d]" /> Tráfego — {period} dias</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={visits}>
              <defs>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f7941d" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f7941d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="visits" stroke="#f7941d" fill="url(#gV)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-card p-5">
          <h3 className="font-bold text-[#111827] mb-4 flex items-center gap-2"><Building2 size={16} className="text-[#f7941d]" /> Receita por Empresa</h3>
          {brandRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={brandRevenue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                <YAxis type="category" dataKey="brand" stroke="#9ca3af" fontSize={11} width={90} />
                <Tooltip formatter={(v: any) => formatBRL(Number(v))} contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="#f7941d" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-[#9ca3af] text-center py-16">Sem dados no período</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-card p-5">
          <h3 className="font-bold text-[#111827] mb-4 flex items-center gap-2"><Users size={16} className="text-[#f7941d]" /> Top Clientes (geral)</h3>
          {topClients.length > 0 ? (
            <div className="space-y-2">
              {topClients.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-gray-50 to-white border border-gray-100">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${i === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#111827] truncate">{c.name}</div>
                    <div className="text-[11px] text-[#6b7280]">{c.orders} pedido(s)</div>
                  </div>
                  <div className="text-sm font-bold text-emerald-600">{formatBRL(c.total)}</div>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-[#9ca3af] text-center py-12">Sem pedidos ainda</div>}
        </div>

        <div className="admin-card p-5">
          <h3 className="font-bold text-[#111827] mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-[#f7941d]" /> Páginas Mais Visitadas</h3>
          {topPages.length > 0 ? (
            <div className="space-y-2">
              {topPages.map(p => {
                const max = topPages[0].count || 1;
                const pct = (p.count / max) * 100;
                return (
                  <div key={p.path}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[#374151] truncate max-w-[70%]">{p.path}</span>
                      <span className="font-bold text-[#f7941d]">{p.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#f7941d] to-[#ff7a00] rounded-full transition-all" style={{ width: pct + '%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div className="text-sm text-[#9ca3af] text-center py-12">Sem dados de visitas ainda</div>}
        </div>
      </div>
    </div>
  );
}

/* ==================== ORDERS ==================== */
function downloadOrderPdf(o: Order) {
  generateOrderPdf({
    type: o.type,
    brand: o.brand,
    clientName: o.clientName,
    clientCnpj: o.clientCnpj,
    items: o.items,
    total: o.totalWithTax,
    paymentMethod: '',
    paymentTerm: '',
    orderNumber: orderNumber(o),
    createdAt: o.createdAt,
  });
}

function ClientLeadBadge({ cnpj }: { cnpj: string }) {
  const isLead = useMemo(() => {
    const c = cnpj.replace(/\D/g, '');
    return leadService.getAll().some(l => l.cnpj.replace(/\D/g, '') === c);
  }, [cnpj]);
  return (
    <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle ${isLead ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
      {isLead ? 'LEAD' : 'CLIENTE'}
    </span>
  );
}

function OrdersTab({ orders, updateStatus, refresh, title, extraQuotes, updateQuoteStatus, deleteOrder, deleteQuoteRequest }: {
  orders: Order[]; updateStatus: (id: string, status: OrderStatus) => void; refresh: () => void; title: string;
  extraQuotes?: QuoteRequest[]; updateQuoteStatus?: (id: string, status: OrderStatus) => void;
  deleteOrder?: (id: string) => void; deleteQuoteRequest?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Order | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<QuoteRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQ, setSearchQ] = useState<string>('');

  const openOrder = (o: Order) => {
    if (o.status === 'Recebido') {
      updateStatus(o.id, 'Em análise');
      setSelected({ ...o, status: 'Em análise' });
    } else {
      setSelected(o);
    }
  };

  const openQuote = (q: QuoteRequest) => {
    if (updateQuoteStatus && q.status === 'Recebido') {
      updateQuoteStatus(q.id, 'Em análise');
      setSelectedQuote({ ...q, status: 'Em análise' });
    } else {
      setSelectedQuote(q);
    }
  };

  const matchSearch = (name: string, cnpj: string) => {
    if (!searchQ.trim()) return true;
    const q = searchQ.trim().toLowerCase();
    const cleanQ = q.replace(/\D/g, '');
    const nameMatch = name.toLowerCase().includes(q);
    const cnpjMatch = cleanQ.length > 0 && cnpj.replace(/\D/g, '').includes(cleanQ);
    return nameMatch || cnpjMatch;
  };

  const filtered = orders.filter(o =>
    (filterStatus === 'all' || o.status === filterStatus) &&
    matchSearch(o.clientName, o.clientCnpj)
  );
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filteredQuotes = extraQuotes ? extraQuotes.filter(q =>
    (filterStatus === 'all' || q.status === filterStatus) &&
    matchSearch(q.companyName, q.cnpj)
  ) : [];
  const sortedQuotes = [...filteredQuotes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (selectedQuote && updateQuoteStatus) {
    return (
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold text-[#111827]">Solicitação {selectedQuote.id.slice(0, 8).toUpperCase()} <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-semibold align-middle">LEAD</span></h1>
          <button onClick={() => setSelectedQuote(null)} className="text-[#f7941d] hover:underline text-sm shrink-0">← Voltar</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm text-[#111827]">
          <div><span className="text-[#6b7280]">Empresa:</span><br/><strong>{selectedQuote.companyName}</strong></div>
          <div><span className="text-[#6b7280]">CNPJ:</span><br/>{selectedQuote.cnpj}</div>
          <div><span className="text-[#6b7280]">Contato:</span><br/>{selectedQuote.contactName}</div>
          <div><span className="text-[#6b7280]">WhatsApp:</span><br/>{selectedQuote.whatsapp}</div>
          <div><span className="text-[#6b7280]">Empresa:</span><br/><strong>{selectedQuote.brand}</strong></div>
          <div><span className="text-[#6b7280]">Data:</span><br/>{new Date(selectedQuote.createdAt).toLocaleString('pt-BR')}</div>
          <div><span className="text-[#6b7280]">Status:</span><br/><span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[selectedQuote.status]}`}>{selectedQuote.status}</span></div>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
          <table className="w-full text-xs">
            <thead className="bg-[#f3f4f6]"><tr>{['Código', 'Descrição', 'Qtd'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
            <tbody>
              {selectedQuote.items.map((item, idx) => (
                <tr key={`${item.productId}-${idx}`} className="border-t border-gray-200 text-[#111827]">
                  <td className="p-2 font-mono">{item.code}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {ALL_STATUSES.map(s => (
            <Button key={s} size="sm" variant={selectedQuote.status === s ? 'cta' : 'outline'}
              onClick={() => { updateQuoteStatus(selectedQuote.id, s); setSelectedQuote({ ...selectedQuote, status: s }); }}>
              {s}
            </Button>
          ))}
          {deleteQuoteRequest && (
            <Button size="sm" className="ml-auto bg-red-500 hover:bg-red-600 text-white"
              onClick={() => { if (confirm('Remover esta solicitação? Esta ação não pode ser desfeita.')) { deleteQuoteRequest(selectedQuote.id); setSelectedQuote(null); } }}>
              <Trash2 size={14} /> Remover
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold text-[#111827]">{title === 'Pedidos' ? 'Pedido' : 'Orçamento'} {orderNumber(selected)}</h1>
          <button onClick={() => setSelected(null)} className="text-[#f7941d] hover:underline text-sm shrink-0">← Voltar</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm text-[#111827]">
          <div><span className="text-[#6b7280]">Cliente:</span><br/><strong>{selected.clientName}</strong> <ClientLeadBadge cnpj={selected.clientCnpj} /></div>
          <div><span className="text-[#6b7280]">CNPJ:</span><br/>{selected.clientCnpj}</div>
          <div><span className="text-[#6b7280]">Empresa:</span><br/><strong>{selected.brand}</strong></div>
          <div><span className="text-[#6b7280]">Data:</span><br/>{new Date(selected.createdAt).toLocaleString('pt-BR')}</div>
          <div><span className="text-[#6b7280]">Tipo:</span><br/><span className="uppercase font-semibold">{selected.type}</span></div>
          <div><span className="text-[#6b7280]">Status:</span><br/><span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[selected.status]}`}>{selected.status}</span></div>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
          <table className="w-full text-xs">
            <thead className="bg-[#f3f4f6]"><tr>{['Código', 'Descrição', 'Qtd', 'Preço Unit.', 'Total'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
            <tbody>
              {selected.items.map((item, idx) => (
                <tr key={`${item.productId}-${idx}`} className="border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb]">
                  <td className="p-2 font-mono">{item.code}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.qty}</td>
                  <td className="p-2 text-right">{formatBRL(item.unitPrice || item.salePrice)}</td>
                  <td className="p-2 text-right font-semibold">{formatBRL(item.totalPrice || item.totalWithTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-1 text-sm max-w-sm text-[#111827]">
          <div className="flex justify-between font-bold text-lg"><span>Total:</span><span className="text-[#f7941d]">{formatBRL(selected.totalWithTax)}</span></div>
        </div>
        {(selected.observations || selected.purchaseOrder || selected.invoiceNote || selected.buyer || selected.paymentMethod || selected.paymentTerm) && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-sm text-[#111827]">
            <h3 className="text-base font-bold mb-3 text-[#111827]">Informações do pedido</h3>
            {selected.observations && (
              <div className="mb-3">
                <span className="text-[#6b7280]">Observações:</span>
                <p className="whitespace-pre-wrap mt-0.5">{selected.observations}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {selected.purchaseOrder && <div><span className="text-[#6b7280]">Ordem de compra:</span><br/><strong>{selected.purchaseOrder}</strong></div>}
              {selected.invoiceNote && <div><span className="text-[#6b7280]">Observação Nota Fiscal:</span><br/><strong>{selected.invoiceNote}</strong></div>}
              {selected.buyer && <div><span className="text-[#6b7280]">Comprador:</span><br/><strong>{selected.buyer}</strong></div>}
              {selected.paymentMethod && <div><span className="text-[#6b7280]">Meio de pagamento:</span><br/><strong>{selected.paymentMethod}</strong></div>}
              {selected.paymentTerm && <div><span className="text-[#6b7280]">Prazo:</span><br/><strong>{selected.paymentTerm}</strong></div>}
            </div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap items-center">
          {ALL_STATUSES.map(s => {
            const isActive = selected.status === s;
            return (
              <button
                key={s}
                onClick={() => { updateStatus(selected.id, s); setSelected({ ...selected, status: s }); }}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  isActive
                    ? 'bg-[#f7941d] text-white border-[#f7941d]'
                    : 'bg-[#374151] text-white border-[#374151] hover:bg-[#1f2937]'
                }`}
              >
                {s}
              </button>
            );
          })}
          <button
            onClick={() => {
              if (!confirm('Devolver este pedido ao cliente? Ele volta a ficar editável para incluir itens esquecidos.')) return;
              updateStatus(selected.id, 'Rascunho');
              setSelected({ ...selected, status: 'Rascunho' });
              toast.success('Pedido devolvido. O cliente já pode editar e reenviar.');
            }}
            className="px-3 py-1.5 rounded text-xs font-semibold border border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100 inline-flex items-center gap-1"
          >
            <RefreshCw size={14} /> Devolver Pedido
          </button>
          <button
            onClick={() => downloadOrderPdf(selected)}
            className="ml-auto px-3 py-1.5 rounded text-xs font-semibold border border-[#f7941d] text-[#f7941d] bg-white hover:bg-orange-50 inline-flex items-center gap-1"
          >
            <Download size={14} /> Baixar PDF
          </button>
          {deleteOrder && (
            <button
              onClick={() => { if (confirm(`Remover ${selected.type === 'pedido' ? 'pedido' : 'orçamento'} ${orderNumber(selected)}? Esta ação não pode ser desfeita.`)) { deleteOrder(selected.id); setSelected(null); } }}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-red-500 text-white bg-red-500 hover:bg-red-600 inline-flex items-center gap-1"
            >
              <Trash2 size={14} /> Remover
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#111827]">{title}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Buscar por Cliente ou CNPJ..."
              className="text-sm border border-gray-300 rounded p-1.5 pl-7 bg-white text-[#111827] w-56"
            />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="all">Todos os status</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>

      {sortedQuotes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-[#111827]">Solicitações de Orçamento (Visitantes)</h2>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-[#f3f4f6]"><tr>{['Nº', 'Empresa', 'CNPJ', 'Empresa', 'Data', 'Itens', 'Status', 'Ações'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
              <tbody>
                {sortedQuotes.map(q => (
                  <tr key={q.id} className="border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb]">
                    <td className="p-2 font-mono cursor-pointer" onClick={() => openQuote(q)}>#{q.id.slice(0, 8)}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}>{q.companyName}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}>{q.cnpj}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}>{q.brand}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}>{new Date(q.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}>{q.items.length}</td>
                    <td className="p-2 cursor-pointer" onClick={() => openQuote(q)}><span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[q.status]}`}>{q.status}</span></td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openQuote(q)} className="text-[#f7941d] hover:underline">Ver</button>
                        {deleteQuoteRequest && (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm('Remover esta solicitação? Esta ação não pode ser desfeita.')) deleteQuoteRequest(q.id); }}
                            className="text-[#ef4444] hover:underline inline-flex items-center gap-1"
                            title="Remover"
                          ><Trash2 size={14} /> Remover</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sorted.length === 0 && sortedQuotes.length === 0 ? (
        <p className="text-sm text-[#6b7280]">Nenhum registro encontrado.</p>
      ) : sorted.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[#f3f4f6]"><tr>{['Nº', 'Cliente', 'CNPJ', 'Empresa', 'Tipo', 'Data', 'Itens', 'Total', 'Status', 'Ações'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map(o => (
                <tr key={o.id} className="border-t border-gray-200 text-xs text-[#111827] hover:bg-[#f9fafb]">
                  <td className="p-2 font-mono cursor-pointer" onClick={() => openOrder(o)}>{orderNumber(o)}</td>
                  <td className="p-2 cursor-pointer" onClick={() => openOrder(o)}>{o.clientName} <ClientLeadBadge cnpj={o.clientCnpj} /></td>
                  <td className="p-2 font-mono cursor-pointer" onClick={() => openOrder(o)}>{o.clientCnpj}</td>
                  <td className="p-2 cursor-pointer" onClick={() => openOrder(o)}>{o.brand}</td>
                  <td className="p-2 uppercase font-semibold cursor-pointer" onClick={() => openOrder(o)}>{o.type}</td>
                  <td className="p-2 cursor-pointer" onClick={() => openOrder(o)}>{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="p-2 cursor-pointer" onClick={() => openOrder(o)}>{o.items.length}</td>
                  <td className="p-2 font-semibold cursor-pointer" onClick={() => openOrder(o)}>{formatBRL(o.totalWithTax)}</td>
                  <td className="p-2 cursor-pointer" onClick={() => openOrder(o)}><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusColors[o.status]}`}>{o.status}</span></td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openOrder(o)} className="text-[#f7941d] hover:underline">Ver</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadOrderPdf(o); }}
                        className="text-[#374151] hover:text-[#f7941d] inline-flex items-center gap-1"
                        title="Baixar PDF"
                      >
                        <Download size={14} /> PDF
                      </button>
                      {deleteOrder && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Remover ${o.type === 'pedido' ? 'pedido' : 'orçamento'} ${orderNumber(o)}? Esta ação não pode ser desfeita.`)) deleteOrder(o.id); }}
                          className="text-[#ef4444] hover:underline inline-flex items-center gap-1"
                          title="Remover"
                        ><Trash2 size={14} /> Remover</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==================== PRODUTOS SEM DESCONTO (PREÇO FIXO) ==================== */
function FixedPriceModal({ products, updateProduct, onClose }: {
  products: Product[];
  updateProduct: ReturnType<typeof useStore>['updateProduct'];
  onClose: () => void;
}) {
  const [brand, setBrand] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    products.forEach(p => { init[p.id] = !!p.fixedPrice; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const brands = useMemo(
    () => Array.from(new Set(products.map(p => (p.brand || '').trim()).filter(Boolean))).sort(),
    [products],
  );
  const norm = (s: string) => normalizeAdminText(s || '');
  const nq = norm(q);
  const list = products.filter(p => {
    if (brand !== 'all' && norm(p.brand) !== norm(brand)) return false;
    if (!nq) return true;
    return [p.code, p.name, p.category, p.subcategory].some(v => norm(String(v || '')).includes(nq));
  });

  const selectedCount = Object.values(sel).filter(Boolean).length;

  const save = async () => {
    setSaving(true);
    try {
      for (const p of products) {
        const next = !!sel[p.id];
        if (next !== !!p.fixedPrice && !await updateProduct(p.id, { fixedPrice: next })) return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-[#111827]">Produtos sem desconto (preço fixo)</h2>
          <p className="text-xs text-[#6b7280] mt-1">Marque os produtos que NÃO recebem o desconto do cliente. Nada é removido do cadastro.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <select value={brand} onChange={e => setBrand(e.target.value)} className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
              <option value="all">Todas as empresas</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por código ou nome..."
              className="flex-1 min-w-[200px] text-sm border border-gray-300 rounded p-1.5" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {list.length === 0 && <p className="text-sm text-[#6b7280]">Nenhum produto encontrado.</p>}
          {list.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={!!sel[p.id]} onChange={e => setSel(prev => ({ ...prev, [p.id]: e.target.checked }))} />
              <span className="font-mono text-xs text-[#6b7280] w-24 shrink-0">{p.code || '—'}</span>
              <span className="text-sm text-[#111827] flex-1">{p.name}</span>
              <span className="text-xs text-[#6b7280]">{p.brand}</span>
            </label>
          ))}
        </div>
        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-xs text-[#6b7280]">{selectedCount} produto(s) sem desconto</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button variant="cta" size="sm" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== PRODUCTS ==================== */
function ProductsTab({ products, addProduct, updateProduct, deleteProduct, refresh }: ReturnType<typeof useStore>) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFixedPrice, setShowFixedPrice] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim()), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);
  const [topBrand, setTopBrand] = useState('');
  const [topCategory, setTopCategory] = useState('');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const [dataVersion, setDataVersion] = useState(0);
  const toggleCat = (key: string) => setOpenCats(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSub = (key: string) => setCollapsedSubs(prev => ({ ...prev, [key]: prev[key] === undefined ? false : !prev[key] }));
  const empty: Product = { id: '', code: '', name: '', description: '', category: '', subcategory: '', price: 0, hasVariations: false, variations: [], variationGroups: [], combinations: [], minQty: 1, packQty: 1, brand: '', isPromo: false, isNew: false, ipiRate: 0, stRate: 0, synonyms: [], keywords: [], active: true };

  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'categories' || scope === 'category-icons' || scope === 'companies' || scope === 'products' || scope === 'all') {
        setDataVersion(v => v + 1);
      }
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);

  const companies = useMemo(() => categoryService.getCompanies(), [dataVersion]);
  const allCategories = useMemo(() => categoryService.getAll(), [dataVersion]);

  const save = async (input: Product) => {
    try {
      // Normaliza grupos de variação: remove grupos/opções sem nome.
      const cleanGroups = (input.variationGroups || [])
        .map(g => ({ ...g, options: (g.options || []).filter(o => (o.name || '').trim()) }))
        .filter(g => (g.name || '').trim() && g.options.length > 0);
      // Mantém compat com o modelo legado (variations[]) limpando-o.
      const cleanVars = (input.variations || []).filter(v => (v.name || '').trim());
      const hasAnyVar = cleanGroups.length > 0 || cleanVars.length > 0;
      // Combinações são overrides opcionais; exigem 1+ grupo de variação e
      // referenciam uma opção por grupo existente.
      const validOptIds = new Set(cleanGroups.flatMap(g => g.options.map(o => o.id)));
      const seenComboKeys = new Set<string>();
      const cleanCombos = cleanGroups.length >= 1
        ? (input.combinations || []).filter(c => {
            if (c.optionIds.length !== cleanGroups.length) return false;
            if (!c.optionIds.every(id => validOptIds.has(id))) return false;
            const k = combinationKey(c.optionIds);
            if (seenComboKeys.has(k)) return false; // remove duplicadas
            seenComboKeys.add(k);
            return true;
          })
        : [];
      const finalCombos = cleanCombos.map(c => ({
        ...c,
        price: c.price != null ? Number(c.price) : undefined,
        minQty: c.minQty != null ? Number(c.minQty) : undefined,
        sku: c.sku?.trim() || undefined,
      }));
      // Produtos com variações têm os campos Código/Preço ocultos (definidos por
      // combinação). Para que o produto NÃO fique salvo com código vazio e preço
      // zero (a lista mostrava R$ 0,00 e sem código), derivamos um código/preço
      // "base" a partir da combinação mais barata cadastrada.
      let baseCode = input.code;
      let basePrice = Number(input.price || 0);
      if (input.hasVariations && finalCombos.length) {
        const priced = finalCombos.filter(c => c.price != null && Number(c.price) > 0);
        const pick = (priced.length ? priced : finalCombos)
          .reduce((min, c) => (Number(c.price ?? Infinity) < Number(min.price ?? Infinity) ? c : min));
        if (!baseCode?.trim()) baseCode = pick.sku || '';
        if (!basePrice) basePrice = Number(pick.price ?? 0);
      }
      const p: Product = {
        ...input,
        code: baseCode,
        price: basePrice,
        minQty: Number(input.minQty || 1),
        variations: cleanVars,
        variationGroups: cleanGroups,
        combinations: finalCombos,
        hasVariations: !!input.hasVariations && hasAnyVar,
      };
      let saved: Product = p;
      if (p.id) { if (!await updateProduct(p.id, p)) return; }
      else { saved = { ...p, id: crypto.randomUUID() }; if (!await addProduct(saved)) return; }
      // Auto-sync com Lançamentos quando marcado como "Lançamento"
      launchService.syncFromProduct(saved);
      setEditing(null); setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o produto.');
    }
  };

  const searchNorm = normalizeAdminText(search);
  const matchesSearch = (p: Product) => {
    if (!searchNorm) return true;
    const haystack = [
      p.code, p.name, p.brand, p.category, p.subcategory, p.description,
      ...(p.synonyms || []), ...(p.keywords || []),
      ...(p.variationGroups || []).flatMap(g => [g.name, ...(g.options || []).flatMap(o => [o.name, o.sku || ''])]),
      ...(p.combinations || []).map(c => c.sku || ''),
    ].filter(Boolean).map(v => normalizeAdminText(String(v)));
    return haystack.some(h => h.includes(searchNorm));
  };
  const filtered = products.filter(p => {
    if (filterBrand !== 'all' && normalizeAdminText(p.brand) !== normalizeAdminText(filterBrand)) return false;
    if (filterCategory !== 'all' && normalizeAdminText(p.category) !== normalizeAdminText(filterCategory)) return false;
    if (!matchesSearch(p)) return false;
    return true;
  }).sort((a, b) => {
    if (searchNorm) {
      // Prioridade: código exato > código que começa com > demais.
      const rank = (p: Product) => {
        const code = normalizeAdminText(p.code);
        if (code && code === searchNorm) return 0;
        if (code && code.startsWith(searchNorm)) return 1;
        if ((p.combinations || []).some(c => normalizeAdminText(c.sku || '') === searchNorm)) return 0;
        return 2;
      };
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
    }
    return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
  });

  const [dragId, setDragId] = useState<string | null>(null);

  const moveProduct = (group: Product[], idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= group.length) return;
    productService.reorder(group[idx].id, group[newIdx].id);
    refresh();
  };

  /** Drag and drop: reordena o produto arrastado para a posição do alvo, dentro do subgrupo. */
  const handleDropOnProduct = (group: Product[], targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = group.map(p => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    productService.reorderGroup(ids);
    setDragId(null);
    refresh();
  };


  const moveSubgroup = (brand: string, category: string, sub: string, dir: -1 | 1) => {
    categoryService.reorderSubcategory(brand, category, sub, dir);
    setDataVersion(v => v + 1);
    refresh();
  };

  const [dragSub, setDragSub] = useState<string | null>(null);
  /** Drag and drop de subgrupos: reordena o subgrupo arrastado para a posição do alvo. */
  const handleDropOnSubgroup = (brand: string, category: string, orderedSubs: string[], targetSub: string) => {
    if (!dragSub || dragSub === targetSub) { setDragSub(null); return; }
    const arr = [...orderedSubs];
    const from = arr.indexOf(dragSub);
    const to = arr.indexOf(targetSub);
    if (from < 0 || to < 0) { setDragSub(null); return; }
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    categoryService.setSubcategoriesOrder(brand, category, arr);
    setDragSub(null);
    setDataVersion(v => v + 1);
    refresh();
  };

  // Ordena os subgrupos conforme definido na categoria (painel admin)
  const orderSubgroups = (brand: string, category: string, subKeys: string[]): string[] => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const defined = allCategories.find(c => norm(c.brand) === norm(brand) && norm(c.name) === norm(category))?.subcategories || [];
    const idx = (s: string) => { const i = defined.findIndex(d => norm(d) === norm(s)); return i < 0 ? 9999 : i; };
    return [...subKeys].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
  };

  // Ordena as categorias conforme a ordem definida em Empresas (campo order).
  const orderCategoryEntries = <T,>(brand: string, entries: [string, T][]): [string, T][] => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const idx = (name: string) => {
      const c = allCategories.find(cc => norm(cc.brand) === norm(brand) && norm(cc.name) === norm(name));
      return c?.order ?? 9999;
    };
    return [...entries].sort(([a], [b]) => idx(a) - idx(b) || a.localeCompare(b));
  };

  const grouped: Record<string, Record<string, Record<string, typeof products>>> = {};
  filtered.forEach(p => {
    const b = p.brand || 'Sem Empresa';
    const c = p.category || 'Sem Categoria';
    const s = p.subcategory || 'Geral';
    if (!grouped[b]) grouped[b] = {};
    if (!grouped[b][c]) grouped[b][c] = {};
    if (!grouped[b][c][s]) grouped[b][c][s] = [];
    grouped[b][c][s].push(p);
  });

  const openNewWithContext = () => {
    const newProduct = { ...empty, brand: topBrand, category: topCategory };
    setEditing(newProduct);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {showFixedPrice && (
        <FixedPriceModal
          products={products}
          updateProduct={updateProduct}
          onClose={() => setShowFixedPrice(false)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Produtos</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFixedPrice(true)}>Produtos sem desconto</Button>
          <Button variant="cta" size="sm" onClick={() => { setEditing({ ...empty, brand: topBrand, category: topCategory }); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>+ Novo Produto</Button>
        </div>
      </div>

      {/* Top context selectors */}
      <div className="flex gap-3 mb-4 items-end">
        <div>
          <label className="text-xs font-medium text-[#374151] block mb-1">Empresa</label>
          <select value={topBrand} onChange={e => { setTopBrand(e.target.value); setTopCategory(''); setFilterBrand(e.target.value || 'all'); }}
            className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="">Todas</option>
            {companies.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#374151] block mb-1">Categoria</label>
          <select value={topCategory} onChange={e => { setTopCategory(e.target.value); setFilterCategory(e.target.value || 'all'); }}
            className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="">Todas</option>
            {(topBrand ? allCategories.filter(c => c.brand === topBrand) : allCategories).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-[#374151] block mb-1">Pesquisar</label>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder="Código, nome, empresa, categoria, variação..."
              className="w-full text-sm border border-gray-300 rounded p-1.5 pl-7 pr-7 bg-white text-[#111827]"
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#111827]" title="Limpar"><X size={13} /></button>
            )}
          </div>
        </div>
        {topBrand && (
          <Button variant="outline" size="sm" onClick={openNewWithContext}>+ Produto em {topBrand}</Button>
        )}
        <span className="text-xs text-[#6b7280] self-center">{filtered.length} produto(s)</span>
      </div>

      {showForm && editing && <ProductForm key={editing.id || 'new-product'} product={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} companies={companies} allCategories={allCategories} topBrand={topBrand} topCategory={topCategory} />}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([brand, cats]) => (
        <div key={brand} className="mb-6">
          <h2 className="text-lg font-bold text-[#111827] mb-2 border-b-2 border-[#f7941d] pb-1">🏢 {brand}</h2>
          {orderCategoryEntries(brand, Object.entries(cats)).map(([cat, subs]) => { const catKey = `${brand}|${cat}`; const catOpen = !!openCats[catKey] || !!searchNorm; const catCount = Object.values(subs).reduce((sum, list) => sum + list.length, 0); return (
            <div key={cat} className="mb-4 ml-4 border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button onClick={() => toggleCat(catKey)} className="w-full flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] hover:bg-[#e9ebee] text-left transition-colors">
                <ChevronDown size={15} className={`text-[#374151] transition-transform ${catOpen ? '' : '-rotate-90'}`} />
                <h3 className="text-sm font-semibold text-[#374151] flex-1">📂 {cat}</h3>
                <span className="text-[10px] text-[#6b7280]">{catCount} produto(s)</span>
              </button>
              {catOpen && (() => { const subKeys = orderSubgroups(brand, cat, Object.keys(subs)); return subKeys.map((sub, sIdx) => { const prods = subs[sub]; const subKey = `${brand}|${cat}|${sub}`; const collapsed = searchNorm ? false : collapsedSubs[subKey] !== false; return (
                <div key={sub} className="mb-3 ml-4">
                  <div
                    draggable
                    onDragStart={() => setDragSub(sub)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnSubgroup(brand, cat, subKeys, sub)}
                    onDragEnd={() => setDragSub(null)}
                    className={`flex items-center gap-2 mb-1 rounded ${dragSub === sub ? 'opacity-50 bg-orange-50' : ''}`}>
                    <GripVertical size={16} className="text-[#9ca3af] hover:text-[#f7941d] cursor-grab active:cursor-grabbing shrink-0" />
                    <div className="flex flex-col gap-0.5 leading-none">
                      <button onClick={() => moveSubgroup(brand, cat, sub, -1)} disabled={sIdx === 0} className="text-[#374151] disabled:opacity-30 hover:text-[#f7941d] text-[10px]" title="Subir subgrupo">▲</button>
                      <button onClick={() => moveSubgroup(brand, cat, sub, 1)} disabled={sIdx === subKeys.length - 1} className="text-[#374151] disabled:opacity-30 hover:text-[#f7941d] text-[10px]" title="Descer subgrupo">▼</button>
                    </div>
                    <button onClick={() => toggleSub(subKey)} className="flex items-center gap-1.5 text-left hover:text-[#f7941d] transition-colors">
                      <ChevronDown size={14} className={`text-[#374151] transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                      <h4 className="text-xs font-medium text-[#6b7280]">📁 {sub}</h4>
                      <span className="text-[10px] text-[#9ca3af]">({prods.length})</span>
                    </button>
                  </div>
                  {!collapsed && (
                  <div className="overflow-hidden border border-gray-200 rounded-lg w-full">
                    <table className="w-full text-xs table-fixed break-words">
                      <thead className="bg-[#f3f4f6]">
                        <tr>
                          <th className="pl-2 pr-1 py-1 text-left font-medium text-[#374151] w-16">Ordem</th>
                          <th className="pl-4 pr-1 py-1 text-left font-medium text-[#374151] w-16">Imagem</th>
                          <th className="px-1 py-1 text-left font-medium text-[#374151] w-24">Código</th>
                          <th className="px-1 py-1 text-left font-medium text-[#374151]">Descrição</th>
                          <th className="px-1 py-1 text-left font-medium text-[#374151] w-16">Qtd</th>
                          <th className="px-1 py-1 text-left font-medium text-[#374151] w-24">Preço</th>
                          <th className="px-1 py-1 text-left font-medium text-[#374151] w-32">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prods.map((p, i) => {
                          // Produtos com muitas combinações: exibe código/preço da 1ª combinação.
                          const combos = p.combinations || [];
                          const firstCombo = combos.find(c => c.active !== false) || combos[0] || null;
                          const dispCode = firstCombo && firstCombo.sku ? firstCombo.sku : p.code;
                          const dispPrice = firstCombo && firstCombo.price != null ? firstCombo.price : p.price;
                          return (
                          <tr key={p.id}
                            draggable
                            onDragStart={() => setDragId(p.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDropOnProduct(prods, p.id)}
                            onDragEnd={() => setDragId(null)}
                            className={`border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb] ${dragId === p.id ? 'opacity-50 bg-orange-50' : i % 2 === 1 ? 'bg-[#f9fafb]' : 'bg-white'}`}>
                            <td className="pl-2 pr-1 py-1">
                              <div className="flex items-center gap-1.5">
                                <GripVertical size={20} className="text-[#9ca3af] hover:text-[#f7941d] cursor-grab active:cursor-grabbing shrink-0" />
                                <div className="flex flex-col gap-0.5">
                                  <button onClick={() => moveProduct(prods, i, -1)} disabled={i === 0} className="text-[#374151] disabled:opacity-30 hover:text-[#f7941d] text-sm leading-none" title="Subir">▲</button>
                                  <button onClick={() => moveProduct(prods, i, 1)} disabled={i === prods.length - 1} className="text-[#374151] disabled:opacity-30 hover:text-[#f7941d] text-sm leading-none" title="Descer">▼</button>
                                </div>
                              </div>
                            </td>
                            <td className="pl-4 pr-1 py-1">
                              <div className="relative w-9 h-9">
                                <ProductThumb src={p.image} alt={p.name} />
                                {p.isPromo && <img src={seloPromocao} alt="Promoção" className="absolute -top-1 -left-1 w-5 h-5 drop-shadow pointer-events-none" title="Em promoção" />}
                              </div>

                            </td>
                            <td className="px-1 py-1 font-mono break-words select-all cursor-text" onDoubleClick={(e) => { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }}>{dispCode}</td>
                            <td className="px-1 py-1 whitespace-normal leading-snug select-all cursor-text" onDoubleClick={(e) => { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }}>
                              {p.name}
                              {p.isPromo && <span className="ml-1.5 inline-block bg-[#f7941d] text-white text-[9px] font-bold px-1.5 py-0.5 rounded align-middle">PROMOÇÃO</span>}
                            </td>
                            <td className="px-1 py-1">{p.minQty}</td>
                            <td className="px-1 py-1 whitespace-nowrap">{formatBRL(dispPrice)}</td>
                            <td className="px-1 py-1">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <button onClick={() => { setEditing(p); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-[#f7941d] hover:underline">Editar</button>
                                <button onClick={() => { if (confirm('Excluir?')) deleteProduct(p.id); }} className="text-[#ef4444] hover:underline">Excluir</button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              ); }); })()}
            </div>
          ); })}
        </div>
      ))}
    </div>
  );
}

function ProductForm({ product, onSave, onCancel, companies, allCategories, topBrand, topCategory }: { product: Product; onSave: (p: Product) => void; onCancel: () => void; companies: string[]; allCategories: Category[]; topBrand?: string; topCategory?: string }) {
  const [p, setP] = useState(product);
  const [imagePreview, setImagePreview] = useState<string | undefined>(product.image);
  const [priceInput, setPriceInput] = useState(formatMoneyInput(product.price));
  const [minQtyInput, setMinQtyInput] = useState(product.minQty != null ? String(product.minQty) : '');
  const [comboPriceText, setComboPriceText] = useState<Record<string, string>>(() => Object.fromEntries((product.combinations || []).map(c => [c.id, formatMoneyInput(c.price)])));
  const fileRef = useRef<HTMLInputElement>(null);
  const upd = (k: keyof Product, v: any) => setP(prev => ({ ...prev, [k]: v }));

  // Pergunta inicial (somente para produto novo): "esse produto tem variação?".
  // Produtos existentes já têm a resposta definida em hasVariations.
  const [variationChoice, setVariationChoice] = useState<boolean | null>(
    product.id ? !!product.hasVariations : (product.hasVariations ? true : null)
  );

  // Liga/desliga variações garantindo um grupo inicial e respostas coerentes.
  const setHasVariations = (on: boolean) => {
    setVariationChoice(on);
    upd('hasVariations', on);
    if (on) {
      setP(prev => {
        if (prev.variationGroups && prev.variationGroups.length > 0) return { ...prev, hasVariations: true };
        const legacy = normalizeVariationGroups(prev, false);
        const groups: ProductVariationGroup[] = legacy.length > 0
          ? legacy.map(g => ({ id: crypto.randomUUID(), name: g.name, options: g.options.map(o => ({ id: crypto.randomUUID(), name: o.name, active: o.active })) }))
          : [{ id: crypto.randomUUID(), name: '', options: [{ id: crypto.randomUUID(), name: '', active: true }] }];
        return { ...prev, hasVariations: true, variationGroups: groups };
      });
    }
  };

  // Espelhamento automático: quando os filtros do topo mudam, atualiza Empresa/Categoria do form
  useEffect(() => {
    if (topBrand && topBrand !== p.brand) {
      setP(prev => ({ ...prev, brand: topBrand, category: topCategory || '', subcategory: '' }));
    } else if (topCategory && topCategory !== p.category) {
      setP(prev => ({ ...prev, category: topCategory, subcategory: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topBrand, topCategory]);

  const [isDragging, setIsDragging] = useState(false);

  const norm2 = (s?: string) => (s || '').trim().toLowerCase();
  const filteredCats = allCategories.filter(c => norm2(c.brand) === norm2(p.brand));
  // Entre categorias de mesmo nome, prioriza a que possui subcategorias cadastradas.
  const matchingCats = filteredCats.filter(c => norm2(c.name) === norm2(p.category));
  const selectedCat = matchingCats.find(c => (c.subcategories || []).length > 0) || matchingCats[0];
  const subcategories = selectedCat?.subcategories || [];

  const processFile = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
      toast.error('Arquivo inválido. Envie uma imagem JPG, PNG ou WEBP.');
      return;
    }
    // Comprime via canvas e ENVIA AO STORAGE (URL pública), em vez de salvar
    // base64 na coluna `image`. Base64 inflava cada linha de produto e era
    // rebaixado a cada `select('*')`, gerando egress excessivo no Supabase.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 600;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Preview imediato (base64 só na memória local, nunca persistido).
      setImagePreview(canvas.toDataURL('image/jpeg', 0.75));
      canvas.toBlob(async (blob) => {
        URL.revokeObjectURL(objUrl);
        if (!blob) return;
        try {
          const url = await uploadProductImage(blob, 'jpg');
          setImagePreview(url);
          upd('image', url);
        } catch (e) {
          console.error('[upload product image]', e);
          toast.error('Falha ao enviar a imagem do produto.');
        }
      }, 'image/jpeg', 0.75);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      toast.error('Não foi possível ler a imagem. Tente outro arquivo.');
    };
    img.src = objUrl;
  };


  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dt = e.dataTransfer;
    // 1) Arquivo arrastado do computador.
    let file: File | null = dt.files?.[0] ?? null;
    // 2) Fallback: alguns navegadores expõem o arquivo só via items[].
    if (!file && dt.items) {
      for (let i = 0; i < dt.items.length; i++) {
        if (dt.items[i].kind === 'file') { file = dt.items[i].getAsFile(); break; }
      }
    }
    if (file) { processFile(file); return; }
    toast.error('Não foi possível ler a imagem arrastada. Clique na área para selecionar o arquivo.');
  };

  // Impede que soltar a imagem FORA da área de upload faça o navegador abrir o
  // arquivo (o que dava a impressão de que "a imagem não vai"). Enquanto o
  // formulário estiver aberto, bloqueamos o comportamento padrão do navegador.
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);


  const handlePriceChange = (val: string) => {
    const raw = val.replace(/[^\d.,]/g, '');
    setPriceInput(raw);
    const num = parseMoneyInput(raw);
    upd('price', num ?? 0);
  };

  // Pergunta inicial para produtos novos: define o fluxo de cadastro.
  if (variationChoice === null) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4 space-y-4 shadow-sm">
        <h3 className="text-base font-semibold text-[#111827]">Esse produto tem variação?</h3>
        <p className="text-xs text-[#6b7280]">Variação é o mesmo produto com opções diferentes (ex.: <strong>Voltagem</strong>, <strong>Potência</strong>), cada uma com seu próprio preço e código. Se tiver variação, o código e o preço ficam nas variações (não no produto principal).</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="cta" onClick={() => setHasVariations(true)}>Sim, tem variação</Button>
          <Button type="button" variant="outline" onClick={() => setHasVariations(false)}>Não, produto simples</Button>
        </div>
        <button type="button" className="text-xs text-[#6b7280] hover:underline" onClick={onCancel}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
      <div>
        <label className="text-xs font-medium text-[#374151]">Imagem do Produto</label>
        <div
          onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`mt-1 flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-[#f7941d] bg-orange-50' : 'border-gray-300 hover:border-gray-400'}`}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" className="w-24 h-24 object-cover rounded border border-gray-200" />
          ) : (
            <>
              <span className="text-3xl text-[#6b7280]">📷</span>
              <p className="text-xs text-[#6b7280]">Arraste e solte ou clique para selecionar</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
          <p className="text-[10px] text-[#6b7280]">JPG, PNG, WEBP. Imagens serão otimizadas automaticamente.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-[#374151]">Empresa *</label>
          <select className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.brand} onChange={e => { const value = e.target.value; upd('brand', value); upd('category', ''); upd('subcategory', ''); }}>
            <option value="">Selecione...</option>
            {companies.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#374151]">Categoria *</label>
          <select className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.category} onChange={e => { const value = e.target.value; upd('category', value); upd('subcategory', ''); }} disabled={!p.brand}>
            <option value="">Selecione...</option>
            {filteredCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#374151]">Subcategoria</label>
          <select className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.subcategory || ''} onChange={e => upd('subcategory', e.target.value)} disabled={subcategories.length === 0}>
            <option value="">Selecione...</option>
            {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-3"><label className="text-xs font-medium text-[#374151]">Descrição *</label><input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.name} onChange={e => upd('name', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {!p.hasVariations && <div><label className="text-xs font-medium text-[#374151]">Código *</label><input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.code} onChange={e => upd('code', e.target.value)} /></div>}
        {!p.hasVariations && <div><label className="text-xs font-medium text-[#374151]">Qtd Mínima *</label><input type="text" inputMode="numeric" className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={minQtyInput} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setMinQtyInput(v); upd('minQty', v === '' ? 0 : parseInt(v)); }} /></div>}
        {!p.hasVariations && <div>
          <label className="text-xs font-medium text-[#374151]">Preço Unitário *</label>
          <input type="text" inputMode="decimal" className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={priceInput} onChange={e => handlePriceChange(e.target.value)} onBlur={() => setPriceInput(formatMoneyPreserve(priceInput, p.price))} placeholder="Ex: 1000,00 ou 1.000,00" />
        </div>}
      </div>
      <div>
        <label className="text-xs font-medium text-[#374151]">Detalhes do produto (exibido em "Ver detalhes")</label>
        <textarea rows={8} className="w-full min-h-[160px] p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={p.description || ''} onChange={e => upd('description', e.target.value)} placeholder="Descreva características, aplicações, especificações técnicas..." />
      </div>
      <div className="flex gap-3 items-center text-[#111827] flex-wrap">
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.isPromo} onChange={e => upd('isPromo', e.target.checked)} /> Promoção</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.isNew} onChange={e => upd('isNew', e.target.checked)} /> Lançamento</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!p.isFeatured} onChange={e => upd('isFeatured', e.target.checked)} /> Mais Vendidos</label>
        <label className="flex items-center gap-1.5 text-xs" title="Produto com preço fixo não recebe desconto do cliente"><input type="checkbox" checked={!!p.fixedPrice} onChange={e => upd('fixedPrice', e.target.checked)} /> Preço fixo (sem desconto)</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.active} onChange={e => upd('active', e.target.checked)} /> Ativo</label>
      </div>

      {/* ===== Variações de produto (blocos: Amperagem, Cor, Embalagem) ===== */}
      {p.hasVariations && (() => {
        const groups = (p.variationGroups || []);
        const combos = (p.combinations || []);
        const setCombos = (next: ProductCombination[]) => upd('combinations', next);
        const blankCombo = (): ProductCombination => {
          // Gera todas as combinações possíveis (produto cartesiano das opções)
          // e escolhe a primeira que ainda NÃO foi cadastrada, evitando duplicar
          // a mesma seleção (o que fazia o save descartar as combinações repetidas).
          const optionLists = groups.map(g => (g.options || []).map(o => o.id).filter(Boolean));
          const used = new Set(combos.map(c => combinationKey(c.optionIds)));
          let pick: string[] | null = null;
          if (optionLists.every(l => l.length > 0)) {
            const cartesian = optionLists.reduce<string[][]>(
              (acc, list) => acc.flatMap(prefix => list.map(id => [...prefix, id])),
              [[]],
            );
            pick = cartesian.find(combo => !used.has(combinationKey(combo))) ?? null;
          }
          return {
            id: crypto.randomUUID(),
            optionIds: pick ?? (groups.map(g => (g.options || [])[0]?.id).filter(Boolean) as string[]),
            active: true,
          };
        };
        return (
        <div className="border-t border-gray-200 pt-3 space-y-3">
          {/* Enquadro único: todas as variações + código/valor/qtd do conjunto */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
            <p className="text-[10px] text-[#6b7280]">Crie cada variação em um <strong>bloco</strong> com seu nome (ex.: <strong>Amperagem</strong>, <strong>Cor</strong>, <strong>Voltagem</strong>) e use <strong>"Adicionar opção"</strong> para criar as opções. A imagem é herdada do produto principal. O <strong>código, valor e quantidade mínima</strong> são definidos em cada <strong>combinação</strong> abaixo.</p>

            {groups.map((g, gi) => {
              const updGroup = (patch: Partial<ProductVariationGroup>) => {
                const next = [...groups];
                next[gi] = { ...next[gi], ...patch };
                upd('variationGroups', next);
              };
              const updOption = (oi: number, patch: Partial<ProductVariationOption>) => {
                const opts = [...(g.options || [])];
                opts[oi] = { ...opts[oi], ...patch };
                updGroup({ options: opts });
              };
              return (
                <div key={g.id} className="bg-white border border-gray-200 rounded p-3 space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-[#374151] block mb-1">Nome da variação exibido ao cliente *</label>
                      <input className="w-full max-w-xs p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={g.name} placeholder="Ex: Amperagem" onChange={e => updGroup({ name: e.target.value })} />
                    </div>
                    <button type="button" className="text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded" onClick={() => upd('variationGroups', groups.filter((_, j) => j !== gi))}>Remover variação</button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="hidden sm:flex items-center gap-2 text-[10px] font-medium text-[#6b7280] px-0.5">
                      <span className="flex-1">Opção (ex: 10A)</span>
                      <span className="w-12 text-center">Ativo</span>
                      <span className="w-6" />
                    </div>
                    {(g.options || []).map((o, oi) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input className="flex-1 p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={o.name} placeholder="Ex: 10A" onChange={e => updOption(oi, { name: e.target.value })} />
                        <label className="w-12 flex items-center justify-center gap-1 text-[10px]"><input type="checkbox" checked={o.active} onChange={e => updOption(oi, { active: e.target.checked })} /></label>
                        <button type="button" className="w-6 text-red-600 text-xs px-1 py-1 hover:bg-red-50 rounded" onClick={() => updGroup({ options: (g.options || []).filter((_, j) => j !== oi) })}>×</button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => updGroup({ options: [...(g.options || []), { id: crypto.randomUUID(), name: '', active: true }] })}>+ Adicionar opção</Button>
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => upd('variationGroups', [...groups, { id: crypto.randomUUID(), name: '', options: [{ id: crypto.randomUUID(), name: '', active: true }] }])}>+ Adicionar outra variação</Button>
          </div>

          {/* Combinações opcionais com preço/código/qtd próprios */}
          <div className="space-y-2">
            <p className="text-[10px] text-[#6b7280]">Combinações — defina o <strong>preço, código e quantidade mínima</strong> de cada cruzamento exato de opções.</p>
            {combos.map((c, ci) => {
              const updCombo = (patch: Partial<ProductCombination>) => {
                const next = [...combos];
                next[ci] = { ...next[ci], ...patch };
                setCombos(next);
              };
              const setGroupOption = (g: ProductVariationGroup, optionId: string) => {
                const groupOptIds = new Set((g.options || []).map(o => o.id));
                const kept = c.optionIds.filter(id => !groupOptIds.has(id));
                updCombo({ optionIds: [...kept, optionId] });
              };
              return (
                <div key={c.id} className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {groups.map(g => {
                      const sel = c.optionIds.find(id => (g.options || []).some(o => o.id === id)) || '';
                      return (
                        <div key={g.id} className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-medium text-[#374151] block mb-1">{g.name || 'Variação'}</label>
                          <select className="w-full p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={sel} onChange={e => setGroupOption(g, e.target.value)}>
                            <option value="">Selecione...</option>
                            {(g.options || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className="w-full p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={c.sku || ''} placeholder="Código" onChange={e => updCombo({ sku: e.target.value })} />
                    <input type="text" inputMode="decimal" className="w-full p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={comboPriceText[c.id] ?? formatMoneyInput(c.price)} placeholder="Valor (ex: 1.000,00)" onChange={e => { const raw = e.target.value.replace(/[^\d.,]/g, ''); setComboPriceText(prev => ({ ...prev, [c.id]: raw })); updCombo({ price: parseMoneyInput(raw) }); }} onBlur={e => { const raw = e.target.value; setComboPriceText(prev => ({ ...prev, [c.id]: formatMoneyPreserve(raw, c.price) })); }} />
                    <input type="text" inputMode="numeric" className="w-full p-1.5 border border-gray-300 rounded bg-white text-xs text-[#111827]" value={c.minQty != null ? String(c.minQty) : ''} placeholder="Qtd mínima" onChange={e => { const v = e.target.value.replace(/\D/g, ''); updCombo({ minQty: v === '' ? undefined : parseInt(v) }); }} />
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-1.5 text-[11px] text-[#374151]" title="Esta combinação não recebe desconto do cliente"><input type="checkbox" checked={!!c.fixedPrice} onChange={e => updCombo({ fixedPrice: e.target.checked })} /> Preço fixo (sem desconto)</label>
                    <button type="button" className="text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded" onClick={() => setCombos(combos.filter((_, j) => j !== ci))}>Remover combinação</button>
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" disabled={groups.length === 0} onClick={() => setCombos([...combos, blankCombo()])}>+ Criar nova combinação</Button>
          </div>
        </div>
        );
      })()}


      <div className="flex gap-2">
        <Button variant="cta" size="sm" onClick={() => { const mq = parseInt(minQtyInput, 10); const minQty = Number.isFinite(mq) && mq > 0 ? mq : (p.minQty && p.minQty > 0 ? p.minQty : 1); onSave({ ...p, price: parseMoneyInput(priceInput) ?? p.price ?? 0, minQty }); }}>Salvar</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ==================== EMPRESAS (was Categories) ==================== */
function EmpresasTab() {
  const [companies, setCompanies] = useState<string[]>(() => categoryService.getCompanies());
  const [categories, setCategories] = useState<Category[]>(() => categoryService.getAll());
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState('');
  const [showCatForm, setShowCatForm] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<{ name: string; iconUrl?: string; subcategories: string[]; active: boolean }>({ name: '', iconUrl: '', subcategories: [], active: true });
  const [newSubcat, setNewSubcat] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [editSubValue, setEditSubValue] = useState('');
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [rulesDlg, setRulesDlg] = useState<{ brand: string; rules: BrandRules } | null>(null);
  const [globalDlg, setGlobalDlg] = useState<GlobalTexts | null>(null);
  const [newCompanyDlg, setNewCompanyDlg] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [editCompanyDlg, setEditCompanyDlg] = useState<{ original: string; name: string; description: string; logoUrl: string } | null>(null);
  const editLogoRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [rulesLogoUploading, setRulesLogoUploading] = useState(false);
  const [dragCompany, setDragCompany] = useState<string | null>(null);
  const [dragOverCompany, setDragOverCompany] = useState<string | null>(null);

  const handleDropCompany = async (target: string) => {
    const source = dragCompany;
    setDragCompany(null);
    setDragOverCompany(null);
    if (!source || source === target) return;
    const list = [...companies];
    const from = list.indexOf(source);
    const to = list.indexOf(target);
    if (from < 0 || to < 0) return;
    list.splice(from, 1);
    list.splice(to, 0, source);
    setCompanies(list);
    const ok = await categoryService.setCompaniesOrder(list);
    if (!ok) toast.error('Não foi possível salvar a ordem das empresas.');
    refresh();
    setDataVersion(v => v + 1);
  };

  const handleEditLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editCompanyDlg) return;
    const previousLogoUrl = editCompanyDlg.logoUrl;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxW = 400;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Preview imediato (base64 só na memória local, nunca persistido) e, em
      // paralelo, envia ao Storage e guarda APENAS a URL pública (anti-egress).
      setEditCompanyDlg(prev => prev ? { ...prev, logoUrl: canvas.toDataURL('image/png') } : prev);
      setLogoUploading(true);
      canvas.toBlob(async (blob) => {
        if (!blob) { setLogoUploading(false); return; }
        try {
          const url = await uploadCompanyLogo(blob, 'png');
          setEditCompanyDlg(prev => prev ? { ...prev, logoUrl: url } : prev);
        } catch (err) {
          console.error('[upload company logo]', err);
          setEditCompanyDlg(prev => prev ? { ...prev, logoUrl: previousLogoUrl } : prev);
          toast.error('Falha ao enviar a logo da empresa.');
        } finally {
          setLogoUploading(false);
        }
      }, 'image/png');
    };
    img.src = URL.createObjectURL(file);
  };

  const saveCompanyEdit = async () => {
    if (!editCompanyDlg) return;
    if (logoUploading) return;
    const { original } = editCompanyDlg;
    const newName = editCompanyDlg.name.trim();
    if (!newName) return;
    if (editCompanyDlg.logoUrl.startsWith('data:')) {
      toast.error('A imagem ainda não foi enviada. Selecione a imagem novamente.');
      return;
    }
    // Salva descrição e imagem.
    const metaSaved = await categoryService.updateCompanyMeta(original, { description: editCompanyDlg.description, logoUrl: editCompanyDlg.logoUrl });
    if (!metaSaved) return;
    // Renomeia (com cascateamento de marca) se o nome mudou.
    if (newName !== original) {
      if (categoryService.getCompanies().includes(newName)) { alert('Já existe uma empresa com esse nome.'); return; }
      categoryService.renameCompany(original, newName);
      categoryService.getAll().filter(c => normalizeAdminText(c.brand) === normalizeAdminText(original)).forEach(c => categoryService.update(c.id, { brand: newName }));
      productService.getProducts().filter(p => normalizeAdminText(p.brand) === normalizeAdminText(original)).forEach(p => productService.updateProduct(p.id, { brand: newName }));
      launchService.getAllAdmin().filter(l => normalizeAdminText(l.brand) === normalizeAdminText(original)).forEach(l => launchService.update(l.id, { brand: newName }));
      catalogService.getAllAdmin().filter(c => normalizeAdminText(c.brand) === normalizeAdminText(original)).forEach(c => catalogService.update(c.id, { brand: newName }));
      // Move metadados/descrição para o novo nome também no DB.
      await categoryService.updateCompanyMeta(newName, { description: editCompanyDlg.description, logoUrl: editCompanyDlg.logoUrl });
    }
    setEditCompanyDlg(null);
    await refreshTable.companies();
    refresh();
    setDataVersion(v => v + 1);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'categories' || scope === 'category-icons' || scope === 'companies' || scope === 'products' || scope === 'all') {
        refresh();
        setDataVersion(v => v + 1);
      }
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);

  // Migração one-shot de imagens base64 legadas (produtos + logos) -> Storage.
  // Roda UMA única vez após os dados carregarem; idempotente e gated por flag.
  // (Antes era disparada a cada DATA_READY_EVENT — e como a própria migração
  //  emite DATA_READY ao gravar, isso gerava varreduras em laço e travava a CPU.)
  useEffect(() => {
    const t = setTimeout(() => { void migrateLegacyBase64Images(true); }, 4000);
    return () => { clearTimeout(t); };
  }, []);

  const refresh = () => {
    setCategories([...categoryService.getAll()]);
    setCompanies([...categoryService.getCompanies()]);
  };

  useEffect(() => {
    if (!selectedCompany) return;
    const fixed = productService.reconcileProductsWithCategories(categoryService.getAll(), selectedCompany);
    if (fixed > 0) { refresh(); setDataVersion(v => v + 1); }
  }, [selectedCompany]);

  // Quantidade de produtos cadastrados por empresa|categoria
  const productCounts = useMemo(() => {
    const map: Record<string, number> = {};
    productService.getProducts().forEach(p => {
      const k = adminKey(p.brand, p.category);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [categories, dataVersion]);

  const categoriesWithProductFallback = useMemo<Category[]>(() => {
    const byKey = new Map<string, Category>();
    categories.forEach(c => byKey.set(adminKey(c.brand, c.name), { ...c, subcategories: [...(c.subcategories || [])] }));
    productService.getProducts().forEach(p => {
      if (!p.brand?.trim() || !p.category?.trim()) return;
      const key = adminKey(p.brand, p.category);
      const existing = byKey.get(key);
      const sub = (p.subcategory || '').trim();
      if (existing) {
        if (sub && !(existing.subcategories || []).some(s => normalizeAdminText(s) === normalizeAdminText(sub))) {
          existing.subcategories = [...(existing.subcategories || []), sub];
        }
        if (!existing.iconUrl && p.image) existing.iconUrl = p.image;
        return;
      }
      byKey.set(key, {
        id: `derived-category-${key}`,
        name: p.category.trim(),
        brand: p.brand.trim(),
        iconUrl: p.image,
        subcategories: sub ? [sub] : [],
        active: p.active !== false,
        order: p.order ?? 9999,
      });
    });
    return Array.from(byKey.values());
  }, [categories, dataVersion]);

  const subProductCounts = useMemo(() => {
    const map: Record<string, number> = {};
    productService.getProducts().forEach(p => {
      const k = adminKey(p.brand, p.category, p.subcategory);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [categories, dataVersion]);

  const addCompany = () => {
    const name = (newCompany || newCompanyName).trim();
    if (name && !companies.includes(name)) {
      categoryService.addCompany(name);
      setNewCompany('');
      setNewCompanyName('');
      setNewCompanyDlg(false);
      refresh();
    }
  };

  const companyCats = categoriesWithProductFallback.filter(c => normalizeAdminText(c.brand) === normalizeAdminText(selectedCompany)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const saveCat = async () => {
    if (!selectedCompany || !catForm.name.trim()) return;
    let iconUrl = catForm.iconUrl;
    if (iconUrl?.startsWith('data:')) {
      const blob = dataUrlToBlob(iconUrl);
      if (!blob) { toast.error('Não foi possível processar a imagem da categoria.'); return; }
      try {
        iconUrl = await uploadImageBlob(blob, 'categories', 'png');
        setCatForm(prev => ({ ...prev, iconUrl }));
      } catch (e) {
        console.error('[upload category icon]', e);
        toast.error('Falha ao enviar a imagem da categoria.');
        return;
      }
    }
    const data = { name: catForm.name.trim(), brand: selectedCompany, iconUrl, subcategories: catForm.subcategories, active: catForm.active };
    const isDerived = !!editCatId && editCatId.startsWith('derived-category-');
    if (editCatId && !isDerived) {
      // Cascata: renomeia categoria/subcategorias nos PRODUTOS para manter sincronizado.
      const old = categoryService.getAll().find(c => c.id === editCatId);
      if (old) {
        if (normalizeAdminText(old.name) !== normalizeAdminText(data.name)) {
          productService.renameCategory(selectedCompany, old.name, data.name);
        }
        const categoryForSubRename = normalizeAdminText(old.name) !== normalizeAdminText(data.name) ? data.name : old.name;
        const oldSubs = old.subcategories || [];
        data.subcategories.forEach((ns, i) => {
          const os = oldSubs[i];
          if (os && ns && normalizeAdminText(os) !== normalizeAdminText(ns)) {
            productService.renameSubcategory(selectedCompany, categoryForSubRename, os, ns);
          }
        });
      }
      categoryService.update(editCatId, data);
      productService.reconcileProductsWithCategories(categoryService.getAll().map(c => c.id === editCatId ? { ...c, ...data } : c), selectedCompany);
    } else {
      // Categoria "derivada" (existe apenas nos produtos, sem registro próprio):
      // ao editar/inativar precisamos CRIAR o registro real, senão o status
      // Ativa/Inativa não persistia e continuava aparecendo para o cliente.
      categoryService.add(data);
    }
    setShowCatForm(false); setEditCatId(null); setCatForm({ name: '', iconUrl: '', subcategories: [], active: true }); setNewSubcat(''); refresh();
  };

  const addSubcat = () => {
    if (newSubcat.trim() && !catForm.subcategories.includes(newSubcat.trim())) {
      setCatForm(prev => ({ ...prev, subcategories: [...prev.subcategories, newSubcat.trim()] }));
      setNewSubcat('');
    }
  };

  const removeSubcat = (idx: number) => {
    setCatForm(prev => ({ ...prev, subcategories: prev.subcategories.filter((_, i) => i !== idx) }));
  };

  const moveSubcat = (idx: number, dir: -1 | 1) => {
    setCatForm(prev => {
      const arr = [...prev.subcategories];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { ...prev, subcategories: arr };
    });
  };

  // Category reordering (persiste a ordem no Supabase via sort_order)
  const moveCat = (catId: string, dir: -1 | 1) => {
    const idx = companyCats.findIndex(c => c.id === catId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= companyCats.length) return;
    // Swap in main list
    const all = categoryService.getAll();
    const idxA = all.findIndex(c => c.id === companyCats[idx].id);
    const idxB = all.findIndex(c => c.id === companyCats[newIdx].id);
    if (idxA >= 0 && idxB >= 0) {
      [all[idxA], all[idxB]] = [all[idxB], all[idxA]];
      // Reatribui a ordem sequencialmente e persiste cada categoria.
      all.forEach((c, i) => {
        if (c.order !== i) { c.order = i; categoryService.update(c.id, { order: i }); }
      });
      setCachedRows('moura_categories', all);
      refresh();
      setDataVersion(v => v + 1);
    }
  };

  const saveSubEdit = (idx: number) => {
    if (editSubValue.trim()) {
      setCatForm(prev => {
        const arr = [...prev.subcategories];
        arr[idx] = editSubValue.trim();
        return { ...prev, subcategories: arr };
      });
    }
    setEditingSubIdx(null);
    setEditSubValue('');
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];
    if (!file.type.startsWith('image/')) return;
    // Compress icon to reduce size
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxW = 512;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      setCatForm(prev => ({ ...prev, iconUrl: dataUrl }));
    };
    img.src = URL.createObjectURL(file);
  };

  const resetCategories = () => {
    if (confirm('Resetar categorias da Cortag para o padrão? Isso substituirá todas as categorias da Cortag.')) {
      categoryService.resetToDefault();
      refresh();
    }
  };

  // Company list view
  if (!selectedCompany) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-[#111827]">Empresas</h1>
          <Button variant="outline" size="sm" onClick={() => setGlobalDlg(globalTextsService.get())}>
            Textos globais (Política / Informativo)
          </Button>
        </div>
        <div className="flex gap-2 mb-6">
          <input className="flex-1 max-w-xs p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" placeholder="Nome da nova empresa" value={newCompany} onChange={e => setNewCompany(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCompany()} />
          <Button variant="cta" size="sm" onClick={() => { if (newCompany.trim()) addCompany(); else { setNewCompanyName(''); setNewCompanyDlg(true); } }}>+ Nova Empresa</Button>
        </div>
        <p className="text-xs text-[#6b7280] mb-3 flex items-center gap-1">
          <GripVertical className="w-3.5 h-3.5" /> Arraste e solte os cards para reordenar como as empresas aparecem.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map(company => {
            const count = categoriesWithProductFallback.filter(c => normalizeAdminText(c.brand) === normalizeAdminText(company)).length;
            const isActive = categoryService.isCompanyActive(company);
            const doInactivate = async () => {
              const ok = await categoryService.setCompanyActive(company, false);
              categoryService.getAll().filter(c => normalizeAdminText(c.brand) === normalizeAdminText(company)).forEach(c => categoryService.update(c.id, { active: false }));
              productService.getProducts().filter(p => (p.brand || '').toLowerCase() === company.toLowerCase()).forEach(p => productService.updateProduct(p.id, { active: false }));
              if (!ok) alert(`Não foi possível salvar a inativação de "${company}". Tente novamente.`);
              refresh();
            };
            const doActivate = async () => {
              const ok = await categoryService.setCompanyActive(company, true);
              categoryService.getAll().filter(c => normalizeAdminText(c.brand) === normalizeAdminText(company)).forEach(c => categoryService.update(c.id, { active: true }));
              productService.getProducts().filter(p => (p.brand || '').toLowerCase() === company.toLowerCase()).forEach(p => productService.updateProduct(p.id, { active: true }));
              if (!ok) alert(`Não foi possível salvar a reativação de "${company}". Tente novamente.`);
              refresh();
            };
            const doDelete = () => {
              categoryService.getAll().filter(c => normalizeAdminText(c.brand) === normalizeAdminText(company)).forEach(c => categoryService.remove(c.id));
              productService.getProducts().filter(p => (p.brand || '').toLowerCase() === company.toLowerCase()).forEach(p => productService.deleteProduct(p.id));
              categoryService.removeCompany(company);
              void categoryService.setCompanyActive(company, true);
              refresh();
            };
            const askInactivate = (e: React.MouseEvent) => {
              e.stopPropagation(); e.preventDefault();
              setConfirmDlg({
                title: `Inativar "${company}"`,
                message: `Todas as categorias e produtos de "${company}" ficarão ocultos (não serão apagados). Deseja continuar?`,
                onConfirm: doInactivate,
              });
            };
            const askDelete = (e: React.MouseEvent) => {
              e.stopPropagation(); e.preventDefault();
              setConfirmDlg({
                title: `EXCLUIR "${company}"`,
                message: `Esta ação apaga PERMANENTEMENTE a empresa "${company}", suas categorias e produtos. Não pode ser desfeita. Confirmar?`,
                onConfirm: doDelete,
              });
            };
            return (
              <div key={company}
                draggable
                onDragStart={() => setDragCompany(company)}
                onDragEnd={() => { setDragCompany(null); setDragOverCompany(null); }}
                onDragOver={(e) => { e.preventDefault(); if (dragOverCompany !== company) setDragOverCompany(company); }}
                onDrop={(e) => { e.preventDefault(); handleDropCompany(company); }}
                className={`bg-white border-2 rounded-lg p-5 transition-colors shadow-sm flex flex-col gap-3 ${dragOverCompany === company && dragCompany && dragCompany !== company ? 'border-[#f7941d] ring-2 ring-[#f7941d]/40' : isActive ? 'border-gray-200 hover:border-[#f7941d]' : 'border-gray-300 opacity-70'} ${dragCompany === company ? 'opacity-50' : ''}`}>
                <button type="button" onClick={() => setSelectedCompany(company)} className="text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[#111827] flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-[#9ca3af] cursor-grab shrink-0" />
                      🏢 {company}
                    </span>
                    <span className="text-xs text-[#6b7280]">{count} categorias {!isActive && '• Inativa'}</span>
                  </div>
                </button>
                <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap items-center">
                  <Button type="button" variant="cta" size="sm" onClick={() => setSelectedCompany(company)} className="flex-1">
                    📂 Categorias
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); const m = categoryService.getCompanyMeta(company); setEditCompanyDlg({ original: company, name: company, description: m.description || '', logoUrl: m.logoUrl || '' }); }} className="text-[#111827]">
                    Editar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setRulesDlg({ brand: company, rules: brandRulesService.get(company) }); }} className="text-[#111827]">
                    Regras
                  </Button>
                  {isActive ? (
                    <Button type="button" variant="outline" size="sm" onClick={askInactivate} className="text-[#111827]">
                      <X className="w-3 h-3 mr-1" /> Inativar
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); doActivate(); }} className="text-green-700 border-green-300 hover:bg-green-50">
                      <Check className="w-3 h-3 mr-1" /> Ativar
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={askDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2" title="Excluir empresa">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {editCompanyDlg && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditCompanyDlg(null)}>
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-[#111827]">Editar empresa</h3>
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1">Nome da empresa</label>
                <input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={editCompanyDlg.name} onChange={e => { const value = e.target.value; setEditCompanyDlg(prev => prev ? { ...prev, name: value } : prev); }} />
                <p className="text-[11px] text-[#6b7280] mt-1">Ao renomear, categorias, produtos, lançamentos e catálogos desta empresa são atualizados.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1">Descrição</label>
                <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={editCompanyDlg.description} onChange={e => { const value = e.target.value; setEditCompanyDlg(prev => prev ? { ...prev, description: value } : prev); }} placeholder="Breve descrição da empresa..." />
              </div>
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1">Imagem / Logo</label>
                <input ref={editLogoRef} type="file" accept="image/*" onChange={handleEditLogo} className="text-sm block" />
                {logoUploading && <p className="text-[11px] text-[#f7941d] mt-1">Enviando imagem para o Storage…</p>}
                {editCompanyDlg.logoUrl && <img src={editCompanyDlg.logoUrl} alt="Logo" className="mt-2 w-28 h-20 object-contain border border-gray-200 rounded bg-white" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditCompanyDlg(null)}>Cancelar</Button>
                <Button variant="cta" size="sm" onClick={saveCompanyEdit} disabled={logoUploading}>{logoUploading ? 'Enviando…' : 'Salvar'}</Button>
              </div>
            </div>
          </div>
        )}
        {rulesDlg && (() => {
          const r = rulesDlg.rules;
          const update = (patch: Partial<BrandRules>) => setRulesDlg({ ...rulesDlg, rules: { ...r, ...patch } });

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRulesDlg(null)}>
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-[#111827] mb-4">Regras de "{rulesDlg.brand}"</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1">Política Comercial (popup ao selecionar marca)</label>
                    <textarea className="w-full p-2 border border-gray-300 rounded text-sm" rows={4} value={r.policyText || ''} onChange={e => update({ policyText: e.target.value })} placeholder="Ex: Pedido mínimo R$ 1.200. Prazo padrão 28/56/84..." />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1">Aviso / Informativo (popup ao selecionar marca)</label>
                    <textarea className="w-full p-2 border border-gray-300 rounded text-sm" rows={3} value={r.noticeText || ''} onChange={e => update({ noticeText: e.target.value })} placeholder="Ex: Promoção válida até..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1">Pedido Mínimo (R$)</label>
                      <input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={r.minOrderValue ?? ''} onChange={e => update({ minOrderValue: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1">Boleto Mínimo por parcela (R$)</label>
                      <input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={r.minBoletoValue ?? ''} onChange={e => update({ minBoletoValue: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                  </div>

                  {/* Meios de pagamento */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <label className="text-sm font-semibold text-[#111827] block mb-2">Meios de pagamento</label>
                    <div className="flex gap-2 mb-3">
                      {['A Vista', 'Boleto'].map(m => {
                        const methods = r.paymentMethods || [];
                        const on = methods.includes(m);
                        const toggle = () => update({ paymentMethods: on ? methods.filter(x => x !== m) : [...methods, m] });
                        return (
                          <label key={m} className={`text-xs px-3 py-1.5 rounded border cursor-pointer ${on ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-300'}`}>
                            <input type="checkbox" className="hidden" checked={on} onChange={toggle} />
                            {m}
                          </label>
                        );
                      })}
                    </div>
                    {(r.paymentMethods || []).includes('A Vista') && (
                      <div className="mb-3">
                        <label className="text-xs font-medium text-[#374151] block mb-1">Desconto à vista (%)</label>
                        <input type="number" className="w-40 p-2 border border-gray-300 rounded text-sm" value={r.pixDiscountPct ?? ''} onChange={e => update({ pixDiscountPct: e.target.value ? Number(e.target.value) : undefined })} placeholder="Ex: 3" />
                      </div>
                    )}
                    {(r.paymentMethods || []).includes('Boleto') && (
                      <div>
                        <label className="text-xs font-medium text-[#374151] block mb-1">Dias do boleto (um por linha ou separados por vírgula)</label>
                        <textarea
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          rows={3}
                          value={(r.boletoTerms || []).join('\n')}
                          onChange={e => update({ boletoTerms: e.target.value.split('\n') })}
                          placeholder={'28\n28/56\n28/56/84'}
                        />
                        <p className="text-[10px] text-[#6b7280] mt-1">Use "/" para parcelas. Ex: 28/56/84 = 3 parcelas.</p>
                      </div>
                    )}
                  </div>

                  {/* Frete */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <label className="text-sm font-semibold text-[#111827] block mb-2">Frete (selecione 1 ou os dois)</label>
                    <div className="flex gap-2 mb-3">
                      {['CIF', 'FOB'].map(f => {
                        const types = r.freightTypes ?? (r.freightType ? [r.freightType] : []);
                        const on = types.includes(f);
                        const toggle = () => update({ freightTypes: on ? types.filter(x => x !== f) : [...types, f], freightType: undefined });
                        return (
                          <label key={f} className={`text-xs px-3 py-1.5 rounded border cursor-pointer ${on ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-300'}`}>
                            <input type="checkbox" className="hidden" checked={on} onChange={toggle} />
                            {f}
                          </label>
                        );
                      })}
                    </div>
                    {(() => { const types = r.freightTypes ?? (r.freightType ? [r.freightType] : []); return (
                    <div className="grid grid-cols-2 gap-3">
                      {types.includes('CIF') && (
                        <div>
                          <label className="text-xs font-medium text-[#374151] block mb-1">Valor frete CIF (R$)</label>
                          <input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={r.freightCifValue ?? ''} onChange={e => update({ freightCifValue: e.target.value ? Number(e.target.value) : undefined })} placeholder="0 = grátis" />
                        </div>
                      )}
                      {types.includes('FOB') && (
                        <div>
                          <label className="text-xs font-medium text-[#374151] block mb-1">Valor frete FOB (R$)</label>
                          <input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={r.freightFobValue ?? ''} onChange={e => update({ freightFobValue: e.target.value ? Number(e.target.value) : undefined })} placeholder="0 = grátis" />
                        </div>
                      )}
                    </div>
                    ); })()}
                    <div className="mt-3">
                      <label className="text-xs font-medium text-[#374151] block mb-1">Valor mínimo do pedido para frete grátis (R$)</label>
                      <input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={r.freightFreeAbove ?? ''} onChange={e => update({ freightFreeAbove: e.target.value ? Number(e.target.value) : undefined })} placeholder="Ex: 3000 (acima disso, frete grátis)" />
                      <p className="text-[10px] text-[#6b7280] mt-1">Quando o pedido atingir este valor, o frete fica grátis (CIF).</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-2">Logo da empresa (exibida no card do cliente)</label>
                    <div className="flex items-center gap-3">
                      {r.logoUrl && (
                        <div className="w-24 h-16 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
                          <img src={r.logoUrl} alt="logo" className="max-h-14 max-w-[88%] object-contain" />
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return;
                          setRulesLogoUploading(true);
                          try {
                            const ext = file.type.includes('svg') ? 'svg' : file.type.includes('webp') ? 'webp' : file.type.includes('jpeg') ? 'jpg' : 'png';
                            const url = await uploadImageBlob(file, 'brand-logos', ext);
                            update({ logoUrl: url });
                          } catch (err) {
                            console.error('[upload brand rules logo]', err);
                            toast.error('Falha ao enviar a logo da empresa.');
                          } finally {
                            setRulesLogoUploading(false);
                          }
                        }}
                        className="text-xs"
                      />
                      {rulesLogoUploading && <span className="text-[11px] text-[#f7941d]">Enviando…</span>}
                      {r.logoUrl && (
                        <Button type="button" variant="outline" size="sm" onClick={() => update({ logoUrl: undefined })}>Remover</Button>
                      )}
                    </div>
                    <p className="text-[10px] text-[#6b7280] mt-1">PNG/SVG com fundo transparente fica melhor. Se vazio, usa a logo padrão.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" size="sm" onClick={() => setRulesDlg(null)}>Cancelar</Button>
                  <Button type="button" variant="cta" size="sm" disabled={rulesLogoUploading} onClick={async () => { const cleaned = { ...rulesDlg.rules, boletoTerms: (rulesDlg.rules.boletoTerms || []).map(s => s.trim()).filter(Boolean) }; const brand = rulesDlg.brand; await brandRulesService.set(brand, cleaned); toast.success(`Regras de ${brand} salvas.`); setRulesDlg(null); }}>Salvar</Button>
                </div>
              </div>
            </div>
          );
        })()}
        {globalDlg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGlobalDlg(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-[#111827] mb-4">Textos globais do rodapé do cliente</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1">Política Comercial de Vendas</label>
                  <textarea className="w-full p-2 border border-gray-300 rounded text-sm" rows={8} value={globalDlg.policyText || ''} onChange={e => setGlobalDlg({ ...globalDlg, policyText: e.target.value })} placeholder="Texto completo da política comercial..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1">Informativo</label>
                  <textarea className="w-full p-2 border border-gray-300 rounded text-sm" rows={6} value={globalDlg.noticeText || ''} onChange={e => setGlobalDlg({ ...globalDlg, noticeText: e.target.value })} placeholder="Aviso / informativo geral..." />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" size="sm" onClick={() => setGlobalDlg(null)}>Cancelar</Button>
                <Button type="button" variant="cta" size="sm" onClick={() => { globalTextsService.set(globalDlg); setGlobalDlg(null); }}>Salvar</Button>
              </div>
            </div>
          </div>
        )}
        {confirmDlg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDlg(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-[#111827] mb-2">{confirmDlg.title}</h3>
              <p className="text-sm text-[#374151] mb-5">{confirmDlg.message}</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDlg(null)}>Cancelar</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => { const fn = confirmDlg.onConfirm; setConfirmDlg(null); fn(); }}>Confirmar</Button>
              </div>
            </div>
          </div>
        )}
        {newCompanyDlg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setNewCompanyDlg(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-[#111827] mb-3">Nova Empresa</h3>
              <label className="text-sm text-[#374151] block mb-1">Nome da empresa</label>
              <input
                autoFocus
                className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827] mb-4"
                placeholder="Ex.: Nova Marca"
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newCompanyName.trim()) addCompany(); }}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNewCompanyDlg(false)}>Cancelar</Button>
                <Button type="button" variant="cta" size="sm" onClick={addCompany} disabled={!newCompanyName.trim()}>Criar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Category list within company
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedCompany(null)} className="text-[#f7941d] hover:underline text-sm">← Voltar</button>
          <h1 className="text-2xl font-bold text-[#111827]">🏢 {selectedCompany} — Categorias</h1>
        </div>
        <div className="flex gap-2">
          {selectedCompany === 'Cortag' && (
            <Button variant="outline" size="sm" onClick={resetCategories} className="text-[#111827]">🔄 Redefinir</Button>
          )}
          <Button variant="cta" size="sm" onClick={() => { setCatForm({ name: '', iconUrl: '', subcategories: [], active: true }); setEditCatId(null); setShowCatForm(true); }}>+ Nova Categoria</Button>
        </div>
      </div>

      {showCatForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-[#374151]">Nome *</label><input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={catForm.name} onChange={e => { const value = e.target.value; setCatForm(prev => ({ ...prev, name: value })); }} /></div>
            <div>
              <label className="text-xs font-medium text-[#374151]">Ícone (upload PNG/ICO)</label>
              <div className="flex gap-2 items-center mt-1">
                <button onClick={() => iconFileRef.current?.click()} className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 text-[#374151]">📷 Upload</button>
                {catForm.iconUrl && <img src={catForm.iconUrl} alt="" className="w-8 h-8 object-contain rounded border border-gray-200" />}
                {catForm.iconUrl && <button onClick={() => setCatForm(prev => ({ ...prev, iconUrl: '' }))} className="text-red-500 text-xs">✕</button>}
              </div>
              <input ref={iconFileRef} type="file" accept="image/png,image/x-icon,image/ico,.ico,.png" onChange={handleIconUpload} className="hidden" />
            </div>
            <div className="flex items-end"><label className="flex items-center gap-1 text-xs text-[#111827]"><input type="checkbox" checked={catForm.active} onChange={e => { const checked = e.target.checked; setCatForm(prev => ({ ...prev, active: checked })); }} /> Ativa</label></div>
          </div>

          {/* Subcategories with reorder + edit */}
          <div>
            <label className="text-xs font-medium text-[#374151]">Subcategorias</label>
            <div className="flex gap-2 mt-1">
              <input className="flex-1 p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" placeholder="Nome da subcategoria" value={newSubcat} onChange={e => setNewSubcat(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubcat())} />
              <Button variant="outline" size="sm" onClick={addSubcat}>+ Adicionar</Button>
            </div>
            {catForm.subcategories.length > 0 && (
              <div className="mt-2 space-y-1">
                {catForm.subcategories.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveSubcat(i, -1)} disabled={i === 0} className="text-[10px] text-[#6b7280] hover:text-[#111827] disabled:opacity-30">▲</button>
                      <button onClick={() => moveSubcat(i, 1)} disabled={i === catForm.subcategories.length - 1} className="text-[10px] text-[#6b7280] hover:text-[#111827] disabled:opacity-30">▼</button>
                    </div>
                    {editingSubIdx === i ? (
                      <input className="flex-1 p-1 border border-gray-300 rounded text-xs bg-white text-[#111827]" value={editSubValue} onChange={e => setEditSubValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSubEdit(i)} onBlur={() => saveSubEdit(i)} autoFocus />
                    ) : (
                      <span className="flex-1 text-xs text-[#374151]">{s}</span>
                    )}
                    <button onClick={() => { setEditingSubIdx(i); setEditSubValue(s); }} className="text-[#f7941d] text-[10px] hover:underline">Editar</button>
                    <button onClick={() => removeSubcat(i)} className="text-red-400 hover:text-red-600 text-[10px]">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2"><Button variant="cta" size="sm" onClick={saveCat}>Salvar</Button><Button variant="outline" size="sm" onClick={() => setShowCatForm(false)}>Cancelar</Button></div>
        </div>
      )}

      <div className="space-y-2">
        {companyCats.map((c, catIdx) => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedCat(expandedCat === c.id ? null : c.id)}>
              {/* Category reorder buttons */}
              <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => moveCat(c.id, -1)} disabled={catIdx === 0} className="text-[10px] text-[#6b7280] hover:text-[#111827] disabled:opacity-30">▲</button>
                <button onClick={() => moveCat(c.id, 1)} disabled={catIdx === companyCats.length - 1} className="text-[10px] text-[#6b7280] hover:text-[#111827] disabled:opacity-30">▼</button>
              </div>
              <span className="text-xl shrink-0">
                {c.iconUrl ? <img src={c.iconUrl} alt="" className="w-6 h-6 object-contain" /> : '📦'}
              </span>
              <span className="font-medium text-[#111827] flex-1">{c.name} <span className="text-xs font-normal text-[#f7941d]">— {productCounts[adminKey(selectedCompany, c.name)] || 0} produtos</span></span>
              <span className="text-[10px] text-[#6b7280]">{c.subcategories?.length || 0} subcategorias</span>
              <span className="text-xs">{c.active ? '✅' : '❌'}</span>
              <button onClick={(e) => { e.stopPropagation(); setCatForm({ name: c.name, iconUrl: c.iconUrl || '', subcategories: c.subcategories || [], active: c.active }); setEditCatId(c.id); setShowCatForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-[#f7941d] hover:underline text-xs">Editar</button>
              <button onClick={(e) => { e.stopPropagation(); if (c.id.startsWith('derived-category-')) return; if (confirm('Excluir?')) { categoryService.remove(c.id); refresh(); } }} className="text-[#ef4444] hover:underline text-xs disabled:opacity-40" disabled={c.id.startsWith('derived-category-')}>Excluir</button>
              <span className="text-[#6b7280]">{expandedCat === c.id ? '▲' : '▼'}</span>
            </div>
            {expandedCat === c.id && c.subcategories && c.subcategories.length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {c.subcategories.map((s, i) => (
                    <span key={i} className="bg-white border border-gray-200 text-[#374151] px-2.5 py-1 rounded text-xs">
                      {s} <span className="text-[#f7941d]">— {subProductCounts[adminKey(selectedCompany, c.name, s)] || 0} produtos</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {companyCats.length === 0 && <p className="text-sm text-[#6b7280] py-4">Nenhuma categoria cadastrada para {selectedCompany}.</p>}
      </div>
    </div>
  );
}

/* ==================== CLIENTS ==================== */
function ClientsTab({ clients, addClient, updateClient, deleteClient }: ReturnType<typeof useStore>) {
  const { orders: purchaseOrders } = useOrders();
  const { products: historyProducts } = useStore();
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const empty: Client = { id: '', cnpj: '', email: '', password: '', companyName: '', tradeName: '', address: '', classification: 'Standard', network: '', creditLimit: 10000, discountPct: 0, brandDiscounts: {}, active: true, allowedBrands: [] };
  const [form, setForm] = useState<Client>(empty);
  const [search, setSearch] = useState('');
  const [resetClient, setResetClient] = useState<Client | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaved, setPwdSaved] = useState(false);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // Recarrega a lista do banco ao abrir a aba (evita "clientes sumiram" quando
  // a hidratação inicial falhou por sessão/rede).
  useEffect(() => { void refreshTable.clients(); }, []);

  // Conversão de lead → cliente: detecta lead com o mesmo CNPJ digitado.
  const leadMatch = useMemo(() => {
    if (editId) return null;
    const c = (form.cnpj || '').replace(/\D/g, '');
    if (c.length < 14) return null;
    if (clients.some(cl => cl.cnpj.replace(/\D/g, '') === c)) return null;
    return leadService.findByCnpj(c) || null;
  }, [form.cnpj, editId, clients]);

  const applyLead = (lead: Lead) => {
    setConvertingLeadId(lead.id);
    setForm(prev => ({
      ...prev,
      id: lead.id,
      cnpj: lead.cnpj,
      email: lead.email || prev.email,
      password: lead.password || prev.password,
      companyName: lead.companyName || prev.companyName,
      tradeName: lead.contactName || prev.tradeName,
      whatsapp: lead.whatsapp || prev.whatsapp,
      allowedBrands: [...(lead.allowedBrands || [])],
      active: true,
    }));
  };

  const save = () => {
    if (editId) { updateClient(editId, form); }
    else {
      // Se veio de um lead, mantém o MESMO id do perfil (evita duplicate key
      // no CNPJ) e remove o lead apenas do cache local.
      const c = (form.cnpj || '').replace(/\D/g, '');
      const lead = convertingLeadId ? leadService.getAll().find(l => l.id === convertingLeadId) : leadService.findByCnpj(c);
      addClient({ ...form, id: lead ? lead.id : (form.id || crypto.randomUUID()) });
      if (lead) leadService.removeLocal(lead.id);
    }
    setConvertingLeadId(null);
    setShowForm(false); setEditId(null); setForm(empty);
  };

  const toggleBrand = (brandName: string) => {
    setForm(prev => {
      const cur = prev.allowedBrands || [];
      const next = cur.includes(brandName) ? cur.filter(b => b !== brandName) : [...cur, brandName];
      return { ...prev, allowedBrands: next };
    });
  };

  const openReset = (c: Client) => { setResetClient(c); setNewPwd(''); setPwdSaved(false); };
  const closeReset = () => { setResetClient(null); setNewPwd(''); setPwdSaved(false); };
  const saveNewPwd = () => {
    if (!resetClient || newPwd.trim().length < 4) { alert('A nova senha deve ter ao menos 4 caracteres.'); return; }
    updateClient(resetClient.id, { password: newPwd.trim() });
    setResetClient({ ...resetClient, password: newPwd.trim() });
    setPwdSaved(true);
  };
  const sendResetWhatsApp = () => {
    if (!resetClient) return;
    const text = `Olá! Sua nova senha de acesso foi definida.\n\nLogin: ${resetClient.cnpj || resetClient.email}\nSenha: ${resetClient.password}`;
    const raw = (resetClient.whatsapp || '').replace(/\D/g, '');
    if (!raw) { alert('Cliente não possui WhatsApp cadastrado. Edite o cliente para adicionar.'); return; }
    const phone = raw.startsWith('55') ? raw : `55${raw}`;
    window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const removeClient = (c: Client) => {
    if (!confirm(`Excluir definitivamente o cliente "${c.companyName}"? Esta ação não pode ser desfeita.`)) return;
    deleteClient(c.id);
  };

  const filteredClients = clients.filter(c => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const cleanQ = q.replace(/\D/g, '');
    return c.companyName.toLowerCase().includes(q) ||
      (c.tradeName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (cleanQ.length > 0 && c.cnpj.replace(/\D/g, '').includes(cleanQ));
  }).sort((a, b) =>
    (a.companyName || '').localeCompare(b.companyName || '', 'pt-BR') ||
    (a.cnpj || '').localeCompare(b.cnpj || '')
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#111827]">Clientes</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou CNPJ..."
              className="text-sm border border-gray-300 rounded p-1.5 pl-7 bg-white text-[#111827] w-56" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setReloading(true); void refreshTable.clients().finally(() => setReloading(false)); }} disabled={reloading}>
            {reloading ? 'Recarregando…' : 'Recarregar'}
          </Button>
          <Button variant="cta" size="sm" onClick={() => { setForm(empty); setEditId(null); setShowForm(true); }}>+ Novo Cliente</Button>
        </div>
      </div>
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
          {leadMatch && (
            <div className="flex items-start justify-between gap-3 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs text-[#374151]">
                <strong className="text-amber-800">Este CNPJ já está cadastrado como LEAD.</strong>
                <div className="mt-0.5">{leadMatch.companyName} — {leadMatch.contactName || 'sem responsável'} · {leadMatch.whatsapp}</div>
              </div>
              <Button variant="cta" size="sm" onClick={() => applyLead(leadMatch)}>Converter lead em cliente</Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              { k: 'cnpj' as const, l: 'CNPJ' }, { k: 'email' as const, l: 'E-mail' }, { k: 'password' as const, l: 'Senha' },
              { k: 'companyName' as const, l: 'Razão Social' }, { k: 'tradeName' as const, l: 'Responsável' }, { k: 'whatsapp' as const, l: 'WhatsApp *' },
              { k: 'address' as const, l: 'Endereço' },
              { k: 'classification' as const, l: 'Classificação' }, { k: 'network' as const, l: 'Rede' },
            ]).map(f => (
              <div key={f.k}><label className="text-xs font-medium text-[#374151]">{f.l}</label><input
                inputMode={(f.k === 'cnpj' || f.k === 'whatsapp') ? 'numeric' : undefined}
                maxLength={f.k === 'cnpj' ? 18 : f.k === 'whatsapp' ? 15 : undefined}
                className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]"
                value={(form[f.k] as string) || ''}
                onChange={e => {
                  const raw = e.target.value;
                  const val = f.k === 'cnpj' ? formatCNPJMask(raw) : f.k === 'whatsapp' ? formatPhoneMask(raw) : raw;
                  setForm(prev => ({ ...prev, [f.k]: val }));
                }} /></div>
            ))}
            <div><label className="text-xs font-medium text-[#374151]">Limite de Crédito</label><input type="number" className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.creditLimit} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, creditLimit: parseFloat(value) || 0 })); }} /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#374151] block mb-2">Empresas que o cliente pode acessar *</label>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const seen = new Set<string>();
                const list = [...BRANDS.map(b => b.name), ...categoryService.getCompanies()].filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                return list.map(name => {
                  const checked = (form.allowedBrands || []).includes(name);
                  return (
                    <label key={name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors ${checked ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-300 hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleBrand(name)} className="hidden" />
                      {checked ? '✓' : '○'} {name}
                    </label>
                  );
                });
              })()}
            </div>
            <p className="text-[10px] text-[#6b7280] mt-1">O cliente verá apenas as empresas marcadas. Se nenhuma for marcada, ele não conseguirá fazer pedidos.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-[#374151] block mb-2">Desconto (%) por empresa</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                const seen = new Set<string>();
                const list = [...BRANDS.map(b => b.name), ...categoryService.getCompanies()].filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                return list.map(name => {
                  const val = form.brandDiscounts?.[name] ?? 0;
                  return (
                    <div key={name}>
                      <label className="text-[11px] text-[#374151] block mb-1">{name}</label>
                      <div className="relative">
                        <input
                          type="number" step="0.5" min="0" max="100"
                          className="w-full p-2 pr-7 border border-gray-300 rounded bg-white text-sm text-[#111827]"
                          value={val}
                          onChange={e => {
                            const n = parseFloat(e.target.value);
                            setForm(prev => ({
                              ...prev,
                              brandDiscounts: { ...(prev.brandDiscounts || {}), [name]: isNaN(n) ? 0 : n },
                            }));
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#6b7280]">%</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <p className="text-[10px] text-[#6b7280] mt-1">Aplicado automaticamente aos produtos da respectiva empresa nos pedidos do cliente.</p>
          </div>
          <label className="flex items-center gap-1 text-xs text-[#111827]"><input type="checkbox" checked={form.active} onChange={e => { const checked = e.target.checked; setForm(prev => ({ ...prev, active: checked })); }} /> Acesso ativo (cliente inativo não consegue acessar)</label>
          <div className="flex gap-2"><Button variant="cta" size="sm" onClick={save}>Salvar</Button><Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button></div>
        </div>
      )}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-[#f3f4f6]"><tr>{['CNPJ', 'Empresa', 'E-mail', 'Empresas Liberadas', 'Limite', 'Desconto', 'Acesso', 'Ações'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
          <tbody>
            {filteredClients.map((c, i) => (
              <tr key={c.id} className={`border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb] ${i % 2 === 1 ? 'bg-[#f9fafb]' : 'bg-white'}`}>
                <td className="p-2 font-mono">{c.cnpj}</td>
                <td className="p-2">{c.companyName}</td>
                <td className="p-2">{c.email}</td>
                <td className="p-2 text-[10px]">{(c.allowedBrands && c.allowedBrands.length > 0) ? c.allowedBrands.join(', ') : <span className="text-red-500">Nenhuma</span>}</td>
                <td className="p-2">{formatBRL(c.creditLimit)}</td>
                <td className="p-2 text-[10px]">{(() => {
                  const bd = c.brandDiscounts || {};
                  const entries = Object.entries(bd).filter(([, v]) => Number(v) > 0);
                  if (entries.length === 0) return <span className="text-[#6b7280]">{c.discountPct ?? 0}%</span>;
                  return <span>{entries.map(([k, v]) => `${k}: ${v}%`).join(' • ')}</span>;
                })()}</td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setHistoryClient(c)}><BookOpen size={13} /> Histórico de Compra</Button>
                    <button onClick={() => { setForm({ ...empty, ...c, allowedBrands: c.allowedBrands || [] }); setEditId(c.id); setShowForm(true); }} className="px-2 py-1 rounded text-[10px] bg-[#374151] text-white hover:bg-[#4b5563] inline-flex items-center gap-1"><Pencil size={11} /> Editar</button>
                    <button onClick={() => updateClient(c.id, { active: !c.active })} className={`px-2 py-1 rounded text-[10px] inline-flex items-center gap-1 ${c.active ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}>
                      {c.active ? <><X size={11} /> Inativar</> : <><Check size={11} /> Ativar</>}
                    </button>
                    <button onClick={() => openReset(c)} className="px-2 py-1 rounded text-[10px] bg-[#f7941d] text-white hover:bg-[#e08416] inline-flex items-center gap-1"><KeyRound size={11} /> Reset Senha</button>
                    <button onClick={() => removeClient(c)} className="px-2 py-1 rounded text-[10px] bg-red-500 text-white hover:bg-red-600 inline-flex items-center gap-1"><Trash2 size={11} /> Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-[#6b7280]">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!historyClient} onOpenChange={open => { if (!open) setHistoryClient(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico de Compra — {historyClient?.companyName}</DialogTitle></DialogHeader>
          {historyClient && <PurchaseHistory asAdmin key={historyClient.id} clientId={historyClient.id}
            orders={purchaseOrders.filter(o => o.clientId === historyClient.id || o.clientCnpj.replace(/\D/g, '') === historyClient.cnpj.replace(/\D/g, ''))}
            products={historyProducts} />}
        </DialogContent>
      </Dialog>

      {/* Modal Reset Senha */}
      {resetClient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeReset}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#111827] mb-1 flex items-center gap-2"><KeyRound size={18} className="text-[#f7941d]" /> Resetar Senha</h3>
            <p className="text-xs text-[#6b7280] mb-3">Cliente: <strong className="text-[#111827]">{resetClient.companyName}</strong> ({resetClient.cnpj})</p>
            <label className="text-xs font-medium text-[#374151] block mb-1">Nova senha *</label>
            <input
              type="text"
              value={newPwd}
              onChange={e => { setNewPwd(e.target.value); setPwdSaved(false); }}
              placeholder="Digite a nova senha"
              className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827] mb-3"
              autoFocus
            />
            {pwdSaved && (
              <div className="bg-green-50 border border-green-200 text-green-800 text-xs p-2 rounded mb-3">
                ✓ Senha atualizada com sucesso. Use o botão WhatsApp para enviá-la ao cliente.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={closeReset}>Fechar</Button>
              {!pwdSaved ? (
                <Button variant="cta" size="sm" onClick={saveNewPwd}>Salvar nova senha</Button>
              ) : (
                <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" onClick={sendResetWhatsApp}>
                  <MessageCircle size={14} /> Enviar por WhatsApp
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== LAUNCHES ==================== */
function LaunchesTab() {
  const [launches, setLaunches] = useState<LaunchImage[]>(() => launchService.getAllAdmin());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { imageUrl: '', title: '', description: '', ctaLabel: '', ctaUrl: '', brand: 'Cortag', active: true, order: 0 };
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setLaunches(launchService.getAllAdmin());
    void refreshTable.launches().then(() => setLaunches(launchService.getAllAdmin()));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxW = 800;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setForm(prev => ({ ...prev, imageUrl: dataUrl }));
    };
    img.src = URL.createObjectURL(file);
  };

  const save = async () => {
    if (!form.imageUrl) return;
    if (editingId) {
      await launchService.update(editingId, { ...form });
    } else {
      await launchService.add({ ...form, order: launches.length + 1 });
    }
    setShowForm(false); setEditingId(null); setForm(emptyForm); refresh();
  };

  const startEdit = (l: LaunchImage) => {
    setEditingId(l.id);
    setForm({
      imageUrl: l.imageUrl,
      title: l.title || '',
      description: l.description || '',
      ctaLabel: l.ctaLabel || '',
      ctaUrl: l.ctaUrl || '',
      brand: l.brand || 'Cortag',
      active: l.active,
      order: l.order,
    });
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Lançamentos</h1>
        <Button variant="cta" size="sm" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>+ Novo Lançamento</Button>
      </div>
      <p className="text-sm text-[#6b7280] mb-4">Gerencie os lançamentos exibidos no carrossel da página inicial.</p>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#374151]">Imagem (JPG) *</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="text-sm mt-1 block" />
              {form.imageUrl && <img src={form.imageUrl} alt="Preview" className="mt-2 w-40 h-24 object-cover rounded border border-gray-200" />}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-[#374151]">Título *</label>
                <input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.title} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, title: value })); }} placeholder="Ex.: Nova Linha Cortag" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#374151]">Marca *</label>
                <select className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.brand} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, brand: value })); }}>
                  {categoryService.getCompanies().map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#374151]">Descrição breve</label>
                <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.description} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, description: value })); }} placeholder="Breve descrição do lançamento..." />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[#6b7280]">Os botões "Solicitar Acesso" e "Área do Cliente" aparecem fixos no carrossel para todos os lançamentos.</p>
          <div className="flex gap-2">
            <Button variant="cta" size="sm" onClick={save}>{editingId ? 'Salvar alterações' : 'Salvar'}</Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {launches.map(l => (
          <div key={l.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <img src={l.imageUrl} alt={l.title || 'Launch'} className="w-full h-40 object-cover" />
            <div className="p-3 space-y-2">
              <div>
                <p className="text-sm font-medium text-[#111827]">{l.title || 'Sem título'}</p>
                {l.description && <p className="text-xs text-[#6b7280] line-clamp-2">{l.description}</p>}
                <p className="text-[10px] text-[#6b7280] mt-1">{l.active ? '✅ Ativo' : '❌ Inativo'}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => startEdit(l)} className="text-xs text-[#f7941d] hover:underline font-medium">Editar</button>
                <button onClick={() => { launchService.update(l.id, { active: !l.active }); refresh(); }} className="text-xs text-[#6b7280] hover:underline">{l.active ? 'Desativar' : 'Ativar'}</button>
                <button onClick={async () => { if (confirm('Excluir?')) { await launchService.remove(l.id); refresh(); } }} className="text-xs text-[#ef4444] hover:underline">Excluir</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== CSV ==================== */
function CSVTab({ importCSV, refresh }: { importCSV: (csv: string, brand?: string) => Promise<number>; refresh: () => void }) {
  const [results, setResults] = useState<Record<string, string>>({});
  const companies = useMemo(() => categoryService.getCompanies(), []);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = (brand: string) => {
    const file = fileRefs.current[brand]?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setResults(prev => ({ ...prev, [brand]: 'Salvando preços…' }));
      try {
        const count = await importCSV(text, brand);
        refresh();
        setResults(prev => ({ ...prev, [brand]: `${count} preços confirmados em ${brand}.` }));
      } catch (err) {
        setResults(prev => ({ ...prev, [brand]: err instanceof Error ? err.message : 'Não foi possível importar os preços.' }));
      }
    };
    reader.readAsText(file);
  };

  const [backupCfg, setBackupCfg] = useState(() => backupService.getSettings());
  const exportBackup = () => {
    backupService.download();
    setBackupCfg(backupService.getSettings());
  };

  return (
    <div>
      <h1 className="admin-title-gradient mb-2">Importar CSV por Empresa</h1>
      <p className="text-sm text-muted-foreground mb-3">Tabela de preços: codigo;preco. Atualiza apenas produtos e combinações já cadastrados na empresa selecionada.</p>
      <div className="flex flex-wrap gap-3 mb-5">
        <a
          href="/exemplo-produtos.csv"
          download="exemplo-produtos.csv"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border-2 border-[#f7941d] text-[#f7941d] hover:bg-[#f7941d] hover:text-white transition-colors text-sm font-semibold shadow-sm"
        >
          <FileUp size={16} /> Baixar exemplo de CSV
        </a>
        <button
          onClick={exportBackup}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#f7941d] to-[#ff7a00] text-white hover:opacity-90 transition-opacity text-sm font-semibold shadow-sm"
        >
          <Download size={16} /> Backup de todos os produtos (CSV)
        </button>
      </div>

      {/* Configuração do lembrete/backup automático */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 max-w-4xl shadow-sm">
        <h2 className="text-base font-bold text-[#111827] mb-1">Backup periódico</h2>
        <p className="text-sm text-[#6b7280] mb-4">
          {backupCfg.lastBackupAt
            ? `Último backup: ${new Date(backupCfg.lastBackupAt).toLocaleDateString('pt-BR')}.`
            : 'Nenhum backup registrado ainda.'}
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block mb-1 font-medium text-[#374151]">Período (dias)</span>
            <input
              type="number"
              min={1}
              value={backupCfg.intervalDays}
              onChange={e => setBackupCfg(backupService.saveSettings({ intervalDays: Number(e.target.value) || 15 }))}
              className="w-28 border border-gray-300 rounded p-2 bg-white text-[#111827]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-[#374151] pb-2">
            <input
              type="checkbox"
              checked={backupCfg.auto}
              onChange={e => setBackupCfg(backupService.saveSettings({ auto: e.target.checked }))}
              className="w-4 h-4 accent-[#f7941d]"
            />
            Baixar automaticamente quando vencer o período
          </label>
        </div>
        <p className="text-xs text-[#6b7280] mt-3">
          Com o automático desligado, o sistema apenas mostra um alerta no painel quando o período vencer (padrão: 15 dias).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {companies.map(brand => (
          <div key={brand} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#111827]">🏢 {brand}</h2>
            </div>
            <input
              ref={el => (fileRefs.current[brand] = el)}
              type="file"
              accept=".csv,.txt"
              className="block w-full text-sm border border-gray-300 rounded p-2 bg-white text-[#111827]"
            />
            <Button variant="cta" size="sm" onClick={() => handleUpload(brand)}>Processar CSV de {brand}</Button>
            {results[brand] && <p className="text-sm font-medium text-green-600">{results[brand]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== ACCESS REQUESTS ==================== */
function AccessRequestsTab({ addClient }: { addClient: ReturnType<typeof useStore>['addClient'] }) {
  const [requests, setRequests] = useState<AccessRequest[]>(() => accessRequestService.getAll());
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [approvalReq, setApprovalReq] = useState<AccessRequest | null>(null);
  const [approvalKind, setApprovalKind] = useState<'lead' | 'client'>('client');
  const [manualPwd, setManualPwd] = useState('');
  const [leadBrands, setLeadBrands] = useState<string[]>([]);

  const refresh = () => { void refreshTable.accessRequests().then(() => setRequests(accessRequestService.getAll())); };

  // Busca do banco ao abrir a aba e sempre que os dados administrativos ficam
  // prontos — sem isso, as solicitações feitas por visitantes (em outros
  // dispositivos) não apareciam até clicar manualmente em recarregar.
  useEffect(() => {
    refresh();
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'access_requests' || scope === 'all') setRequests(accessRequestService.getAll());
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const openApproval = (req: AccessRequest) => {
    setApprovalReq(req);
    setApprovalKind('client');
    setManualPwd('');
    setLeadBrands([]);
  };

  const toggleLeadBrand = (b: string) =>
    setLeadBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const confirmApproval = () => {
    if (!approvalReq) return;
    const pwd = manualPwd.trim();
    if (pwd.length < 4) { alert('Defina uma senha com ao menos 4 caracteres.'); return; }
    if (approvalKind === 'lead' && leadBrands.length === 0) {
      alert('Selecione ao menos uma empresa para liberar ao Lead.');
      return;
    }

    if (approvalKind === 'client') {
      // Se já existir um LEAD com o mesmo CNPJ, remove-o para que o login
      // resolva para o novo CLIENTE (senão o perfil antigo de lead "vencia" o
      // login e o acesso liberava apenas funções de lead).
      const existingLead = leadService.findByCnpj(approvalReq.cnpj);
      if (existingLead) { void leadService.remove(existingLead.id); }
      const newClientId = crypto.randomUUID();
      const newClient: Client = {
        id: newClientId, cnpj: approvalReq.cnpj, email: approvalReq.email, password: pwd,
        companyName: approvalReq.companyName, tradeName: approvalReq.companyName, address: '',
        whatsapp: approvalReq.whatsapp,
        classification: 'Standard', network: '', creditLimit: 10000, discountPct: 0,
        active: true, allowedBrands: [...leadBrands],
      };
      addClient(newClient);
      accessRequestService.update(approvalReq.id, { status: 'approved', approvedClientId: newClientId, generatedPassword: pwd });
    } else {
      // Lead
      leadService.add({
        cnpj: approvalReq.cnpj, email: approvalReq.email, password: pwd,
        companyName: approvalReq.companyName, contactName: approvalReq.contactName,
        whatsapp: approvalReq.whatsapp, allowedBrands: leadBrands,
      });
      accessRequestService.update(approvalReq.id, { status: 'approved', generatedPassword: pwd });
    }

    const approvedReq: AccessRequest = { ...approvalReq, status: 'approved', generatedPassword: pwd };
    refresh();
    setApprovalReq(null);
    sendWhatsApp(approvedReq);
  };

  const reject = (req: AccessRequest) => {
    if (!confirm('Recusar esta solicitação?')) return;
    accessRequestService.update(req.id, { status: 'rejected' });
    refresh();
  };

  const removeReq = async (req: AccessRequest) => {
    if (!confirm('Excluir esta solicitação permanentemente?')) return;
    const ok = await accessRequestService.remove(req.id);
    if (!ok) return;
    refresh();
  };

  const sendWhatsApp = (req: AccessRequest) => {
    const password = req.generatedPassword || '(senha não disponível)';
    const text = `Olá! Seu acesso à plataforma Moura Representações foi aprovado.\n\nLogin: ${req.cnpj}\nSenha: ${password}\n\nVocê já pode acessar e realizar seus pedidos e orçamentos.`;
    const phone = req.whatsapp.replace(/\D/g, '');
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[status]}`}>{labels[status]}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Solicitações de Acesso</h1>
        <div className="flex gap-2 items-center">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Recusadas</option>
            <option value="all">Todas</option>
          </select>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280] py-8 text-center bg-white border border-gray-200 rounded-lg">Nenhuma solicitação {filter === 'pending' ? 'pendente' : ''}.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 w-full sm:min-w-[260px]">
                  <div className="flex items-center gap-2 mb-2">
                    <strong className="text-[#111827]">{req.companyName}</strong>
                    {statusBadge(req.status)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#374151]">
                    <div><span className="text-[#6b7280]">CNPJ:</span><br/>{req.cnpj}</div>
                    <div><span className="text-[#6b7280]">Responsável:</span><br/>{req.contactName}</div>
                    <div><span className="text-[#6b7280]">WhatsApp:</span><br/>{req.whatsapp}</div>
                    <div><span className="text-[#6b7280]">E-mail:</span><br/>{req.email}</div>
                    <div className="col-span-2 md:col-span-4"><span className="text-[#6b7280]">Recebida em:</span> {new Date(req.createdAt).toLocaleString('pt-BR')}</div>
                    {req.status === 'approved' && req.generatedPassword && (
                      <div className="col-span-2 md:col-span-4 bg-green-50 border border-green-200 rounded p-2">
                        <span className="text-[#6b7280]">Senha definida:</span> <strong className="font-mono">{req.generatedPassword}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {req.status === 'pending' && (
                    <>
                      <Button variant="cta" size="sm" onClick={() => openApproval(req)}>✓ Aprovar</Button>
                      <Button variant="outline" size="sm" onClick={() => reject(req)} className="text-red-600 hover:text-red-700">✕ Recusar</Button>
                    </>
                  )}
                  {req.status === 'approved' && (
                    <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" onClick={() => sendWhatsApp(req)}>
                      <MessageCircle size={14} /> WhatsApp
                    </Button>
                  )}
                  <button onClick={() => removeReq(req)} className="text-[10px] text-[#6b7280] hover:text-red-500">Excluir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Aprovação */}
      {approvalReq && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setApprovalReq(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#111827] mb-1">Aprovar Solicitação</h3>
            <p className="text-xs text-[#6b7280] mb-4">{approvalReq.companyName} ({approvalReq.cnpj})</p>

            <label className="text-xs font-medium text-[#374151] block mb-2">Tipo de aprovação *</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setApprovalKind('lead')}
                className={`p-3 rounded border text-left transition-colors ${
                  approvalKind === 'lead'
                    ? 'border-[#f7941d] bg-orange-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="text-sm font-semibold text-[#111827] flex items-center gap-1.5">
                  <UserPlus size={14} /> Lead
                </div>
                <div className="text-[10px] text-[#6b7280] mt-1">Acesso ao sistema sem visualizar preços.</div>
              </button>
              <button
                type="button"
                onClick={() => setApprovalKind('client')}
                className={`p-3 rounded border text-left transition-colors ${
                  approvalKind === 'client'
                    ? 'border-[#f7941d] bg-orange-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="text-sm font-semibold text-[#111827] flex items-center gap-1.5">
                  <Users size={14} /> Cliente
                </div>
                <div className="text-[10px] text-[#6b7280] mt-1">Acesso completo com preços e pedidos.</div>
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-[#374151] block mb-2">
                {approvalKind === 'lead' ? 'Empresas que o Lead pode acessar *' : 'Empresas que o Cliente pode acessar'}
              </label>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const seen = new Set<string>();
                  const list = [...BRANDS.map(b => b.name), ...categoryService.getCompanies()].filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                  return list.map(name => {
                    const checked = leadBrands.includes(name);
                    return (
                      <label key={name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors ${checked ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-300 hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleLeadBrand(name)} className="hidden" />
                        {checked ? '✓' : '○'} {name}
                      </label>
                    );
                  });
                })()}
              </div>
              <p className="text-[10px] text-[#6b7280] mt-1">
                {approvalKind === 'lead' ? 'Marque ao menos uma empresa.' : 'Marque as empresas liberadas. Se não marcar nenhuma, o cliente terá acesso a todas.'}
              </p>
            </div>

            <label className="text-xs font-medium text-[#374151] block mb-1">Senha de acesso *</label>
            <input
              type="text"
              value={manualPwd}
              onChange={e => setManualPwd(e.target.value)}
              placeholder="Defina uma senha (mínimo 4 caracteres)"
              className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827] mb-1"
              autoFocus
            />
            <p className="text-[10px] text-[#6b7280] mb-4">Após aprovar, o WhatsApp será aberto para enviar login e senha ao solicitante.</p>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setApprovalReq(null)}>Cancelar</Button>
              <Button variant="cta" size="sm" onClick={confirmApproval}>
                <Check size={14} /> Aprovar e enviar WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== CATALOGS ==================== */
function CatalogsTab() {
  const [catalogs, setCatalogs] = useState<Catalog[]>(() => catalogService.getAllAdmin());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const empty = { title: '', brand: '', description: '', coverImage: '', pdfUrl: '', active: true, order: 0 };
  const [form, setForm] = useState<typeof empty>(empty);
  const coverRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setCatalogs(catalogService.getAllAdmin());
    void refreshTable.catalogs().then(() => setCatalogs(catalogService.getAllAdmin()));
  };

  const [uploading, setUploading] = useState<null | 'cover' | 'pdf'>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading('cover');
    try {
      const url = await uploadCatalogFile(file, 'cover');
      setForm(prev => ({ ...prev, coverImage: url }));
    } catch (err: any) {
      alert('Falha ao enviar a capa: ' + (err?.message || err));
    } finally {
      setUploading(null);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      const ok = confirm(`Este PDF tem ${(file.size / 1024 / 1024).toFixed(0)}MB. Enviar mesmo assim?`);
      if (!ok) return;
    }
    setUploading('pdf');
    try {
      const url = await uploadCatalogFile(file, 'pdf');
      setForm(prev => ({ ...prev, pdfUrl: url }));
    } catch (err: any) {
      alert('Falha ao enviar o PDF: ' + (err?.message || err));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.brand.trim()) { alert('Título e empresa são obrigatórios.'); return; }
    try {
      if (editId) {
        await catalogService.update(editId, form);
      } else {
        await catalogService.add({ ...form, order: catalogs.length + 1 });
      }
      setShowForm(false); setEditId(null); setForm(empty); refresh();
    } catch {
      alert('Erro ao salvar. O arquivo pode ser grande demais para o navegador.');
    }
  };

  const edit = (c: Catalog) => {
    setForm({ title: c.title, brand: c.brand, description: c.description || '', coverImage: c.coverImage, pdfUrl: c.pdfUrl, active: c.active, order: c.order });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Catálogos</h1>
        <Button variant="cta" size="sm" onClick={() => { setForm(empty); setEditId(null); setShowForm(true); }}>+ Novo Catálogo</Button>
      </div>
      <p className="text-sm text-[#6b7280] mb-4">Gerencie os catálogos exibidos no site público.</p>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-[#374151]">Título *</label><input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.title} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, title: value })); }} /></div>
            <div>
              <label className="text-xs font-medium text-[#374151]">Empresa *</label>
              <select className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.brand} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, brand: value })); }}>
                <option value="">Selecione...</option>
                {categoryService.getCompanies().map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex items-end"><label className="flex items-center gap-1 text-xs text-[#111827]"><input type="checkbox" checked={form.active} onChange={e => { const checked = e.target.checked; setForm(prev => ({ ...prev, active: checked })); }} /> Ativo</label></div>
            <div className="col-span-full"><label className="text-xs font-medium text-[#374151]">Descrição</label><input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]" value={form.description} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, description: value })); }} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#374151]">Imagem da Capa</label>
              <div className="flex gap-2 items-center mt-1">
                <button onClick={() => coverRef.current?.click()} disabled={uploading === 'cover'} className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 text-[#374151] disabled:opacity-50">{uploading === 'cover' ? 'Enviando...' : '📷 Upload'}</button>
                <input className="flex-1 p-2 border border-gray-300 rounded bg-white text-xs text-[#111827]" placeholder="ou cole URL" value={form.coverImage.startsWith('data:') ? '' : form.coverImage} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, coverImage: value })); }} />
              </div>
              <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              {form.coverImage && <img src={catalogCoverThumb(form.coverImage, 256)} alt="" loading="lazy" decoding="async" className="mt-2 w-32 h-40 object-cover rounded border border-gray-200" />}
            </div>
            <div>
              <label className="text-xs font-medium text-[#374151]">Arquivo PDF</label>
              <div className="flex gap-2 items-center mt-1">
                <button onClick={() => pdfRef.current?.click()} disabled={uploading === 'pdf'} className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 text-[#374151] disabled:opacity-50">{uploading === 'pdf' ? 'Enviando...' : '📄 Upload'}</button>
                <input className="flex-1 p-2 border border-gray-300 rounded bg-white text-xs text-[#111827]" placeholder="ou cole URL" value={form.pdfUrl.startsWith('data:') ? '' : form.pdfUrl} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, pdfUrl: value })); }} />
              </div>
              <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} className="hidden" />
              {form.pdfUrl && <p className="text-[10px] text-green-600 mt-1">✓ PDF carregado</p>}
            </div>
          </div>
          <div className="flex gap-2"><Button variant="cta" size="sm" onClick={save}>Salvar</Button><Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</Button></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalogs.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
              {c.coverImage ? <img src={catalogCoverThumb(c.coverImage, 400)} alt={c.title} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl text-[#6b7280]">📄</div>}
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-[#111827]">{c.title}</p>
              <p className="text-xs text-[#6b7280]">{c.brand}</p>
              <p className="text-[10px] text-[#6b7280] mt-1">{c.active ? '✅ Ativo' : '❌ Inativo'}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => edit(c)} className="text-xs text-[#f7941d] hover:underline">Editar</button>
                <button onClick={() => { catalogService.update(c.id, { active: !c.active }); refresh(); }} className="text-xs text-[#6b7280] hover:underline">{c.active ? 'Desativar' : 'Ativar'}</button>
                <button onClick={async () => { if (confirm('Excluir?')) { await catalogService.remove(c.id); refresh(); } }} className="text-xs text-[#ef4444] hover:underline">Excluir</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== LEADS ==================== */
function LeadsTabPlaceholder({ addClient, clients = [] }: { addClient?: ReturnType<typeof useStore>['addClient']; clients?: Client[] } = {}) {
  const [leads, setLeads] = useState<Lead[]>(() => leadService.getAll());
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = { cnpj: '', email: '', password: '', companyName: '', contactName: '', whatsapp: '', allowedBrands: [] as string[] };
  const [form, setForm] = useState(empty);
  const [resetLead, setResetLead] = useState<Lead | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const refresh = () => { void refreshTable.leads().then(() => setLeads(leadService.getAll())); };

  // Recarrega do banco ao abrir a aba e quando os dados admin ficam prontos —
  // antes os leads "sumiam" ao atualizar a tela até clicar em recarregar.
  useEffect(() => {
    refresh();
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'leads' || scope === 'all') setLeads(leadService.getAll());
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = leads.filter(l => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const cleanQ = q.replace(/\D/g, '');
    return l.companyName.toLowerCase().includes(q) ||
      (l.contactName || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (cleanQ.length > 0 && l.cnpj.replace(/\D/g, '').includes(cleanQ));
  });

  const sendWhatsApp = (lead: Lead) => {
    const text = `Olá! Seu acesso à plataforma Moura Representações foi aprovado.\n\nLogin: ${lead.cnpj}\nSenha: ${lead.password}\n\nVocê já pode acessar e realizar seus pedidos e orçamentos.`;
    const phone = lead.whatsapp.replace(/\D/g, '');
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const toggleBrand = (b: string) => setForm(prev => ({ ...prev, allowedBrands: prev.allowedBrands.includes(b) ? prev.allowedBrands.filter(x => x !== b) : [...prev.allowedBrands, b] }));

  const startEdit = (l: Lead) => {
    setEditingId(l.id);
    setForm({
      cnpj: l.cnpj, email: l.email || '', password: l.password,
      companyName: l.companyName, contactName: l.contactName || '',
      whatsapp: l.whatsapp, allowedBrands: [...(l.allowedBrands || [])],
    });
    setShowForm(true);
  };

  // Detecta CNPJ digitado que já pertence a um CLIENTE (espelho do aviso
  // que existe na aba Clientes para CNPJ já cadastrado como lead).
  const clientMatch = useMemo(() => {
    if (editingId) return null;
    const c = (form.cnpj || '').replace(/\D/g, '');
    if (c.length < 14) return null;
    return clients.find(cl => (cl.cnpj || '').replace(/\D/g, '') === c) || null;
  }, [form.cnpj, editingId, clients]);

  const saveLead = () => {
    if (clientMatch) {
      alert(`Este CNPJ já está cadastrado como CLIENTE (${clientMatch.companyName}). Edite o cadastro na aba Clientes.`);
      return;
    }
    if (!form.cnpj.trim() || !form.companyName.trim() || !form.whatsapp.trim() || (!editingId && !form.password.trim())) {
      alert(editingId ? 'Preencha CNPJ, Empresa e WhatsApp.' : 'Preencha CNPJ, Empresa, WhatsApp e Senha.'); return;
    }
    if (form.allowedBrands.length === 0) {
      alert('Selecione ao menos uma empresa para o Lead.'); return;
    }
    if (editingId) {
      const patch: Partial<typeof form> = { ...form };
      if (!form.password.trim()) delete patch.password;
      leadService.update(editingId, patch);
    } else {
      leadService.add({ ...form });
    }
    setShowForm(false); setEditingId(null); setForm(empty); refresh();
  };

  const confirmReset = () => {
    if (!resetLead || !newPwd.trim()) return;
    leadService.update(resetLead.id, { password: newPwd.trim() });
    setResetLead(null); setNewPwd(''); refresh();
  };

  // Converte o lead diretamente em cliente, reaproveitando os dados cadastrados.
  const convertLead = (l: Lead) => {
    if (!addClient) { alert('Conversão indisponível nesta tela.'); return; }
    if (!confirm(`Converter o lead "${l.companyName}" em cliente? Ele passará a ver preços e fazer pedidos.`)) return;
    // Reaproveita o MESMO id do lead: o perfil no banco é atualizado no lugar
    // (role vira 'client'), evitando violar o índice único de CNPJ.
    addClient({
      id: l.id,
      cnpj: l.cnpj,
      email: l.email || '',
      password: l.password,
      companyName: l.companyName,
      tradeName: l.contactName || l.companyName,
      address: '',
      whatsapp: l.whatsapp,
      classification: 'Standard',
      network: '',
      creditLimit: 10000,
      discountPct: 0,
      brandDiscounts: {},
      active: true,
      allowedBrands: [...(l.allowedBrands || [])],
    });
    leadService.removeLocal(l.id);
    refresh();
    alert(`Lead "${l.companyName}" convertido em cliente com sucesso.`);
  };



  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#111827]">Leads</h1>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou CNPJ..."
              className="text-sm border border-gray-300 rounded p-1.5 pl-7 bg-white text-[#111827] w-56" />
          </div>
          <Button variant="cta" size="sm" onClick={() => { setEditingId(null); setForm(empty); setShowForm(true); }}>+ Novo Lead</Button>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>
      <p className="text-sm text-[#6b7280] mb-4">Leads acessam a plataforma sem visualizar preços. Convertam em cliente para liberação completa.</p>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-semibold text-[#111827]">{editingId ? 'Editar Lead' : 'Cadastrar novo Lead'}</h3>
          {clientMatch && (
            <div className="flex items-start justify-between gap-3 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs text-[#374151]">
                <strong className="text-amber-800">Este CNPJ já está cadastrado como CLIENTE.</strong>
                <div className="mt-0.5">{clientMatch.companyName} — {clientMatch.tradeName || 'sem responsável'} · {clientMatch.whatsapp || clientMatch.email}</div>
                <div className="mt-0.5">Não é possível cadastrá-lo como lead. Edite o cadastro na aba Clientes.</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              { k: 'cnpj' as const, l: 'CNPJ *' },
              { k: 'companyName' as const, l: 'Empresa *' },
              { k: 'contactName' as const, l: 'Responsável' },
              { k: 'whatsapp' as const, l: 'WhatsApp *' },
              { k: 'email' as const, l: 'E-mail' },
              { k: 'password' as const, l: 'Senha *' },
            ]).map(f => (
              <div key={f.k}>
                <label className="text-xs font-medium text-[#374151]">{f.l}</label>
                <input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]"
                  value={form[f.k]} onChange={e => { const value = e.target.value; setForm(prev => ({ ...prev, [f.k]: value })); }} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-[#374151] block mb-2">Empresas que o Lead pode acessar *</label>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const seen = new Set<string>();
                const list = [...BRANDS.map(b => b.name), ...categoryService.getCompanies()].filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                return list.map(name => {
                  const checked = form.allowedBrands.includes(name);
                  return (
                    <label key={name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors ${checked ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-300 hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleBrand(name)} className="hidden" />
                      {checked ? '✓' : '○'} {name}
                    </label>
                  );
                });
              })()}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="cta" size="sm" onClick={saveLead}>{editingId ? 'Salvar Alterações' : 'Salvar Lead'}</Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setForm(empty); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {resetLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResetLead(null)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[#111827]">Resetar senha — {resetLead.companyName}</h3>
            <input className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827]"
              placeholder="Nova senha" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setResetLead(null); setNewPwd(''); }}>Cancelar</Button>
              <Button variant="cta" size="sm" onClick={confirmReset}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280] py-8 text-center bg-white border border-gray-200 rounded-lg">{leads.length === 0 ? 'Nenhum lead cadastrado.' : 'Nenhum lead encontrado.'}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => (
            <div key={l.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 w-full sm:min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-[#111827]">{l.companyName}</strong>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">LEAD</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#374151] mt-2">
                    <div><span className="text-[#6b7280]">CNPJ:</span><br/>{l.cnpj}</div>
                    <div><span className="text-[#6b7280]">Responsável:</span><br/>{l.contactName}</div>
                    <div><span className="text-[#6b7280]">WhatsApp:</span><br/>{l.whatsapp}</div>
                    <div><span className="text-[#6b7280]">Senha:</span><br/><strong className="font-mono">{l.password}</strong></div>
                  </div>
                  {l.allowedBrands && l.allowedBrands.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {l.allowedBrands.map(b => (
                        <span key={b} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-[#374151] border border-gray-200">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => startEdit(l)}><Pencil size={14} /> Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => { setResetLead(l); setNewPwd(''); }}><KeyRound size={14} /> Resetar Senha</Button>
                  <Button size="sm" variant="cta" onClick={() => convertLead(l)}><Check size={14} /> Converter em Cliente</Button>
                  <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" onClick={() => sendWhatsApp(l)}><MessageCircle size={14} /> WhatsApp</Button>
                  <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => { if (confirm('Excluir este lead?')) { void leadService.remove(l.id).then(refresh); } }}><Trash2 size={14} /> Excluir</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== RECUPERAÇÕES DE SENHA ==================== */
function RecoveryTab({ clients, updateClient }: { clients: Client[]; updateClient: (id: string, data: Partial<Client>) => void }) {
  const [items, setItems] = useState<PasswordRecovery[]>(() => passwordRecoveryService.getAll());
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [resetItem, setResetItem] = useState<PasswordRecovery | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const refresh = () => { void refreshTable.pwRecoveries().then(() => setItems(passwordRecoveryService.getAll())); };
  // Busca do banco ao abrir a aba e escuta a hidratação — evita que as
  // recuperações "sumam" ao atualizar a tela até clicar em recarregar.
  useEffect(() => {
    refresh();
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'password_recoveries' || scope === 'all') setItems(passwordRecoveryService.getAll());
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const findClient = (cnpj: string) => {
    const c = cnpj.replace(/\D/g, '');
    return clients.find(cl => cl.cnpj.replace(/\D/g, '') === c);
  };

  const openReset = (item: PasswordRecovery) => { setResetItem(item); setNewPwd(''); };

  const confirmReset = () => {
    if (!resetItem) return;
    const client = findClient(resetItem.cnpj);
    if (!client) { alert('Cliente não encontrado para este CNPJ.'); return; }
    if (newPwd.trim().length < 4) { alert('Senha mínima 4 caracteres.'); return; }
    updateClient(client.id, { password: newPwd.trim() });
    passwordRecoveryService.update(resetItem.id, { status: 'resolved' });
    const text = `Olá! Sua nova senha de acesso à plataforma Moura Representações foi definida.\n\nLogin: ${client.cnpj}\nSenha: ${newPwd.trim()}`;
    const phone = (resetItem.whatsapp || client.whatsapp || '').replace(/\D/g, '');
    if (phone) {
      const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
      window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`, '_blank');
    }
    setResetItem(null);
    setItems(passwordRecoveryService.getAll());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Recuperações de Senha</h1>
        <div className="flex gap-2 items-center">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidas</option>
            <option value="all">Todas</option>
          </select>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280] py-8 text-center bg-white border border-gray-200 rounded-lg">Nenhuma solicitação.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const client = findClient(r.cnpj);
            return (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm text-[#111827]">
                  <strong>{client?.companyName || 'Cliente não cadastrado'}</strong>
                  <div className="text-xs text-[#6b7280] mt-1">CNPJ: <span className="font-mono">{r.cnpj}</span></div>
                  <div className="text-xs text-[#6b7280]">Recebida em: {new Date(r.createdAt).toLocaleString('pt-BR')}</div>
                  <div className="mt-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                      {r.status === 'pending' ? 'Pendente' : 'Resolvida'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.status === 'pending' && client && (
                    <Button variant="cta" size="sm" onClick={() => openReset(r)}><KeyRound size={14} /> Definir nova senha</Button>
                  )}
                  <button onClick={async () => { if (confirm('Excluir?') && await passwordRecoveryService.remove(r.id)) refresh(); }} className="text-[10px] text-[#6b7280] hover:text-red-500">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resetItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setResetItem(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#111827] mb-3 flex items-center gap-2"><KeyRound size={18} className="text-[#f7941d]" /> Nova senha</h3>
            <input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Digite a nova senha"
              className="w-full p-2 border border-gray-300 rounded bg-white text-sm text-[#111827] mb-3" autoFocus />
            <p className="text-[10px] text-[#6b7280] mb-3">Após salvar, o WhatsApp será aberto com login e senha.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setResetItem(null)}>Cancelar</Button>
              <Button variant="cta" size="sm" onClick={confirmReset}>Salvar e enviar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== CONTATOS ==================== */
function ContactsTab() {
  const [items, setItems] = useState<ContactRequest[]>(() => contactService.getAll());
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const refresh = () => { void refreshTable.contacts().then(() => setItems(contactService.getAll())); };
  // Ao abrir a aba, busca do banco e escuta a hidratação dos dados administrativos —
  // sem isto os contatos "sumiam" ao atualizar a tela até clicar em recarregar.
  useEffect(() => {
    refresh();
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'contacts' || scope === 'all') setItems(contactService.getAll());
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const sendWhatsApp = (c: ContactRequest) => {
    const text = `Olá ${c.nome}! Recebemos seu contato sobre: "${c.mensagem.slice(0, 80)}..."`;
    const phone = c.whatsapp.replace(/\D/g, '');
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#111827]">Contatos Recebidos</h1>
        <div className="flex gap-2 items-center">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="text-sm border border-gray-300 rounded p-1.5 bg-white text-[#111827]">
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidos</option>
            <option value="all">Todos</option>
          </select>
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280] py-8 text-center bg-white border border-gray-200 rounded-lg">Nenhum contato.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0 w-full sm:min-w-[260px]">
                  <div className="flex items-center gap-2 mb-2">
                    <strong className="text-[#111827]">{c.empresa || c.nome}</strong>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                      {c.status === 'pending' ? 'Pendente' : 'Resolvido'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#374151]">
                    <div><span className="text-[#6b7280]">CNPJ:</span><br/>{c.cnpj || '-'}</div>
                    <div><span className="text-[#6b7280]">Nome:</span><br/>{c.nome}</div>
                    <div><span className="text-[#6b7280]">WhatsApp:</span><br/>{c.whatsapp}</div>
                    <div><span className="text-[#6b7280]">E-mail:</span><br/>{c.email}</div>
                  </div>
                  {c.mensagem && (
                    <div className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2 text-[#374151]">
                      <span className="text-[#6b7280]">Mensagem:</span> {c.mensagem}
                    </div>
                  )}
                  <div className="text-[10px] text-[#6b7280] mt-2">{new Date(c.createdAt).toLocaleString('pt-BR')}</div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" onClick={() => sendWhatsApp(c)}><MessageCircle size={14} /> WhatsApp</Button>
                  {c.status === 'pending' ? (
                    <Button variant="outline" size="sm" onClick={() => { contactService.update(c.id, { status: 'resolved' }); setItems(contactService.getAll()); }}><Check size={14} /> Marcar resolvido</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => { contactService.update(c.id, { status: 'pending' }); setItems(contactService.getAll()); }}>Reabrir</Button>
                  )}
                  <button onClick={async () => { if (confirm('Excluir?') && await contactService.remove(c.id)) refresh(); }} className="text-[10px] text-[#6b7280] hover:text-red-500">Excluir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== BOTÃO DO PÂNICO ==================== */
function PanicTab() {
  const [blocked, setBlocked] = useState<string[]>(() => panicService.getAll());
  const toggle = (brand: string) => { panicService.toggle(brand); setBlocked(panicService.getAll()); };
  // Sincroniza a exibição com o estado real (Supabase) — sem isto os botões
  // apareciam sempre como "desbloqueado" no carregamento e pareciam não funcionar.
  useEffect(() => {
    setBlocked(panicService.getAll());
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'panic_brands' || scope === 'all') setBlocked(panicService.getAll());
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);


  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={22} className="text-[#f7941d]" />
        <h1 className="text-2xl font-bold text-[#111827]">Botão do Pânico</h1>
      </div>
      <p className="text-sm text-[#6b7280] mb-6 max-w-2xl">
        Quando ativado para uma empresa, <strong>nenhum cliente verá os preços</strong> dos produtos dessa marca.
        Use em casos de instabilidade de preço ou ajustes de tabela. Os pedidos seguem disponíveis sem exibição de valor.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        {categoryService.getCompanies().map(name => {
          const b = { name };
          const isBlocked = blocked.some(x => x.toLowerCase() === b.name.toLowerCase());
          return (
            <div key={b.name} className={`border-2 rounded-lg p-5 transition-colors ${isBlocked ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between mb-3">
                <strong className="text-[#111827] text-lg">{b.name}</strong>
                {isBlocked && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">PREÇOS BLOQUEADOS</span>}
              </div>
              <Button
                size="sm"
                onClick={() => toggle(b.name)}
                className={isBlocked
                  ? 'w-full bg-[#374151] hover:bg-[#1f2937] text-white'
                  : 'w-full bg-red-500 hover:bg-red-600 text-white'}
              >
                {isBlocked ? 'Reativar exibição de preços' : 'Bloquear preços agora'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromotionsTab({ products }: { products: Product[] }) {
  type TierDraft = { minQty: string; discountType: 'percent' | 'fixed'; discountValue: string };
  type StatusFilter = 'todas' | 'ativas' | 'inativas' | 'programadas' | 'expiradas';
  const [tick, setTick] = useState(0);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedComboId, setSelectedComboId] = useState<string>('');
  const [ruleType, setRuleType] = useState<'simple' | 'tiered'>('simple');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [tiers, setTiers] = useState<TierDraft[]>([{ minQty: '1', discountType: 'percent', discountValue: '' }]);
  const [startsAt, setStartsAt] = useState<string>('');
  const [endsAt, setEndsAt] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const companies = useMemo(() => categoryService.getCompanies(), []);
  const allCategories = useMemo(() => categoryService.getAll(), []);

  useEffect(() => {
    const onReady = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'promotions' || scope === 'all') setTick(v => v + 1);
    };
    window.addEventListener(DATA_READY_EVENT, onReady);
    promotionService.hydrate();
    return () => window.removeEventListener(DATA_READY_EVENT, onReady);
  }, []);

  // Debounce da busca (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const svc = promotionService;
  const allPromotions = svc.getAll();

  const resetForm = () => {
    setSelectedProductId('');
    setSelectedComboId('');
    setRuleType('simple');
    setDiscountType('percent');
    setDiscountValue('');
    setTiers([{ minQty: '1', discountType: 'percent', discountValue: '' }]);
    setStartsAt('');
    setEndsAt('');
    setEditingId(null);
  };

  // Ao trocar de empresa: limpa apenas o filtro da lista de promoções ativas
  const handleChangeBrand = (b: string) => {
    setSelectedBrand(b);
    setStatusFilter('todas');
  };

  // Produtos da empresa selecionada — lê sempre a versão mais recente do serviço
  // (o prop `products` pode estar defasado após alterar a marcação de promoção).
  const freshProducts = useMemo(() => {
    const latest = productService.getProducts();
    return latest.length ? latest : products;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, tick]);
  const brandProducts = useMemo(
    () => (selectedBrand ? freshProducts.filter(p => p.brand === selectedBrand) : []),
    [freshProducts, selectedBrand],
  );

  // Busca só dispara com >= 2 chars (sem filtro de empresa no cadastro)
  const searchActive = debouncedSearch.length >= 2;
  const filteredProducts = useMemo(() => {
    if (!searchActive) return [];
    const q = debouncedSearch.toLowerCase();
    // categorias/subcategorias que contêm o termo
    const matchCatNames = new Set<string>();
    const matchSubNames = new Set<string>();
    for (const c of allCategories) {
      const catHit = (c.name || '').toLowerCase().includes(q);
      if (catHit) matchCatNames.add(c.name);
      for (const s of (c.subcategories || [])) {
        if ((s || '').toLowerCase().includes(q)) matchSubNames.add(s);
      }
    }
    const list = products.filter(p => {
      const inCode = (p.code || '').toLowerCase().includes(q);
      const inName = (p.name || '').toLowerCase().includes(q);
      const inDesc = (p.description || '').toLowerCase().includes(q);
      const inCombo = (p.combinations || []).some(c => (c.sku || '').toLowerCase().includes(q))
        || (p.variationGroups || []).some((g: any) => (g.options || []).some((o: any) => (o.sku || '').toLowerCase().includes(q)))
        || ((p as any).variations || []).some((v: any) => (v.sku || '').toLowerCase().includes(q));
      const cat = typeof p.category === 'string' ? p.category : (p.category as any)?.name || '';
      const inCat = !!cat && (cat.toLowerCase().includes(q) || matchCatNames.has(cat));
      const sub = p.subcategory || '';
      const inSub = !!sub && (sub.toLowerCase().includes(q) || matchSubNames.has(sub));
      return inCode || inName || inDesc || inCombo || inCat || inSub;
    });
    // Prioriza correspondência exata de código
    list.sort((a, b) => {
      const ax = (a.code || '').toLowerCase() === q ? 0 : 1;
      const bx = (b.code || '').toLowerCase() === q ? 0 : 1;
      return ax - bx;
    });
    return list.slice(0, 50);
  }, [searchActive, debouncedSearch, products, allCategories]);

  const selectedProduct = products.find(p => p.id === selectedProductId) || null;
  const combos = selectedProduct?.combinations || [];

  const addTier = () => setTiers(prev => [...prev, { minQty: '', discountType: 'percent', discountValue: '' }]);
  const removeTier = (idx: number) => setTiers(prev => prev.filter((_, i) => i !== idx));
  const patchTier = (idx: number, patch: Partial<TierDraft>) =>
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));

  const handleSave = async () => {
    if (!selectedProduct) { toast.error('Selecione um produto.'); return; }
    let payload: Parameters<typeof svc.create>[0];
    if (ruleType === 'tiered') {
      const parsed: any[] = [];
      for (const t of tiers) {
        const min = parseInt(t.minQty, 10);
        const val = parseMoneyInput(t.discountValue);
        if (!Number.isFinite(min) || min < 1) { toast.error('Informe a quantidade mínima de cada faixa (≥ 1).'); return; }
        if (val == null || val <= 0) { toast.error('Informe um desconto maior que zero em cada faixa.'); return; }
        parsed.push({ minQty: min, discountType: t.discountType, discountValue: val });
      }
      payload = {
        productId: selectedProduct.id,
        combinationId: selectedComboId || null,
        ruleType: 'tiered',
        discountType: 'percent',
        discountValue: 0.01,
        tiers: parsed,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        active: true,
      };
    } else {
      const v = parseMoneyInput(discountValue);
      if (v == null || v <= 0) { toast.error('Informe um desconto maior que zero.'); return; }
      payload = {
        productId: selectedProduct.id,
        combinationId: selectedComboId || null,
        ruleType: 'simple',
        discountType,
        discountValue: v,
        tiers: undefined,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        active: true,
      };
    }
    setSaving(true);
    const res = editingId
      ? await svc.update(editingId, payload, selectedProduct)
      : await svc.create(payload, selectedProduct);
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    // Mantém o check "Promoção" do cadastro do produto sincronizado com a campanha.
    if (!selectedProduct.isPromo) productService.updateProduct(selectedProduct.id, { isPromo: true });
    toast.success(editingId ? 'Promoção atualizada.' : 'Promoção criada.');
    resetForm();
    setTick(v => v + 1);
  };

  const handleEdit = (p: Promotion) => {
    const prod = products.find(x => x.id === p.productId);
    if (prod && prod.brand && prod.brand !== selectedBrand) setSelectedBrand(prod.brand);
    setEditingId(p.id);
    setSelectedProductId(p.productId);
    setSelectedComboId(p.combinationId || '');
    setRuleType(p.ruleType === 'tiered' ? 'tiered' : 'simple');
    setDiscountType(p.discountType);
    setDiscountValue(String(p.discountValue).replace('.', ','));
    setTiers(p.ruleType === 'tiered' && p.tiers?.length
      ? p.tiers.map(t => ({ minQty: String(t.minQty), discountType: t.discountType, discountValue: String(t.discountValue).replace('.', ',') }))
      : [{ minQty: '1', discountType: 'percent', discountValue: '' }]);
    setStartsAt(p.startsAt ? p.startsAt.slice(0, 16) : '');
    setEndsAt(p.endsAt ? p.endsAt.slice(0, 16) : '');
  };

  /** Move a promoção para cima/baixo na ordem de apresentação do cliente. */
  const handleMove = async (p: Promotion, dir: -1 | 1) => {
    const ordered = svc.getAll();
    const visible = ordered.filter(x => brandProductIds.has(x.productId));
    const i = visible.findIndex(x => x.id === p.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const ids = ordered.map(x => x.id);
    const a = ids.indexOf(visible[i].id);
    const b = ids.indexOf(visible[j].id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    const res = await svc.reorder(ids);
    if (res.error) toast.error(res.error); else setTick(v => v + 1);
  };

  const handleToggle = async (p: Promotion) => {
    const res = await svc.setActive(p.id, !p.active);
    if (res.error) toast.error(res.error); else { toast.success('Status atualizado.'); setTick(v => v + 1); }
  };

  const handleDelete = async (p: Promotion) => {
    if (!window.confirm('Excluir esta promoção?')) return;
    const res = await svc.remove(p.id);
    if (res.error) { toast.error(res.error); return; }
    // Se o produto não tem mais nenhuma campanha, remove também a marcação "Promoção"
    // do cadastro para que ele não continue listado em Promoções ativas.
    const remaining = svc.getByProduct(p.productId);
    if (remaining.length === 0) {
      const prod = products.find(x => x.id === p.productId);
      if (prod?.isPromo) await productService.updateProduct(prod.id, { isPromo: false });
    }
    toast.success('Promoção excluída.');
    setTick(v => v + 1);
  };


  /** Remove a marcação "Promoção" feita no cadastro do produto. */
  const handleRemoveFlag = async (prod: Product) => {
    if (!window.confirm(`Remover a marcação de promoção de "${prod.name}"?`)) return;
    await productService.updateProduct(prod.id, { isPromo: false });
    toast.success('Marcação de promoção removida.');
    setTick(v => v + 1);
  };


  const describePromo = (p: Promotion) => {
    if (p.ruleType === 'tiered' && p.tiers?.length) {
      return [...p.tiers].sort((a, b) => a.minQty - b.minQty)
        .map(t => `≥${t.minQty} un: ${t.discountType === 'percent' ? `${t.discountValue}%` : formatBRL(t.discountValue)}`)
        .join(' · ');
    }
    return p.discountType === 'percent' ? `${p.discountValue}%` : formatBRL(p.discountValue);
  };

  // Promoções filtradas por empresa (via produto) + status
  const brandProductIds = useMemo(() => new Set(brandProducts.map(p => p.id)), [brandProducts]);
  const promotionsForBrand = useMemo(
    () => (selectedBrand ? allPromotions.filter(p => brandProductIds.has(p.productId)) : []),
    [allPromotions, brandProductIds, selectedBrand],
  );
  const filteredPromotions = useMemo(() => {
    const now = Date.now();
    return promotionsForBrand.filter(p => {
      const starts = p.startsAt ? Date.parse(p.startsAt) : null;
      const ends = p.endsAt ? Date.parse(p.endsAt) : null;
      const scheduled = !!(starts && now < starts);
      const expired = !!(ends && now > ends);
      switch (statusFilter) {
        case 'ativas': return p.active && !scheduled && !expired;
        case 'inativas': return !p.active;
        case 'programadas': return p.active && scheduled;
        case 'expiradas': return expired;
        default: return true;
      }
    });
  }, [promotionsForBrand, statusFilter]);

  /** Produtos marcados como "Promoção" no cadastro que ainda não têm campanha configurada. */
  const flaggedWithoutPromo = useMemo(() => {
    if (!selectedBrand) return [];
    const withPromo = new Set(allPromotions.map(p => p.productId));
    return brandProducts.filter(p => p.isPromo && !withPromo.has(p.id));
  }, [brandProducts, allPromotions, selectedBrand]);

  const showFlagged = flaggedWithoutPromo.length > 0 && (statusFilter === 'todas' || statusFilter === 'ativas');

  const statusBadge = (p: Promotion) => {
    const now = Date.now();
    const starts = p.startsAt ? Date.parse(p.startsAt) : null;
    const ends = p.endsAt ? Date.parse(p.endsAt) : null;
    if (!p.active) return { label: 'Inativa', cls: 'bg-gray-200 text-gray-600' };
    if (starts && now < starts) return { label: 'Programada', cls: 'bg-blue-100 text-blue-700' };
    if (ends && now > ends) return { label: 'Expirada', cls: 'bg-red-100 text-red-700' };
    return { label: 'Ativa', cls: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#111827] flex items-center gap-2"><Tag size={22} className="text-[#f7941d]" /> Promoções</h2>
        <p className="text-sm text-[#6b7280] mt-1">Cadastre promoções no formulário abaixo. Use o filtro de empresa na seção de promoções ativas para visualizar as campanhas em vigor.</p>
      </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#111827] mb-3">{editingId ? 'Editar promoção' : 'Nova promoção'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">Buscar produto (código, nome, grupo, categoria)</label>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Digite ao menos 2 caracteres"
                  className="w-full p-2 border border-gray-200 rounded-md text-sm" />
                <div className="mt-2 max-h-52 overflow-y-auto border border-gray-100 rounded-md">
                  {!searchActive && (
                    <div className="p-2 text-xs text-[#9ca3af]">Digite ao menos 2 caracteres para pesquisar.</div>
                  )}
                  {searchActive && filteredProducts.length === 0 && (
                    <div className="p-2 text-xs text-[#9ca3af]">Nenhum resultado encontrado.</div>
                  )}
                  {searchActive && filteredProducts.map(p => {
                    const cat = typeof p.category === 'string' ? p.category : (p.category as any)?.name || '';
                    return (
                      <button key={p.id} type="button" onClick={() => { setSelectedProductId(p.id); setSelectedComboId(''); }}
                        className={`w-full text-left px-2 py-1.5 text-xs hover:bg-orange-50 border-b border-gray-50 ${selectedProductId === p.id ? 'bg-orange-100 font-semibold' : ''}`}>
                        <div><span className="font-mono text-[#6b7280]">{p.code}</span> — {p.name}</div>
                        {(cat || p.subcategory) && (
                          <div className="text-[10px] text-[#9ca3af]">{[cat, p.subcategory].filter(Boolean).join(' · ')}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {selectedProduct && (
                  <div className="text-xs text-[#374151] bg-orange-50 border border-orange-100 rounded p-2">
                    <div className="font-semibold">Selecionado:</div>
                    <div>{selectedProduct.name} <span className="text-[#6b7280]">({selectedProduct.code})</span></div>
                    <div>Preço base: <span className="font-semibold">{formatBRL(selectedProduct.price || 0)}</span></div>
                  </div>
                )}
                {combos.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">Combinação (opcional — vazio = todo o produto)</label>
                    <select value={selectedComboId} onChange={e => setSelectedComboId(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-md text-sm">
                      <option value="">— Produto inteiro —</option>
                      {combos.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.sku || c.id.slice(0, 8)} · {formatBRL(c.price || 0)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1">Tipo de regra</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRuleType('simple')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs border ${ruleType === 'simple' ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-200'}`}>
                      Desconto simples
                    </button>
                    <button type="button" onClick={() => setRuleType('tiered')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs border ${ruleType === 'tiered' ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-200'}`}>
                      Progressiva por quantidade
                    </button>
                  </div>
                </div>

                {ruleType === 'simple' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">Tipo</label>
                      <select value={discountType} onChange={e => setDiscountType(e.target.value as any)}
                        className="w-full p-2 border border-gray-200 rounded-md text-sm">
                        <option value="percent">% Percentual</option>
                        <option value="fixed">R$ Valor fixo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">{discountType === 'fixed' ? 'Valor promocional (R$)' : 'Desconto (%)'}</label>
                      <input type="text" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                        placeholder={discountType === 'percent' ? 'Ex: 20' : 'Ex: 1.476,47'}
                        className="w-full p-2 border border-gray-200 rounded-md text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 border border-orange-100 bg-orange-50/40 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#374151]">Faixas por quantidade</label>
                      <button type="button" onClick={addTier} className="text-[11px] text-[#f7941d] hover:underline font-semibold">+ Adicionar faixa</button>
                    </div>
                    {tiers.map((t, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1 items-end">
                        <div className="col-span-3">
                          <label className="block text-[10px] text-[#6b7280] mb-0.5">A partir de (un.)</label>
                          <input type="number" min={1} value={t.minQty} onChange={e => patchTier(i, { minQty: e.target.value })}
                            className="w-full p-1.5 border border-gray-200 rounded text-xs" />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[10px] text-[#6b7280] mb-0.5">Tipo</label>
                          <select value={t.discountType} onChange={e => patchTier(i, { discountType: e.target.value as any })}
                            className="w-full p-1.5 border border-gray-200 rounded text-xs">
                            <option value="percent">% Percentual</option>
                            <option value="fixed">R$ Valor fixo</option>
                          </select>
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[10px] text-[#6b7280] mb-0.5">{t.discountType === 'fixed' ? 'Valor promocional (R$)' : 'Desconto (%)'}</label>
                          <input type="text" value={t.discountValue} onChange={e => patchTier(i, { discountValue: e.target.value })}
                            placeholder={t.discountType === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
                            className="w-full p-1.5 border border-gray-200 rounded text-xs" />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button type="button" onClick={() => removeTier(i)} disabled={tiers.length <= 1}
                            className="text-red-500 disabled:text-gray-300 text-xs px-1">✕</button>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-[#6b7280]">Ex.: 1 un = 5%, 10 un = 10%. A maior faixa aplicável à quantidade é usada.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">Início (opcional)</label>
                    <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">Fim (opcional)</label>
                    <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-md text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving || !selectedProduct}
                    className="bg-[#f7941d] hover:bg-[#e58414] text-white">
                    {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar promoção'}
                  </Button>
                  {editingId && <Button variant="outline" onClick={resetForm}>Cancelar</Button>}
                </div>
              </div>
            </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[#111827]">Promoções ativas</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#6b7280]">Empresa:</label>
            <select value={selectedBrand} onChange={e => handleChangeBrand(e.target.value)}
              className="p-2 border border-gray-200 rounded-md text-sm">
              <option value="">— Selecione uma empresa —</option>
              {companies.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {!selectedBrand && (
          <p className="text-xs text-[#9ca3af]">Selecione uma empresa para visualizar as promoções ativas.</p>
        )}

        {selectedBrand && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-xs font-semibold text-[#6b7280]">Promoções de {selectedBrand} ({filteredPromotions.length + (showFlagged ? flaggedWithoutPromo.length : 0)})</h4>
              <div className="flex flex-wrap gap-1">
                {(['todas','ativas','inativas','programadas','expiradas'] as StatusFilter[]).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 text-[11px] rounded-md border capitalize ${statusFilter === s ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {filteredPromotions.length === 0 && !showFlagged ? (
              <p className="text-sm text-[#9ca3af]">Nenhuma promoção para os filtros atuais.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[#6b7280]">
                    <tr>
                      <th className="text-left p-2">Ordem</th>
                      <th className="text-left p-2">Código</th>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-left p-2">Grupo / Categoria</th>
                      <th className="text-left p-2">Combinação</th>
                      <th className="text-left p-2">Tipo</th>
                      <th className="text-left p-2">Desconto</th>
                      <th className="text-left p-2">Vigência</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showFlagged && flaggedWithoutPromo.map(prod => {
                      const cat = typeof prod.category === 'string' ? prod.category : (prod.category as any)?.name || '';
                      return (
                        <tr key={`flag-${prod.id}`} className="border-t border-gray-100 bg-[#fff8ef]">
                          <td className="p-2 text-[#9ca3af]">—</td>
                          <td className="p-2 font-mono">{prod.code || '—'}</td>
                          <td className="p-2">{prod.name}</td>
                          <td className="p-2 text-[#6b7280]">{[cat, prod.subcategory].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="p-2">— produto inteiro —</td>
                          <td className="p-2">Marcado no cadastro</td>
                          <td className="p-2 text-[#6b7280]">Sem desconto configurado</td>
                          <td className="p-2 text-[#6b7280]">Sempre ativa</td>
                          <td className="p-2"><span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Em promoção</span></td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <button onClick={() => { setSelectedProductId(prod.id); setSelectedComboId(''); }} className="text-[#f7941d] hover:underline mr-3">Configurar desconto</button>
                            <button onClick={() => handleRemoveFlag(prod)} className="text-red-600 hover:underline">Excluir</button>

                          </td>
                        </tr>
                      );
                    })}
                    {filteredPromotions.map(pr => {
                      const prod = products.find(p => p.id === pr.productId);
                      const combo = prod?.combinations?.find(c => c.id === pr.combinationId);
                      const cat = prod ? (typeof prod.category === 'string' ? prod.category : (prod.category as any)?.name || '') : '';
                      const sb = statusBadge(pr);
                      return (
                        <tr key={pr.id} className="border-t border-gray-100">
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleMove(pr, -1)} title="Subir"
                                className="px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50">▲</button>
                              <button onClick={() => handleMove(pr, 1)} title="Descer"
                                className="px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50">▼</button>
                            </div>
                          </td>
                          <td className="p-2 font-mono">{prod?.code || '—'}</td>
                          <td className="p-2">{prod?.name || <span className="text-red-500">Produto removido</span>}</td>
                          <td className="p-2 text-[#6b7280]">{[cat, prod?.subcategory].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="p-2">{combo ? (combo.sku || combo.id.slice(0, 8)) : '— produto inteiro —'}</td>
                          <td className="p-2">{pr.ruleType === 'tiered' ? 'Progressiva' : 'Simples'}</td>
                          <td className="p-2 font-semibold text-[#ef4444]">{describePromo(pr)}</td>
                          <td className="p-2 text-[#6b7280]">
                            {pr.startsAt || pr.endsAt ? `${pr.startsAt ? new Date(pr.startsAt).toLocaleDateString('pt-BR') : '—'} → ${pr.endsAt ? new Date(pr.endsAt).toLocaleDateString('pt-BR') : '—'}` : 'Sempre ativa'}
                          </td>
                          <td className="p-2">
                            <button onClick={() => handleToggle(pr)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${sb.cls}`}>
                              {sb.label}
                            </button>
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <button onClick={() => prod && handleEdit(pr)} className="text-[#f7941d] hover:underline mr-3">Editar</button>
                            <button onClick={() => handleDelete(pr)} className="text-red-600 hover:underline">Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}



/** Aba "Mais Vendidos": seleciona e ordena os produtos do TOP 10 do cliente. */
function BestSellersTab({ products }: { products: Product[] }) {
  const [tick, setTick] = useState(0);
  const [brand, setBrand] = useState('');
  const [search, setSearch] = useState('');
  const companies = useMemo(() => categoryService.getCompanies(), []);

  const fresh = useMemo(() => {
    const latest = productService.getProducts();
    return latest.length ? latest : products;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, tick]);

  const brandProducts = useMemo(
    () => (brand ? fresh.filter(p => p.brand === brand) : []),
    [fresh, brand],
  );

  const selected = useMemo(
    () => brandProducts.filter(p => p.isFeatured)
      .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0)),
    [brandProducts],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return brandProducts
      .filter(p => !p.isFeatured)
      .filter(p => (p.code || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [brandProducts, search]);

  const persistOrder = (list: Product[]) => {
    list.forEach((p, i) => productService.updateProduct(p.id, { isFeatured: true, featuredOrder: i + 1 }));
    setTick(v => v + 1);
  };

  const add = (p: Product) => {
    productService.updateProduct(p.id, { isFeatured: true, featuredOrder: selected.length + 1 });
    setSearch('');
    setTick(v => v + 1);
  };

  const remove = (p: Product) => {
    productService.updateProduct(p.id, { isFeatured: false, featuredOrder: 0 });
    persistOrder(selected.filter(x => x.id !== p.id));
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...selected];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    persistOrder(next);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#111827] mb-1">Mais Vendidos</h3>
        <p className="text-xs text-[#6b7280] mb-4">
          Selecione os produtos que aparecem em “TOP 10 Mais Vendidos” no painel do cliente e defina a ordem de apresentação.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Empresa</label>
            <select value={brand} onChange={e => { setBrand(e.target.value); setSearch(''); }}
              className="p-2 border border-gray-200 rounded-md text-sm">
              <option value="">— Selecione uma empresa —</option>
              {companies.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {brand && (
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-[#6b7280] mb-1">Buscar produto (código ou nome)</label>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Digite ao menos 2 caracteres"
                className="w-full p-2 border border-gray-200 rounded-md text-sm" />
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
            {results.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2 text-xs">
                <span className="font-mono text-[#6b7280] w-24 truncate">{p.code}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <button onClick={() => add(p)} className="text-[#f7941d] font-semibold hover:underline">Adicionar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {brand && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
          <h4 className="text-xs font-semibold text-[#6b7280] mb-3">
            Selecionados de {brand} ({selected.length}) — os 10 primeiros aparecem no painel do cliente
          </h4>
          {selected.length === 0 ? (
            <p className="text-sm text-[#9ca3af]">Nenhum produto selecionado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[#6b7280]">
                  <tr>
                    <th className="text-left p-2 w-20">Posição</th>
                    <th className="text-left p-2">Código</th>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-left p-2 w-28">Ordem</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((p, i) => (
                    <tr key={p.id} className={`border-t border-gray-100 ${i < 10 ? '' : 'opacity-50'}`}>
                      <td className="p-2 font-bold text-[#f7941d]">{i + 1}º</td>
                      <td className="p-2 font-mono">{p.code}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => move(i, -1)} title="Subir"
                            className="px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50">▲</button>
                          <button onClick={() => move(i, 1)} title="Descer"
                            className="px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50">▼</button>
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <button onClick={() => remove(p)} className="text-red-600 hover:underline">Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
