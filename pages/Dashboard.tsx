import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { useOrders, type Order } from '@/lib/orders';
import { formatBRL, formatCNPJ } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { PromoRibbon } from '@/components/PromoRibbon';
import { SystemFooter } from '@/components/SystemFooter';
import { PurchaseHistory } from '@/components/PurchaseHistory';
import { SITE, BRANDS } from '@/lib/constants';
import { categoryService } from '@/lib/categoryService';
import type { OrderItem, OrderType, Product, ProductVariation, ProductVariationGroup, ProductVariationOption } from '@/lib/types';
import { getVariationGroups, resolvePriceForSelection, resolveSkuForSelection, resolveMinQtyForSelection, findCombination } from '@/lib/types';
import { findActivePromotion, applyPromotion, productHasAnyPromotion, promotionService } from '@/lib/promotionService';
import { toast } from '@/hooks/use-toast';
import { generateOrderPdf } from '@/lib/pdfGenerator';
import { orderNumber, generateOrderNumber } from '@/lib/orderNumber';
import { activityService } from '@/lib/activityService';
import { panicService } from '@/lib/panicService';
import { brandRulesService, globalTextsService, brandPaymentService, type PayMethod } from '@/lib/brandRulesService';
import { useCartPersistence, writeSavedCart } from '@/hooks/use-cart-persistence';
import { resolveSalePrice, promotionApplies } from '@/lib/promotionPricing';
import { DATA_READY_EVENT, hydrateOrders } from '@/lib/dataStore';
import { supabase } from '@/lib/supabase';
import { getToken } from '@/lib/secureDb';
import {
  ShoppingCart, FileText, ClipboardList, Lightbulb, CreditCard, CheckCircle2,
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Search, Trash2, Plus,
  Download, Pencil, Building2, Package, MessageCircle, Save, Mail, X, Check,
  Sparkles, Flame, Lock, Send, LogOut, RefreshCw, Star, HelpCircle, Headphones,
  ShieldCheck, Tag, MapPin, User as UserIcon, Mail as MailIcon, Hash, Zap,
  BookOpen, Megaphone, Info, Clock, Minus,
} from 'lucide-react';
import cortagLogo from '@/assets/brands/cortag.png';
import ilumiLogo from '@/assets/brands/ilumi.png';
import clawLogo from '@/assets/brands/claw.png';
import plaspolLogo from '@/assets/brands/plaspol.png';

const DEFAULT_BRAND_LOGOS: Record<string, string> = {
  'Cortag': cortagLogo,
  'Ilumi': ilumiLogo,
  'Claw Motobombas': clawLogo,
  'Plaspol': plaspolLogo,
};

const statusColors: Record<string, string> = {
  'Recebido': 'bg-blue-100 text-blue-800',
  'Em análise': 'bg-yellow-100 text-yellow-800',
  'Aprovado': 'bg-green-100 text-green-800',
  'Em separação': 'bg-purple-100 text-purple-800',
  'Faturado': 'bg-teal-100 text-teal-800',
  'Finalizado': 'bg-gray-200 text-gray-800',
  'Cancelado': 'bg-red-100 text-red-800',
};

type OrderStep = 'add-items' | 'suggestions' | 'history' | 'cart' | 'payment' | 'finalize';

const STEPS_FULL: { key: OrderStep; label: string; Icon: any }[] = [
  { key: 'add-items', label: 'Adicionar Itens', Icon: ShoppingCart },
  { key: 'suggestions', label: 'Promoções', Icon: Lightbulb },
  { key: 'history', label: 'Histórico de Compra', Icon: Clock },
  { key: 'cart', label: 'Carrinho', Icon: ShoppingCart },
  { key: 'payment', label: 'Pagamento / Frete', Icon: CreditCard },
  { key: 'finalize', label: 'Finalizar', Icon: CheckCircle2 },
];

const onlyDigits = (value?: string) => (value || '').replace(/\D/g, '');

/** Flag de promoção de um item do carrinho (usa o snapshot ou a tabela de promoções). */
const itemIsPromo = (item: { productId: string; isPromo?: boolean }) =>
  !!item.isPromo || productHasAnyPromotion(item.productId);

/** Flag visual de promoção: aceita tanto a aba Promoções quanto o campo legado do produto. */
const productIsPromo = (product?: Pick<Product, 'id' | 'isPromo'> | null) =>
  !!product?.isPromo || (!!product?.id && productHasAnyPromotion(product.id));

const itemHasPromoFlag = (item: { productId: string; isPromo?: boolean }, product?: Pick<Product, 'id' | 'isPromo'> | null) =>
  itemIsPromo(item) || productIsPromo(product);

/**
 * Carrossel horizontal responsivo: setas laterais + arrastar com o mouse/touch.
 * Usado nas sugestões (Promoções / Mais Vendidos).
 */
function HCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });
  const scrollBy = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  return (
    <div className="relative">
      <button
        type="button" onClick={() => scrollBy(-1)} aria-label="Anterior"
        className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow hover:border-[#f7941d] hover:text-[#f7941d] text-[#374151]"
      >
        <ChevronLeft size={18} />
      </button>
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2 cursor-grab active:cursor-grabbing select-none [scrollbar-width:thin]"
        style={{ touchAction: 'pan-y', scrollSnapType: 'none' }}
        onPointerDown={e => {
          const el = ref.current; if (!el) return;
          if (e.pointerType === 'touch') return;
          if ((e.target as HTMLElement).closest('select, input, textarea, option, button')) return;
          el.style.scrollBehavior = 'auto';
          try { el.setPointerCapture(e.pointerId); } catch {}
          drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
        }}
        onPointerMove={e => {
          const el = ref.current;
          if (!el || !drag.current.down) return;
          const dx = e.clientX - drag.current.startX;
          if (!drag.current.moved && Math.abs(dx) < 5) return;
          drag.current.moved = true;
          e.preventDefault();
          el.scrollLeft = drag.current.startScroll - dx;
        }}
        onPointerUp={e => {
          drag.current.down = false;
          const el = ref.current;
          if (el) el.style.scrollBehavior = '';
          try { el?.releasePointerCapture(e.pointerId); } catch {}
        }}
        onPointerCancel={() => { drag.current.down = false; if (ref.current) ref.current.style.scrollBehavior = ''; }}
        onDragStart={e => e.preventDefault()}
        onClickCapture={e => { if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; } }}
      >
        {React.Children.map(children, child => (
          <div className="shrink-0 w-[46%] sm:w-[220px]">{child}</div>
        ))}
      </div>

      <button
        type="button" onClick={() => scrollBy(1)} aria-label="Próximo"
        className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow hover:border-[#f7941d] hover:text-[#f7941d] text-[#374151]"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout, isLead, isClient, refreshUser } = useAuth();
  // Cliente cadastrado (CNPJ aprovado): nomenclatura de "Carrinho" no lugar de "Orçamento".
  const cartWording = !isLead;
  const quoteLabel = cartWording ? 'Carrinho' : 'Orçamento';
  const { products, clients } = useStore();
  const { addOrder, orders, updateOrder } = useOrders();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const toggleSub = (key: string) => setCollapsedSubs(prev => ({ ...prev, [key]: !prev[key] }));
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const { tab: tabParam, brand: brandParam, type: typeParam } = useParams<{ tab?: string; brand?: string; type?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const brandSlug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  const findBrandBySlug = (slug?: string) => {
    if (!slug) return undefined;
    const fromBrands = BRANDS.find(b => brandSlug(b.name) === slug)?.name;
    if (fromBrands) return fromBrands;
    // Inclui empresas criadas no admin (não estão na lista fixa BRANDS).
    return categoryService.getCompanies().find(c => brandSlug(c) === slug);
  };
  const isHistoryPath = location.pathname === '/painel/pedidos' || tabParam === 'pedidos' || brandParam === 'pedidos';
  const activeTab: 'order' | 'history' = isHistoryPath ? 'history' : 'order';
  const setActiveTab = (t: 'order' | 'history') => navigate(t === 'history' ? '/painel/pedidos' : '/painel');
  const [orderStep, setOrderStep] = useState<OrderStep>('add-items');
  const [payMethod, setPayMethod] = useState<PayMethod>('Boleto');
  const [paymentTerm, setPaymentTerm] = useState('');
  const [freightType, setFreightType] = useState('');
  // legado (mantém compat com submissões antigas):
  const paymentMethod = payMethod === 'A Vista' ? 'pix' : payMethod === 'Cheque' ? 'cheque' : 'boleto';
  const [observations, setObservations] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [buyer, setBuyer] = useState('');
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [detailsProduct, setDetailsProduct] = useState<typeof products[0] | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isFreshDraft, setIsFreshDraft] = useState(false);

  const [visitedSuggestions, setVisitedSuggestions] = useState(false);
  const [brandAccessModal, setBrandAccessModal] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState<{ id: string; type: OrderType; brand: string } | null>(null);
  const [brandRulesPopup, setBrandRulesPopup] = useState<string | null>(null);
  const [politicaModal, setPoliticaModal] = useState(false);
  const [informativoModal, setInformativoModal] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const [floatingCartOpen, setFloatingCartOpen] = useState(false);
  const [addedToast, setAddedToast] = useState<{ name: string; image?: string } | null>(null);
  const addedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const [freshCreditLimit, setFreshCreditLimit] = useState<number | null>(null);
  const globalTexts = useMemo(() => globalTextsService.get(), [politicaModal, informativoModal]);
  const brandRules = useMemo(() => selectedBrand ? brandRulesService.get(selectedBrand) : {}, [selectedBrand]);

  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === 'categories' || scope === 'category-icons' || scope === 'companies' || scope === 'promotions' || scope === 'all') setDataVersion(v => v + 1);
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, []);

  // Atualiza o perfil (limite de crédito, descontos, etc.) direto do banco ao
  // abrir o painel, evitando usar dados antigos em cache da sessão.
  useEffect(() => {
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega o histórico de pedidos do próprio cliente direto do banco
  // (RPC client_orders), garantindo que "Meus Pedidos" não fique vazio
  // após relogar ou atualizar a página.
  useEffect(() => {
    if (!user?.id || user.role === 'admin') return;
    void hydrateOrders();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id || user.role === 'admin') return;
    let cancelled = false;
    const loadFreshCredit = async () => {
      const applyProfile = (profile: any) => {
        if (!cancelled && profile?.credit_limit != null) setFreshCreditLimit(Number(profile.credit_limit));
      };
      try {
        const token = getToken();
        if (!token) return;
        const { data, error } = await supabase.rpc('local_profile_refresh', { _token: token });
        if (!error) {
          applyProfile(Array.isArray(data) ? data[0] : data);
        }
      } catch {}
    };
    void loadFreshCredit();
    return () => { cancelled = true; };
  }, [user?.id, user?.cnpj, user?.role]);

  useEffect(() => {
    if (!selectedBrand) return;
    const r = brandRulesService.get(selectedBrand);
    // Só exibe o popup quando a EMPRESA possui política/informativo próprios.
    // Não usar o texto GERAL como gatilho — evita o popup indevido ao atualizar.
    const hasContent = !!(r.policyText?.trim() || r.noticeText?.trim());
    if (hasContent) setBrandRulesPopup(selectedBrand);
  }, [selectedBrand]);

  // Sincroniza URL (/painel/:brand/:type) → estado
  useEffect(() => {
    if (isHistoryPath) return;
    const resolvedBrand = findBrandBySlug(brandParam) || '';
    setSelectedBrand(prev => (prev === resolvedBrand ? prev : resolvedBrand));
    const resolvedType: OrderType | null =
      typeParam === 'pedido' ? 'pedido' : typeParam === 'orcamento' ? 'orcamento' : null;
    setOrderType(prev => (prev === resolvedType ? prev : resolvedType));
  }, [brandParam, typeParam, isHistoryPath]);

  // Raio X: registra acesso do cliente à empresa e o que ele pesquisa.
  useEffect(() => {
    if (!selectedBrand) return;
    activityService.track('acesso', { brand: selectedBrand, detail: selectedBrand, dedupeMs: 10 * 60 * 1000 });
  }, [selectedBrand]);
  useEffect(() => {
    const term = search.trim();
    if (term.length < 3) return;
    const t = setTimeout(() => {
      activityService.track('busca', { brand: selectedBrand, detail: term, dedupeMs: 60 * 1000 });
    }, 900);
    return () => clearTimeout(t);
  }, [search, selectedBrand]);

  const subcatScrollRef = useRef<HTMLDivElement>(null);
  // LEADs e ORÇAMENTOS não acessam aba de Pagamento/Frete (item 12)
  const hidePayment = isLead || orderType === 'orcamento';
  // Leads: sem etapa de Histórico de Compra (além de Pagamento/Frete)
  const STEPS = useMemo(() => STEPS_FULL.filter(s => (!hidePayment || s.key !== 'payment') && (!isLead || s.key !== 'history')), [hidePayment, isLead]);

  const clientDiscount = (selectedBrand && user?.brandDiscounts?.[selectedBrand]) ?? user?.discountPct ?? 0;

  // Categorias INATIVAS da empresa — os produtos delas não podem aparecer.
  const inactiveCategoryNames = useMemo(() => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    if (!selectedBrand) return new Set<string>();
    return new Set(
      categoryService.getAll()
        .filter(c => !c.active && norm(c.brand) === norm(selectedBrand))
        .map(c => norm(c.name))
    );
  }, [selectedBrand, dataVersion]);

  const brandCategories = useMemo(() => {
    if (!selectedBrand) return [];
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const allCategories = categoryService.getAll();
    const configured = allCategories.filter(c => c.active && norm(c.brand) === norm(selectedBrand)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const configuredNames = new Set(configured.map(c => norm(c.name)));
    const fallbackFromProducts = products
      .filter(p => p.active && norm(p.brand) === norm(selectedBrand) && (p.category || '').trim()
        && !configuredNames.has(norm(p.category))
        && !inactiveCategoryNames.has(norm(p.category)))
      .reduce<typeof configured>((acc, p) => {
        if (acc.some(c => norm(c.name) === norm(p.category))) return acc;
        const matchingCategory = allCategories.find(c => norm(c.brand) === norm(selectedBrand) && norm(c.name) === norm(p.category))
          || allCategories.find(c => norm(c.name) === norm(p.category) && !!c.iconUrl);
        acc.push({
          id: `product-category-${selectedBrand}-${p.category}`,
          name: (p.category || '').trim(),
          brand: selectedBrand,
          icon: matchingCategory?.icon,
          iconUrl: matchingCategory?.iconUrl,
          subcategories: matchingCategory?.subcategories || [],
          active: true,
          order: matchingCategory?.order ?? p.order ?? 9999,
        });
        return acc;
      }, []);
    return [...configured, ...fallbackFromProducts]
      .map(cat => ({
        ...cat,
        iconUrl: cat.iconUrl || products.find(p => p.active && norm(p.brand) === norm(selectedBrand) && norm(p.category) === norm(cat.name) && !!p.image)?.image,
      }))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name));
  }, [selectedBrand, products, dataVersion, inactiveCategoryNames]);

  const clientOrders = useMemo(() => {
    const userCnpj = onlyDigits(user?.cnpj);
    return orders
      .filter(o => o.clientId === user?.id || (!!userCnpj && onlyDigits(o.clientCnpj) === userCnpj))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, user]);

  const localClientProfile = useMemo(() => {
    const userCnpj = onlyDigits(user?.cnpj);
    return clients.find(c => c.id === user?.id || (!!userCnpj && onlyDigits(c.cnpj) === userCnpj));
  }, [clients, user?.id, user?.cnpj]);

  const creditLimit = localClientProfile?.creditLimit ?? freshCreditLimit ?? user?.creditLimit ?? 0;
  const availableCredit = creditLimit;

  const filteredProducts = useMemo(() => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    let list = products.filter(p => p.active);
    if (selectedBrand) list = list.filter(p => norm(p.brand) === norm(selectedBrand));
    // Categorias inativas não aparecem para o cliente — nem seus produtos.
    list = list.filter(p => !inactiveCategoryNames.has(norm(p.category)));
    // Busca preenchida = pesquisa em TODA a empresa (não limita a navegação
    // pela categoria/subcategoria selecionada).
    const searching = !!search && search.trim().length >= 1;
    if (!searching && selectedCategory !== 'all') list = list.filter(p => norm(p.category) === norm(selectedCategory));
    if (!searching && selectedSubcategory !== 'all') list = list.filter(p => norm(p.subcategory) === norm(selectedSubcategory));
    if (searching) {
      const t = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(t) ||
        p.code.toLowerCase().includes(t) ||
        p.synonyms?.some(s => s.toLowerCase().includes(t)) ||
        // Busca também pelo código (SKU) das combinações/variações
        (p.combinations || []).some(c => (c.sku || '').toLowerCase().includes(t)) ||
        (p.variationGroups || []).some(g => (g.options || []).some(o => (o.sku || '').toLowerCase().includes(t))) ||
        (p.variations || []).some(v => (v.sku || '').toLowerCase().includes(t))
      );
    }
    // Ordem do cadastro: Categoria (ordem admin) → Subcategoria (ordem admin)
    // → ordem do produto → nome. Evita a lista "embaralhada" na aba "Todos".
    const catIdx = (name?: string) => {
      const i = brandCategories.findIndex(c => norm(c.name) === norm(name));
      return i < 0 ? 9999 : i;
    };
    const subIdx = (catName?: string, sub?: string) => {
      const cat = brandCategories.find(c => norm(c.name) === norm(catName));
      const list = cat?.subcategories || [];
      const i = list.findIndex(s => norm(s) === norm(sub));
      return i < 0 ? 9999 : i;
    };
    return [...list].sort((a, b) =>
      catIdx(a.category) - catIdx(b.category)
      || (a.category || '').localeCompare(b.category || '')
      || subIdx(a.category, a.subcategory) - subIdx(b.category, b.subcategory)
      || (a.subcategory || '').localeCompare(b.subcategory || '')
      || (a.order ?? 0) - (b.order ?? 0)
      || a.name.localeCompare(b.name)
    );
  }, [products, selectedCategory, selectedSubcategory, search, selectedBrand, inactiveCategoryNames, brandCategories]);

  // Reseta a sanfona (subgrupos recolhidos) ao trocar de filtro
  useEffect(() => { setCollapsedSubs({}); }, [selectedCategory, selectedSubcategory, search, selectedBrand]);

  // Busca preenchida: libera a navegação de grupo e pesquisa em TODA a empresa.
  useEffect(() => {
    if (search.trim().length >= 1) {
      setSelectedCategory('all');
      setSelectedSubcategory('all');
    }
  }, [search]);

  const availableSubcategories = useMemo(() => {
    if (selectedCategory === 'all' || !selectedBrand) return [];
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const categoryFromList = brandCategories.find(c => norm(c.name) === norm(selectedCategory));
    const defined = categoryService.getSubcategoriesByBrand(selectedBrand, selectedCategory).length > 0
      ? categoryService.getSubcategoriesByBrand(selectedBrand, selectedCategory)
      : (categoryFromList?.subcategories || []);
    const byNorm = new Map<string, string>();
    defined.forEach(sub => { if ((sub || '').trim()) byNorm.set(norm(sub), sub.trim()); });
    // Inclui subcategorias realmente presentes nos produtos para não sumirem
    // quando o cadastro de categoria estiver incompleto ou ainda revalidando.
    const present = Array.from(new Set(
      products
        .filter(p => p.active && norm(p.brand) === norm(selectedBrand) && norm(p.category) === norm(selectedCategory) && (p.subcategory || '').trim())
        .map(p => (p.subcategory as string).trim())
    ));
    present.forEach(sub => { if (!byNorm.has(norm(sub))) byNorm.set(norm(sub), sub); });
    const subs = Array.from(byNorm.values());
    // Ordena pela ordem definida no painel admin quando existir; senão alfabética.
    const orderIdx = (s: string) => {
      const i = defined.findIndex(d => norm(d) === norm(s));
      return i < 0 ? 9999 : i;
    };
    return subs.sort((a, b) => orderIdx(a) - orderIdx(b) || a.localeCompare(b));
  }, [selectedCategory, selectedBrand, products, brandCategories, dataVersion]);

  // Agrupa os produtos filtrados por subgrupo (para a sanfona do cliente).
  // Quando há busca, agrupa por CATEGORIA para que itens de outros grupos
  // apareçam organizados e não fiquem escondidos dentro de uma subcategoria.
  const productGroups = useMemo(() => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const searching = !!search && search.trim().length >= 1;
    const map = new Map<string, typeof filteredProducts>();
    filteredProducts.forEach(p => {
      const key = selectedCategory === 'all' || searching
        ? ((p.category || '').trim() || 'Geral')
        : ((p.subcategory || '').trim() || 'Geral');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    const order = selectedCategory === 'all' || searching
      ? [...brandCategories.map(c => c.name), 'Geral']
      : [...availableSubcategories, 'Geral'];
    const idx = (s: string) => {
      const i = order.findIndex(o => norm(o) === norm(s));
      return i < 0 ? 9999 : i;
    };
    // Na aba "Todos" (ou em busca global), dentro de cada categoria os produtos respeitam a ordem
    // administrativa das subcategorias e, dentro delas, a ordem dos produtos.
    if (selectedCategory === 'all' || searching) {
      const subIndex = (catName: string, sub?: string) => {
        const cat = brandCategories.find(c => norm(c.name) === norm(catName));
        const list = cat?.subcategories || [];
        const i = list.findIndex(s => norm(s) === norm(sub));
        return i < 0 ? 9999 : i;
      };
      map.forEach((list, catName) => {
        list.sort((a, b) =>
          subIndex(catName, a.subcategory) - subIndex(catName, b.subcategory)
          || (a.subcategory || '').localeCompare(b.subcategory || '')
          || (a.order ?? 0) - (b.order ?? 0)
          || a.name.localeCompare(b.name)
        );
      });
    }
    return Array.from(map.entries()).sort(([a], [b]) => idx(a) - idx(b) || a.localeCompare(b));
  }, [filteredProducts, availableSubcategories, brandCategories, selectedCategory, search]);

  const getEffectiveDiscount = (productDiscountPct?: number) => {
    if (clientDiscount > 0) return clientDiscount;
    return productDiscountPct || 0;
  };

  const applyDiscount = (price: number, productDiscountPct?: number, fixedPrice?: boolean) => {
    if (fixedPrice) return price; // Preço fixo: nenhum desconto é aplicado.
    const disc = getEffectiveDiscount(productDiscountPct);
    return price * (1 - disc / 100);
  };

  /** Produto (ou combinação selecionada) marcado como PREÇO FIXO. */
  const isFixedPrice = (product?: Product | null, combo?: { fixedPrice?: boolean } | null) =>
    !!(product?.fixedPrice || combo?.fixedPrice);

  // Ajusta uma quantidade para respeitar o múltiplo cadastrado (mínimo = passo).
  const snapToMultiple = (value: number, step: number) => {
    const s = Math.max(1, step || 1);
    if (!value || value < s) return s;
    return Math.ceil(value / s) * s;
  };

  const parseQty = (value: string | number | undefined, fallback = 0) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const n = parseInt((value || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizedItems = (rows = items) => rows.map(item => {
    const q = snapToMultiple(item.qty, item.minQty || 1);
    const total = item.unitPrice * q;
    return { ...item, qty: q, totalPrice: total, subtotal: total, subtotalAfterExtra: total, totalWithTax: total };
  });


  const addToOrder = (
    product: typeof products[0],
    qty?: number | string,
    selections?: { group: ProductVariationGroup; option: ProductVariationOption }[],
  ) => {
    if (!selectedBrand) return;
    if (product.brand.toLowerCase() !== selectedBrand.toLowerCase()) {
      toast({ title: 'Empresa diferente', description: `Você só pode adicionar produtos da empresa ${selectedBrand} neste ${orderType || 'pedido'}.`, variant: 'destructive' });
      return;
    }
    const groups = getVariationGroups(product);
    // Produtos com variações exigem a escolha de TODAS as variações.
    if (groups.length > 0) {
      if (!selections || selections.length !== groups.length || selections.some(s => !s.option)) {
        toast({ title: 'Escolha as variações', description: 'Selecione todas as variações (ex.: voltagem, potência) antes de adicionar ao carrinho.', variant: 'destructive' });
        return;
      }
    }
    const sels = selections || [];
    const variationKey = sels.map(s => `${s.group.id}:${s.option.id}`).join('|');
    if (items.find(i => i.productId === product.id && (i.variationKey || '') === variationKey)) return;
    // Preço e código efetivos da seleção:
    // - múltiplas variações: usa o preço/código da combinação cadastrada (se houver);
    // - uma variação: usa o preço/código da opção;
    // - sem variação: usa o preço/código do produto principal.
    const optionIds = sels.map(s => s.option.id);
    const usesCombos = (product.combinations || []).length > 0;
    if (groups.length > 0 && usesCombos && !findCombination(product, optionIds)) {
      toast({ title: 'PRODUTO NÃO ENCONTRADO', description: 'Esta combinação não possui cadastro.', variant: 'destructive' });
      return;
    }
    const basePrice = resolvePriceForSelection(product, optionIds);
    const code = resolveSkuForSelection(product, optionIds) || product.code;
    const minQty = resolveMinQtyForSelection(product, optionIds);
    const q = snapToMultiple(parseQty(qty, minQty), minQty);
    // A promoção substitui o desconto do cliente, sempre sobre o preço de tabela.
    const combo = optionIds.length ? findCombination(product, optionIds) : null;
    const promo = findActivePromotion(product.id, combo?.id ?? null);
    const fixed = isFixedPrice(product, combo);
    const disc = fixed || promotionApplies(promo, q) ? 0 : getEffectiveDiscount(product.discountPct);
    const salePrice = resolveSalePrice(basePrice, promo, q, getEffectiveDiscount(product.discountPct), fixed);
    const selectionPairs = sels.map(s => ({ groupName: s.group.name, optionName: s.option.name }));
    const variationText = selectionPairs.map(s => `${s.groupName}: ${s.optionName}`).join(', ');
    const item: OrderItem = {
      productId: product.id,
      variationId: sels[0]?.option.id,
      variationName: selectionPairs.map(s => s.optionName).join(' / ') || undefined,
      selections: selectionPairs.length ? selectionPairs : undefined,
      variationKey: variationKey || undefined,
      code,
      name: variationText ? `${product.name} - ${variationText}` : product.name,
      image: product.image,
      qty: q, minQty, isPromo: !!promo || !!product.isPromo, isFeatured: product.isFeatured, isNew: product.isNew,
      unitPrice: salePrice, totalPrice: salePrice * q,
      listPrice: basePrice, salePrice, discountPct: disc,
      subtotal: salePrice * q, extraDiscountPct: 0, subtotalAfterExtra: salePrice * q,
      ipiRate: 0, ipiValue: 0, stRate: 0, stValue: 0, totalWithTax: salePrice * q,
    };
    setItems(prev => [...prev, item]);
    activityService.track('carrinho', { brand: selectedBrand, detail: item.name, meta: { code: item.code, qty: q } });
    // Pop-up "Produto adicionado" — surge perto do carrinho suspenso.
    setAddedToast({ name: product.name, image: product.image });
    if (addedToastTimer.current) clearTimeout(addedToastTimer.current);
    addedToastTimer.current = setTimeout(() => setAddedToast(null), 3500);
  };

  // Recalcula o preço unitário do item para uma nova quantidade (necessário
  // para promoções progressivas por faixa de quantidade).
  const priceItemForQty = (item: OrderItem, newQty: number): number => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return item.unitPrice;
    const optionIds = (item.variationKey || '').split('|').filter(Boolean).map(s => s.split(':')[1]).filter(Boolean);
    const combo = optionIds.length ? findCombination(product, optionIds) : null;
    const promo = findActivePromotion(product.id, combo?.id ?? null);
    return resolveSalePrice(item.listPrice, promo, newQty, getEffectiveDiscount(product.discountPct), isFixedPrice(product, combo));
  };

  const updateQty = (idx: number, qty: number, snap = false) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const q = snap ? snapToMultiple(qty, item.minQty || 1) : Math.max(0, qty || 0);
      const unit = priceItemForQty(item, q);
      const total = unit * q;
      return { ...item, qty: q, unitPrice: unit, salePrice: unit, totalPrice: total, subtotal: total, subtotalAfterExtra: total, totalWithTax: total };
    }));
  };

  // Sincroniza a quantidade digitada no CARD do produto com o item já no
  // carrinho (quando o produto está adicionado). Sem isso, mudar a quantia no
  // card não atualizava o carrinho automaticamente.
  const syncCartQtyByKey = (productId: string, variationKey: string, qty: number) => {
    setItems(prev => prev.map(item => {
      if (item.productId !== productId || (item.variationKey || '') !== (variationKey || '')) return item;
      const q = Math.max(item.minQty || 1, qty || 0);
      const unit = priceItemForQty(item, q);
      const total = unit * q;
      return { ...item, qty: q, unitPrice: unit, salePrice: unit, totalPrice: total, subtotal: total, subtotalAfterExtra: total, totalWithTax: total };
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totals = useMemo(() => {
    const total = items.reduce((s, i) => s + i.totalPrice, 0);
    return { total, withinCreditLimit: total <= availableCredit };
  }, [items, availableCredit]);

  const pricesBlocked = !!selectedBrand && panicService.isBlocked(selectedBrand);
  const hidePrices = isLead || pricesBlocked;
  const renderPrice = (v: number) => hidePrices ? <span className="text-[#9ca3af] italic">—</span> : <span>{formatBRL(v)}</span>;

  // Logo da empresa/marca do produto (admin ou padrão), exibido no card.
  const getBrandLogo = (brandName?: string) => {
    if (!brandName) return undefined;
    const custom = categoryService.getCompanyMeta(brandName).logoUrl || brandRulesService.get(brandName).logoUrl;
    return custom || DEFAULT_BRAND_LOGOS[brandName];
  };

  // Chave do carrinho salvo (por cliente + empresa).
  const cartKey = (brand: string) => `moura_cart_${user?.id || 'anon'}_${brand}`;
  const clearSavedCart = (brand?: string) => {
    try { localStorage.removeItem(cartKey(brand || selectedBrand)); } catch { /* ignore */ }
  };

  const resetFlow = () => {
    suspendCartSaving();

    setItems([]); setOrderStep('add-items'); setObservations(''); setPurchaseOrder('');
    setInvoiceNote(''); setBuyer(''); setEditingOrderId(null); setIsFreshDraft(false); setVisitedSuggestions(false);
  };

  const [cartsVersion, setCartsVersion] = useState(0);
  const cartErrorShown = useRef(false);
  const reportCartError = () => {
    if (cartErrorShown.current) return;
    cartErrorShown.current = true;
    toast({ title: 'Não foi possível guardar o carrinho', description: 'O armazenamento deste navegador está indisponível ou cheio. Não feche a página antes de concluir.', variant: 'destructive' });
  };
  const { ready: cartReady, suspendSaving: suspendCartSaving } = useCartPersistence({
    accountId: user?.id,
    brand: selectedBrand,
    editing: !!editingOrderId,
    skipRestore: isFreshDraft,
    cart: { items, orderType, observations, purchaseOrder, invoiceNote, buyer, paymentMethod, paymentTerm },
    restore: saved => {
      setItems(withProductImages(saved.items));
      setObservations(saved.observations ?? '');
      setPurchaseOrder(saved.purchaseOrder ?? '');
      setInvoiceNote(saved.invoiceNote ?? '');
      setBuyer(saved.buyer ?? '');
      if (saved.paymentTerm) setPaymentTerm(saved.paymentTerm);
      if (saved.paymentMethod) setPayMethod(saved.paymentMethod === 'pix' || saved.paymentMethod === 'PIX' ? 'A Vista' : saved.paymentMethod === 'cheque' ? 'Cheque' : 'Boleto');
    },
    onError: reportCartError,
  });

  useEffect(() => {
    if (!cartReady || editingOrderId) return;
    setCartsVersion(v => v + 1);
    const syncTimer = setTimeout(() => {
      activityService.track('carrinho_salvo', {
        brand: selectedBrand,
        detail: `${items.length} ${items.length === 1 ? 'item' : 'itens'}`,
        meta: {
          itens: items.length,
          total: items.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
          items: items.map(item => ({ name: item.name, code: item.code, qty: item.qty })),
        },
      });
    }, 700);
    return () => clearTimeout(syncTimer);
  }, [cartReady, items, selectedBrand, editingOrderId]);

  const savedCarts = useMemo(() => {
    const prefix = `moura_cart_${user?.id || 'anon'}_`;
    const list: { brand: string; count: number; total: number; savedAt?: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const d = JSON.parse(localStorage.getItem(k) || '{}');
        if (!Array.isArray(d?.items) || d.items.length === 0) continue;
        list.push({
          brand: k.slice(prefix.length), count: d.items.length,
          total: d.items.reduce((t: number, it: any) => t + (it.totalPrice || 0), 0),
          savedAt: d.savedAt,
        });
      }
    } catch { /* ignore */ }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, cartsVersion, activeTab]);

  // Garante a imagem dos itens do carrinho assim que os produtos carregam.
  useEffect(() => {
    if (products.length === 0) return;
    setItems(prev => {
      if (prev.length === 0 || prev.every(i => i.image)) return prev;
      const next = withProductImages(prev);
      return next.some((it, idx) => it !== prev[idx]) ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);





  const submitOrder = (typeOverride?: OrderType) => {
    const effectiveType = typeOverride || orderType;
    if (items.length === 0 || !effectiveType || !selectedBrand) return;
    const orderItems = normalizedItems();
    const validationError = getSubmissionError(effectiveType, orderItems);
    if (validationError) {
      toast({ title: 'Não foi possível enviar', description: validationError, variant: 'destructive' });
      setItems(orderItems);
      return;
    }
    const submissionTotal = getEffectiveTotalForRows(effectiveType, orderItems);
    setItems(orderItems);
    if (editingOrderId) {
      updateOrder(editingOrderId, {
        items: orderItems,
        type: effectiveType,
        // Finalizar sai de rascunho e é efetivamente enviado ao admin.
        status: 'Recebido',
        generalDiscountPct: clientDiscount,
        totalBruto: orderItems.reduce((s, i) => s + (i.listPrice * i.qty), 0),
        totalWithDiscount: orderItems.reduce((s, i) => s + i.totalPrice, 0), totalIPI: 0, totalST: 0, totalWithTax: submissionTotal,
        observations, purchaseOrder, invoiceNote, buyer,
        paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Boleto Bancário', paymentTerm,
      });
      const editedOrder = orders.find(o => o.id === editingOrderId);
      const editedNum = editedOrder ? orderNumber(editedOrder) : editingOrderId;
      toast({ title: `${effectiveType === 'pedido' ? 'Pedido' : 'Orçamento'} atualizado!`, description: `${effectiveType === 'pedido' ? 'Pedido' : 'Orçamento'} ${editedNum} foi atualizado com sucesso.` });
      setSubmittedSuccess({ id: editedNum, type: effectiveType, brand: selectedBrand });
    } else {
      const created = addOrder({
        clientId: user?.id || '', clientName: user?.companyName || '', clientCnpj: user?.cnpj || '',
        brand: selectedBrand, type: effectiveType, items: orderItems,
        generalDiscountPct: clientDiscount,
        totalBruto: orderItems.reduce((s, i) => s + (i.listPrice * i.qty), 0),
        totalWithDiscount: orderItems.reduce((s, i) => s + i.totalPrice, 0), totalIPI: 0, totalST: 0, totalWithTax: submissionTotal,
        observations, purchaseOrder, invoiceNote, buyer,
        paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Boleto Bancário', paymentTerm,
      });
      setSubmittedSuccess({ id: orderNumber(created), type: effectiveType, brand: selectedBrand });
    }
  };

  const finishSuccess = () => {
    setSubmittedSuccess(null);
    clearSavedCart();
    resetFlow();
    setActiveTab('history');
  };

  const downloadSuccessPdf = () => {
    if (!submittedSuccess) return;
    generateOrderPdf({
      type: submittedSuccess.type, brand: submittedSuccess.brand,
      clientName: user?.companyName || '', clientCnpj: user?.cnpj || '',
      clientEmail: user?.email, clientAddress: user?.address,
      items, total: totals.total,
      paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Boleto Bancário',
      paymentTerm, observations, purchaseOrder, invoiceNote, buyer,
      orderNumber: submittedSuccess.id,
      freight: hidePayment ? undefined : freightValue,
      hidePrices: isLead,
    });
  };

  const buildPdfData = (orderNum?: string) => ({
    type: orderType || 'pedido' as const,
    brand: selectedBrand,
    clientName: user?.companyName || '',
    clientCnpj: user?.cnpj || '',
    clientEmail: user?.email,
    clientAddress: user?.address,
    items, total: totals.total,
    paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Boleto Bancário',
    paymentTerm, observations, purchaseOrder, invoiceNote, buyer,
    freight: hidePayment ? undefined : freightValue,
    orderNumber: orderNum,
  });

  const handleSendPdf = (via: 'email' | 'whatsapp') => {
    const orderNum = editingOrderId || (items.length > 0 ? new Date().toISOString() : '');
    generateOrderPdf(buildPdfData(orderNum.length === 12 ? orderNum : undefined));
    if (via === 'whatsapp') {
      const typeLabel = orderType === 'pedido' ? 'Pedido' : 'Orçamento';
      const list = items.map(i => `• ${i.code} - ${i.name} | Qtd: ${i.qty} | ${formatBRL(i.totalPrice)}`).join('\n');
      const text = `*${typeLabel} - Moura Representações*\n\nCliente: ${user?.companyName}\nCNPJ: ${user?.cnpj}\nEmpresa: ${selectedBrand}\n\n*Itens:*\n${list}\n\n*Total: ${formatBRL(totals.total)}*\nPagamento: ${paymentMethod === 'pix' ? 'PIX' : 'Boleto'} - ${paymentTerm}`;
      window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(text)}`, '_blank');
    }
    if (items.length > 0 && orderType && selectedBrand && !editingOrderId) {
      submitOrderSilent();
      toast({
        title: 'Recebido com sucesso!',
        description: `Seu ${orderType === 'pedido' ? 'pedido' : 'orçamento'} foi recebido e está em análise.`,
      });
    }
  };

  const submitOrderSilent = () => {
    if (items.length === 0 || !orderType || !selectedBrand) return;
    const orderItems = normalizedItems();
    const validationError = getSubmissionError(orderType, orderItems);
    if (validationError) return;
    const submissionTotal = getEffectiveTotalForRows(orderType, orderItems);
    setItems(orderItems);
    addOrder({
      clientId: user?.id || '', clientName: user?.companyName || '', clientCnpj: user?.cnpj || '',
      brand: selectedBrand, type: orderType, items: orderItems,
      generalDiscountPct: clientDiscount,
      totalBruto: orderItems.reduce((s, i) => s + (i.listPrice * i.qty), 0),
      totalWithDiscount: orderItems.reduce((s, i) => s + i.totalPrice, 0), totalIPI: 0, totalST: 0, totalWithTax: submissionTotal,
      observations, purchaseOrder, invoiceNote, buyer,
      paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Boleto Bancário', paymentTerm,
    });
    resetFlow();
  };

  // Reanexa as imagens dos produtos (são removidas ao salvar pedido/orçamento
  // para economizar espaço), buscando pelo productId ou código do produto.
  const withProductImages = <T extends { image?: string; productId?: string; code?: string }>(list: T[]): T[] =>
    list.map(it => {
      if (it.image) return it;
      const prod = products.find(p => p.id === it.productId || p.code === it.code);
      return prod?.image ? { ...it, image: prod.image } : it;
    });

  const downloadOrderPdf = (o: Order) => {
    const itemsWithImages = withProductImages(o.items);
    generateOrderPdf({
      type: o.type, brand: o.brand,
      clientName: o.clientName, clientCnpj: o.clientCnpj,
      clientEmail: user?.email, clientAddress: user?.address,
      items: itemsWithImages, total: o.totalWithTax,
      ipi: o.totalIPI,
      paymentMethod: isLead ? '' : 'Boleto Bancário',
      paymentTerm: isLead ? '' : '28/56/84 dias',
      orderNumber: orderNumber(o),
      hidePrices: isLead,
      status: o.status,
      createdAt: o.createdAt,
    });
  };

  const editOrder = (o: Order) => {
    if (o.status !== 'Rascunho') {
      toast({ title: 'Não é possível editar', description: 'Apenas rascunhos podem ser editados. Pedidos e orçamentos já enviados não podem ser alterados.', variant: 'destructive' });
      return;
    }

    setOrderType(o.type);
    setSelectedBrand(o.brand);
    setItems(withProductImages(o.items));
    // Restaura os campos de cabeçalho salvos no rascunho (evita perda de dados).
    setObservations(o.observations ?? '');
    setPurchaseOrder(o.purchaseOrder ?? '');
    setInvoiceNote(o.invoiceNote ?? '');
    setBuyer(o.buyer ?? '');
    if (o.paymentTerm) setPaymentTerm(o.paymentTerm);
    if (o.paymentMethod) setPayMethod(o.paymentMethod === 'PIX' ? 'A Vista' : o.paymentMethod === 'cheque' || o.paymentMethod === 'Cheque' ? 'Cheque' : 'Boleto');
    setEditingOrderId(o.id);
    setIsFreshDraft(false);
    setOrderStep('cart');

    navigate(`/painel/${brandSlug(o.brand)}/${o.type === 'pedido' ? 'pedido' : 'orcamento'}`);
    setVisitedSuggestions(true); // permite ir direto ao carrinho
  };

  // Repetir Pedido / Voltar ao Carrinho: carrega os itens em um novo carrinho.
  const reuseOrder = (o: Order, type: 'pedido' | 'orcamento') => {
    setOrderType(type);
    setSelectedBrand(o.brand);
    setItems(withProductImages(o.items));
    setObservations('');
    setPurchaseOrder('');
    setInvoiceNote('');
    setBuyer('');
    setEditingOrderId(null);
    setIsFreshDraft(true);
    setVisitedSuggestions(true);
    setOrderStep('cart');
    setActiveTab('order');
    navigate(`/painel/${brandSlug(o.brand)}/${type === 'pedido' ? 'pedido' : 'orcamento'}`);
  };

  const requestBrandAccess = (brandName: string) => {
    const text = `Olá! Gostaria de solicitar acesso à empresa ${brandName} na plataforma Moura Representações.\n\nMeus dados:\nRazão Social: ${user?.companyName || ''}\nCNPJ: ${user?.cnpj || ''}`;
    window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(text)}`, '_blank');
    setBrandAccessModal(null);
  };

  const [productQtys, setProductQtys] = useState<Record<string, number | string>>({});
  // Variações selecionadas por produto: { [productId]: { [groupId]: optionId } }.
  const [variationSel, setVariationSel] = useState<Record<string, Record<string, string>>>({});

  // Resolve as variações escolhidas de um produto a partir do estado.
  const resolveSelections = (p: typeof products[0]) => {
    const groups = getVariationGroups(p);
    const sel = variationSel[p.id] || {};
    const chosen = groups.map(g => ({ group: g, option: g.options.find(o => o.id === sel[g.id]) }));
    const allSelected = chosen.every(c => !!c.option);
    const variationKey = allSelected ? chosen.map(c => `${c.group.id}:${c.option!.id}`).join('|') : '';
    const ready = chosen.filter(c => c.option) as { group: ProductVariationGroup; option: ProductVariationOption }[];
    return { groups, chosen, allSelected, variationKey, ready };
  };
  const setVarOption = (productId: string, groupId: string, optionId: string) => {
    setVariationSel(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [groupId]: optionId } }));
    // Ao trocar a combinação, ajusta automaticamente a quantidade para a
    // quantidade mínima daquela combinação (cada combo pode ter a sua).
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const groups = getVariationGroups(p);
    const cur = { ...(variationSel[productId] || {}), [groupId]: optionId };
    const selectedIds = groups.map(g => cur[g.id]).filter(Boolean) as string[];
    if (selectedIds.length === groups.length) {
      const mq = Math.max(1, resolveMinQtyForSelection(p, selectedIds));
      setProductQtys(pq => ({ ...pq, [productId]: mq }));
    }
  };

  // Inicializa as variações de cada produto visível com a primeira opção ativa,
  // evitando que o cliente veja "Selecionar" no painel.
  useEffect(() => {
    setVariationSel(prev => {
      let changed = false;
      const next: Record<string, Record<string, string>> = { ...prev };
      for (const p of filteredProducts) {
        const groups = getVariationGroups(p);
        if (groups.length === 0) continue;
        const current = next[p.id] || {};
        let updated: Record<string, string> = { ...current };
        for (const g of groups) {
          if (!current[g.id] && g.options.length > 0) {
            const first = g.options.find(o => o.active !== false) || g.options[0];
            updated[g.id] = first.id;
            changed = true;
          }
        }
        if (changed) next[p.id] = updated;
      }
      return changed ? next : prev;
    });
  }, [filteredProducts]);

  // Busca por código de VARIAÇÃO: pré-seleciona a combinação correspondente.
  useEffect(() => {
    const t = (search || '').trim().toLowerCase();
    if (t.length < 2) return;
    setVariationSel(prev => {
      let changed = false;
      const next = { ...prev };
      for (const p of filteredProducts) {
        const groups = getVariationGroups(p);
        if (groups.length === 0) continue;
        const combo = (p.combinations || []).find(c => (c.sku || '').toLowerCase() === t)
          || (p.combinations || []).find(c => (c.sku || '').toLowerCase().includes(t));
        let target: Record<string, string> | null = null;
        if (combo) {
          target = {};
          for (const g of groups) {
            const opt = g.options.find(o => combo.optionIds.includes(o.id));
            if (opt) target[g.id] = opt.id;
          }
        } else {
          for (const g of groups) {
            const opt = g.options.find(o => (o.sku || '').toLowerCase() === t);
            if (opt) { target = { ...(target || {}), [g.id]: opt.id }; }
          }
        }
        if (!target) continue;
        const cur = next[p.id] || {};
        if (Object.entries(target).every(([k, v]) => cur[k] === v)) continue;
        next[p.id] = { ...cur, ...target };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [search, filteredProducts]);

  // Preço a exibir no card: respeita a seleção atual; sem seleção completa mostra
  // o menor preço possível ("a partir de").
  const displayPrice = (p: typeof products[0]): { price: number; from: boolean } => {
    const groups = getVariationGroups(p);
    if (groups.length === 0) return { price: p.price, from: false };
    const sel = variationSel[p.id] || {};
    const chosenIds = groups.map(g => sel[g.id]).filter(Boolean) as string[];
    if (chosenIds.length === groups.length) return { price: resolvePriceForSelection(p, chosenIds), from: false };
    let combos: string[][] = [[]];
    for (const g of groups) {
      const next: string[][] = [];
      for (const pre of combos) for (const o of g.options) next.push([...pre, o.id]);
      combos = next;
    }
    const prices = combos.map(ids => resolvePriceForSelection(p, ids)).filter(v => v > 0);
    const min = prices.length ? Math.min(...prices) : p.price;
    return { price: min, from: prices.length > 1 && new Set(prices).size > 1 };
  };
  const [historyType, setHistoryType] = useState<'pedido' | 'orcamento'>('pedido');
  const historyOrders = useMemo(() => clientOrders.filter(o => o.type === (isLead ? 'orcamento' : historyType)), [clientOrders, historyType, isLead]);
  // Card de produto reutilizável (aba Adicionar Itens e Histórico de Compra)
  const renderProductCard = (p: typeof products[0]) => {
                        const showPrice = !(isLead || (selectedBrand && panicService.isBlocked(selectedBrand)));
                        const { groups, chosen, allSelected, variationKey, ready } = resolveSelections(p);
                        const hasVars = groups.length > 0;
                        const inCart = items.some(i => i.productId === p.id && (i.variationKey || '') === (hasVars ? variationKey : ''));
                        const dp = displayPrice(p);
                        const usesCombos = (p.combinations || []).length > 0;
                        // item 10: quando o produto tem combinações e ainda não há
                        // seleção completa, exibimos o código e o preço da 1ª combinação.
                        const firstCombo = usesCombos ? ((p.combinations || []).find(c => c.active !== false) || (p.combinations || [])[0]) : null;
                        const usingFirstCombo = usesCombos && !(hasVars && allSelected);
                        const basePrice = (usingFirstCombo && firstCombo && firstCombo.price != null) ? firstCombo.price : dp.price;
                        const showFrom = usingFirstCombo ? false : dp.from;
                        // Promoção: usa combinação selecionada; se ainda não selecionada, tenta a 1ª combo (ou base).
                        const promoComboId = (hasVars && allSelected)
                          ? (findCombination(p, chosen.filter(c => c.option).map(c => c.option!.id))?.id ?? null)
                          : (firstCombo?.id ?? null);
                        const activePromo = findActivePromotion(p.id, promoComboId);
                        const selectedIds = hasVars ? chosen.filter(c => c.option).map(c => c.option!.id) : [];
                        const effMinQty = Math.max(1, hasVars ? resolveMinQtyForSelection(p, selectedIds) : (p.minQty || 1));
                        const qtyRaw = productQtys[p.id] ?? effMinQty;
                        const qtyNum = Math.max(effMinQty, snapToMultiple(parseQty(qtyRaw, effMinQty), effMinQty));
                        const promoPrice = applyPromotion(basePrice, activePromo, qtyNum);
                        const hasPromoPrice = !!activePromo && promoPrice < basePrice;
                        const hasPromo = hasPromoPrice || productIsPromo(p);
                        const fixedPriceSel = isFixedPrice(p, (hasVars && allSelected) ? findCombination(p, selectedIds) : firstCombo);
                        const salePrice = resolveSalePrice(basePrice, activePromo, qtyNum, getEffectiveDiscount(p.discountPct), fixedPriceSel);
                        const originalWithDiscount = applyDiscount(basePrice, p.discountPct, fixedPriceSel);
                        const brandLogo = getBrandLogo(p.brand);
                        const qty = qtyRaw;
                        const missingCombo = hasVars && allSelected && usesCombos && !findCombination(p, selectedIds);
                        const displayCode = (hasVars && allSelected && !missingCombo)
                          ? resolveSkuForSelection(p, selectedIds)
                          : (usingFirstCombo && firstCombo && firstCombo.sku ? firstCombo.sku : p.code);

                        const toggleCard = () => {
                          if (inCart) {
                            const idx = items.findIndex(i => i.productId === p.id && (i.variationKey || '') === (hasVars ? variationKey : ''));
                            if (idx >= 0) removeItem(idx);
                            return;
                          }
                          if (hasVars && !allSelected) { toast({ title: 'Escolha as variações', description: 'Selecione todas as variações antes de adicionar.', variant: 'destructive' }); return; }
                          if (missingCombo) { toast({ title: 'Variação indisponível', description: 'Esta combinação não possui cadastro.', variant: 'destructive' }); return; }
                          const q = snapToMultiple(parseQty(qty, effMinQty), effMinQty);
                          setProductQtys(prev => ({ ...prev, [p.id]: q }));
                          addToOrder(p, q, ready);
                        };
                        return (
                          <div key={p.id} className="relative isolate overflow-hidden bg-white border border-gray-200 rounded-xl p-4 flex flex-col hover:shadow-md transition-shadow">
                            {/* checkbox seleção */}
                            <input type="checkbox" checked={inCart} onChange={toggleCard}
                              disabled={((hasVars && !allSelected) || missingCombo) && !inCart}
                              title={inCart ? 'Remover do carrinho' : 'Adicionar ao carrinho'}
                              className="absolute top-3 left-3 z-10 w-4 h-4 accent-[#f7941d] cursor-pointer" />
                            {/* logo da marca */}
                            {brandLogo && <img src={brandLogo} alt={p.brand} className="absolute top-3 right-3 h-5 max-w-[70px] object-contain" />}
                            {/* selo de promoção — vem SOMENTE da tabela product_promotions */}
                            {hasPromo && <PromoRibbon />}
                            {/* imagem */}
                            <div className="h-36 flex items-center justify-center mb-3 cursor-pointer mt-2" onClick={() => p.image && setZoomImage(p.image)}>
                              {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="max-h-36 max-w-full object-contain" /> : <Package size={48} className="text-gray-300" />}
                            </div>
                            <h3 className="text-sm font-semibold text-[#111827] leading-snug mb-1 min-h-[2.5rem]">{p.name}</h3>
                            <p className="text-xs text-[#9ca3af] mb-2">Cód. {displayCode}</p>

                            {hasVars && (
                              groups.length > 1 ? (
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                  {groups.map(g => {
                                    const selId = (variationSel[p.id] || {})[g.id] || '';
                                    return (
                                      <div key={g.id} className="flex-1 min-w-[70px]">
                                        <span className="block text-[11px] font-bold uppercase tracking-wide text-[#f7941d] mb-1">{g.name}</span>
                                        <select value={selId} onChange={e => setVarOption(p.id, g.id, e.target.value)}
                                          className={`w-full p-1.5 border rounded-md bg-white text-xs text-[#111827] ${!selId ? 'border-[#f7941d]' : 'border-gray-200'}`}>
                                          {g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="mb-2 space-y-1.5">
                                  {groups.map(g => {
                                    const selId = (variationSel[p.id] || {})[g.id] || '';
                                    return (
                                      <div key={g.id}>
                                        <span className="block text-[11px] font-bold uppercase tracking-wide text-[#f7941d] mb-1">{g.name}</span>
                                        <select value={selId} onChange={e => setVarOption(p.id, g.id, e.target.value)}
                                          className={`w-full p-1.5 border rounded bg-white text-xs text-[#111827] ${!selId ? 'border-[#f7941d]' : 'border-gray-200'}`}>
                                          {g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                              )
                            )}

                            {missingCombo && (
                              <p className="mb-2 text-xs font-medium text-red-600">PRODUTO NÃO ENCONTRADO</p>
                            )}




                            {showPrice && !missingCombo && (
                              <div className="mb-3">
                               {showFrom && !hidePrices && <span className="text-[11px] text-[#6b7280] mr-1">a partir de</span>}
                               {hasPromoPrice && !hidePrices && (
                                 <span className="text-xs text-[#9ca3af] line-through mr-2">{renderPrice(originalWithDiscount)}</span>
                               )}
                               <span className={`text-lg font-bold ${hasPromo ? 'text-[#ef4444]' : 'text-[#111827]'}`}>{renderPrice(salePrice)}</span>
                                {!hidePrices && <span className="text-xs text-[#6b7280]"> / un</span>}
                                {hasPromo && !hidePrices && (
                                  <span className="ml-2 inline-block bg-[#374151] text-[#f7941d] text-[9px] font-bold px-1.5 py-0.5 rounded align-middle promo-badge-pulse">PROMOÇÃO</span>
                                )}
                              </div>
                            )}
                            {showPrice && !missingCombo && activePromo?.ruleType === 'tiered' && !!activePromo.tiers?.length && !hidePrices && (
                              <div className="-mt-2 mb-3 border border-orange-200 bg-orange-50 rounded px-2 py-1 space-y-0.5">
                                {[...activePromo.tiers].sort((a, b) => a.minQty - b.minQty).map((t, ti) => (
                                  <p key={ti} className="text-[11px] text-[#b45309] flex items-center justify-between gap-2">
                                    <span>a partir de {t.minQty} un</span>
                                    <strong>{renderPrice(resolveSalePrice(basePrice, activePromo, t.minQty, getEffectiveDiscount(p.discountPct), fixedPriceSel))}</strong>
                                  </p>
                                ))}
                              </div>
                            )}

                            {(() => {
                              const cartItem = items.find(i => i.productId === p.id && (i.variationKey || '') === (hasVars ? variationKey : ''));
                              const currentQty = snapToMultiple(parseQty(qty, effMinQty), effMinQty);
                              const needsUpdate = !!cartItem && cartItem.qty !== currentQty;
                              return (
                            <div className="mt-auto flex items-center gap-2">
                              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
                                <button onClick={() => { const nq = Math.max(effMinQty, snapToMultiple(parseQty(qty, effMinQty), effMinQty) - effMinQty); setProductQtys(prev => ({ ...prev, [p.id]: nq })); }}
                                  className="px-2.5 py-2 text-[#374151] hover:bg-gray-100">−</button>
                                <input type="number" value={qty} min={effMinQty} step={effMinQty}
                                  onChange={e => setProductQtys(prev => ({ ...prev, [p.id]: e.target.value.replace(/\D/g, '') }))}
                                  onBlur={() => setProductQtys(prev => ({ ...prev, [p.id]: snapToMultiple(parseQty(prev[p.id], effMinQty), effMinQty) }))}
                                  className="w-12 p-1 text-center text-[#111827] text-sm focus:outline-none" />
                                <button onClick={() => { const nq = snapToMultiple(parseQty(qty, effMinQty), effMinQty) + effMinQty; setProductQtys(prev => ({ ...prev, [p.id]: nq })); }}
                                  className="px-2.5 py-2 text-[#374151] hover:bg-gray-100">+</button>
                              </div>
                              <button onClick={() => {
                                  const q = snapToMultiple(parseQty(qty, effMinQty), effMinQty);
                                  setProductQtys(prev => ({ ...prev, [p.id]: q }));
                                  if (needsUpdate) { syncCartQtyByKey(p.id, hasVars ? variationKey : '', q); return; }
                                  addToOrder(p, q, ready);
                                }}
                                disabled={(inCart && !needsUpdate) || (hasVars && !allSelected) || missingCombo}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${needsUpdate ? 'bg-[#f7941d] text-white hover:bg-[#e0850f]' : inCart ? 'bg-green-100 text-green-700 cursor-not-allowed' : ((hasVars && !allSelected) || missingCombo) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#f7941d] text-white hover:bg-[#e0850f]'}`}>
                                {needsUpdate ? 'Atualizar carrinho' : inCart ? 'Adicionado' : 'Adicionar'}
                              </button>
                            </div>
                              );
                            })()}

                            <button onClick={() => setDetailsProduct(p)}
                              className="mt-3 pt-3 border-t border-gray-100 w-full flex items-center justify-center gap-1.5 text-xs text-[#6b7280] hover:text-[#f7941d] transition-colors">
                              <Info size={14} /> Ver detalhes
                            </button>
                          </div>
                        );
  };

  // Card compacto reutilizável (igual ao usado em Promoções/Mais Vendidos).
  // history=true aplica um leve aumento no histórico de compra.
  const SuggestionCard = (p: typeof products[0], badge?: boolean, history?: boolean, rank?: number) => {
    const { groups, chosen, allSelected, variationKey, ready } = resolveSelections(p);
    const hasVars = groups.length > 0;
    const cartItem = items.find(i => i.productId === p.id && (i.variationKey || '') === (hasVars ? variationKey : ''));
    const inCart = !!cartItem;
    const dp = displayPrice(p);
    const basePrice = dp.price;
    const selectedIds = hasVars ? chosen.filter(c => c.option).map(c => c.option!.id) : [];
    const usesCombos = (p.combinations || []).length > 0;
    const missingCombo = hasVars && allSelected && usesCombos && !findCombination(p, selectedIds);
    const displayCode = (hasVars && allSelected && !missingCombo) ? resolveSkuForSelection(p, selectedIds) : p.code;
    const firstCombo = usesCombos ? ((p.combinations || []).find(c => c.active !== false) || (p.combinations || [])[0]) : null;
    const promoComboId = (hasVars && allSelected)
      ? (findCombination(p, selectedIds)?.id ?? null)
      : (firstCombo?.id ?? null);
    const activePromo = findActivePromotion(p.id, promoComboId);
    const effMinQty = Math.max(1, hasVars ? resolveMinQtyForSelection(p, selectedIds) : (p.minQty || 1));
    const qtyRaw = productQtys[p.id] ?? effMinQty;
    const suggQty = Math.max(effMinQty, snapToMultiple(parseQty(qtyRaw, effMinQty), effMinQty));
    const promoPrice = applyPromotion(basePrice, activePromo, suggQty);
    const hasPromoPrice = !!activePromo && promoPrice < basePrice;
    const hasPromo = hasPromoPrice || productIsPromo(p);
    const fixedPriceSel = isFixedPrice(p, (hasVars && allSelected) ? findCombination(p, selectedIds) : firstCombo);
    const salePrice = resolveSalePrice(basePrice, activePromo, suggQty, getEffectiveDiscount(p.discountPct), fixedPriceSel);
    const originalWithDiscount = applyDiscount(basePrice, p.discountPct, fixedPriceSel);
    return (
      <div key={p.id} className="relative isolate overflow-hidden bg-white border border-gray-200 rounded-lg p-3 flex flex-col">
        {rank != null && (
          <span className={`absolute top-1 z-[6] w-7 h-7 rounded-full bg-[#374151] text-[#f7941d] text-xs font-extrabold flex items-center justify-center shadow ${hasPromo ? 'right-1' : 'left-1'}`}>
            {rank}º
          </span>
        )}
        {hasPromo && <PromoRibbon />}
        <div className={`w-full bg-gray-50 rounded border border-gray-100 flex items-center justify-center overflow-hidden mb-2 cursor-pointer ${history ? 'h-28' : 'h-24'}`} onClick={() => p.image && setZoomImage(p.image)}>
          {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package size={28} className="text-gray-300" />}
        </div>
        <p className="text-[10px] font-mono text-[#6b7280]">{displayCode}</p>
        <p className={`text-xs font-medium text-[#111827] line-clamp-2 ${history ? 'min-h-[36px]' : 'min-h-[32px]'}`}>{p.name}</p>
        {!missingCombo && (
          <p className="text-sm font-bold text-[#f7941d] mt-1">
            {dp.from && !hidePrices && <span className="text-[10px] font-normal text-[#6b7280] mr-1">a partir de</span>}
            {hasPromoPrice && !hidePrices && <span className="text-[10px] font-normal text-[#9ca3af] line-through mr-1">{renderPrice(originalWithDiscount)}</span>}
            <span className={hasPromo ? 'text-[#ef4444]' : ''}>{renderPrice(salePrice)}</span>
          </p>
        )}
        {activePromo?.ruleType === 'tiered' && !!activePromo.tiers?.length && !hidePrices && (
          <div className="mt-1 border border-orange-200 bg-orange-50 rounded px-1.5 py-1 space-y-0.5">
            {[...activePromo.tiers].sort((a, b) => a.minQty - b.minQty).map((t, ti) => (
              <p key={ti} className="text-[9px] text-[#b45309] flex items-center justify-between gap-1">
                <span>a partir de {t.minQty} un</span>
                <strong>{renderPrice(resolveSalePrice(basePrice, activePromo, t.minQty, getEffectiveDiscount(p.discountPct), fixedPriceSel))}</strong>
              </p>
            ))}
          </div>
        )}
        {hasVars && !inCart && (
          groups.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {groups.map(g => {
                const selId = (variationSel[p.id] || {})[g.id] || '';
                return (
                  <div key={g.id} className="flex-1 min-w-[64px]">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-[#f7941d] mb-1">{g.name}</span>
                    <select value={selId} onChange={e => setVarOption(p.id, g.id, e.target.value)}
                      className={`w-full p-1.5 border rounded-md bg-white text-xs text-[#111827] ${!selId ? 'border-[#f7941d]' : 'border-gray-200'}`}>
                      {g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="mt-2 space-y-1.5">
            {groups.map(g => {
              const selId = (variationSel[p.id] || {})[g.id] || '';
              return (
                <div key={g.id}>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-[#f7941d] mb-1">{g.name}</span>
                  <select value={selId} onChange={e => setVarOption(p.id, g.id, e.target.value)}
                    className={`w-full p-1.5 border rounded bg-white text-xs text-[#111827] ${!selId ? 'border-[#f7941d]' : 'border-gray-200'}`}>
                    {g.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          )
        )}
        {missingCombo && !inCart && (
          <p className="mt-2 text-[10px] font-medium text-red-600">PRODUTO NÃO ENCONTRADO</p>
        )}
        {inCart && (
          <span className="mt-2 inline-flex items-center gap-1 w-fit bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
            <Check size={11} /> Adicionado
          </span>
        )}
        {(() => {
          const needsUpdate = !!cartItem && cartItem.qty !== suggQty;
          return (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
                <button onClick={() => setProductQtys(prev => ({ ...prev, [p.id]: Math.max(effMinQty, suggQty - effMinQty) }))}
                  className="px-2 py-1.5 text-[#374151] hover:bg-gray-100">−</button>
                <input type="number" value={qtyRaw} min={effMinQty} step={effMinQty}
                  onChange={e => setProductQtys(prev => ({ ...prev, [p.id]: e.target.value.replace(/\D/g, '') }))}
                  onBlur={() => setProductQtys(prev => ({ ...prev, [p.id]: snapToMultiple(parseQty(prev[p.id], effMinQty), effMinQty) }))}
                  className="w-10 p-1 text-center text-[#111827] text-xs focus:outline-none" />
                <button onClick={() => setProductQtys(prev => ({ ...prev, [p.id]: suggQty + effMinQty }))}
                  className="px-2 py-1.5 text-[#374151] hover:bg-gray-100">+</button>
              </div>
              <button
                onClick={() => {
                  setProductQtys(prev => ({ ...prev, [p.id]: suggQty }));
                  if (needsUpdate) { syncCartQtyByKey(p.id, hasVars ? variationKey : '', suggQty); return; }
                  if (!inCart) addToOrder(p, suggQty, ready);
                }}
                disabled={(inCart && !needsUpdate) || (hasVars && !allSelected) || missingCombo}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${needsUpdate ? 'bg-[#f7941d] text-white hover:bg-[#e0850f]' : inCart ? 'bg-green-100 text-green-700 cursor-not-allowed' : ((hasVars && !allSelected) || missingCombo) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#f7941d] text-white hover:bg-[#e0850f]'}`}>
                {needsUpdate ? 'Atualizar' : inCart ? 'Adicionado' : 'Adicionar'}
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  // Salvar carrinho: NÃO gera pedido/orçamento. Apenas guarda os itens
  // localmente (por cliente + empresa) para o cliente continuar montando a
  // compra ao longo do mês e finalizar quando quiser.
  const saveCart = () => {
    if (items.length === 0 || !selectedBrand) {
      toast({ title: 'Nada para salvar', description: 'Adicione itens antes de salvar.', variant: 'destructive' });
      return;
    }
    const orderItems = normalizedItems();
    setItems(orderItems);
    try {
      writeSavedCart(cartKey(selectedBrand), {
        items: orderItems, orderType, observations, purchaseOrder, invoiceNote, buyer, paymentMethod, paymentTerm,
      });
    } catch { reportCartError(); return; }
    activityService.track('carrinho_salvo', {
      brand: selectedBrand,
      detail: `${orderItems.length} itens`,
      meta: {
        itens: orderItems.length,
        total: orderItems.reduce((t, i) => t + (i.totalPrice || 0), 0),
        items: orderItems.map(item => ({ name: item.name, code: item.code, qty: item.qty })),
      },
    });
    toast({ title: 'Carrinho salvo!', description: 'Seus itens ficam guardados no carrinho. Nenhum pedido foi gerado.' });
  };
  const saveDraft = saveCart;


  // Converte um orçamento em pedido mantendo os itens. Se for um orçamento já
  // salvo (em edição), persiste a mudança de tipo no banco (cliente e admin).
  const switchToPedido = () => {
    if (!selectedBrand) return;
    setOrderType('pedido');
    if (editingOrderId) {
      updateOrder(editingOrderId, { type: 'pedido' });
      toast({ title: 'Convertido em pedido', description: 'O orçamento foi alterado para pedido.' });
    }
    navigate(`/painel/${brandSlug(selectedBrand)}/pedido`);
  };

  // Aumenta/diminui a quantidade de um item já no carrinho, respeitando o múltiplo (item 6/14).
  const bumpCartQty = (productId: string, dir: 1 | -1, variationKey?: string) => {
    setItems(prev => prev.map(it => {
      if (it.productId !== productId || (it.variationKey || '') !== (variationKey || '')) return it;
      const step = it.minQty || 1;
      const q = snapToMultiple(it.qty + dir * step, step);
      const total = it.unitPrice * q;
      return { ...it, qty: q, totalPrice: total, subtotal: total, subtotalAfterExtra: total, totalWithTax: total };
    }));
  };



  const showOrderFlow = activeTab === 'order' && orderType && selectedBrand;

  // Config de pagamento por marca
  const payConfig = useMemo(() => selectedBrand ? brandPaymentService.get(selectedBrand) : undefined, [selectedBrand]);
  const availableMethods = payConfig?.methods ?? ['Boleto', 'A Vista'];
  const freightOptions = payConfig?.freightOptions ?? [];
  const availableTerms = useMemo(
    () => (payConfig?.terms || []).filter(t => !t.method || t.method === payMethod),
    [payConfig, payMethod],
  );

  // Ajusta meio/prazo automaticamente quando muda a marca/config
  useEffect(() => {
    if (!payConfig) return;
    if (!availableMethods.includes(payMethod)) setPayMethod(availableMethods[0]);
  }, [payConfig]);
  useEffect(() => {
    if (availableTerms.length === 0) { setPaymentTerm(''); return; }
    if (!availableTerms.find(t => t.label === paymentTerm)) {
      setPaymentTerm(availableTerms[0].label);
    }
  }, [availableTerms]);
  // Frete escolhido (CIF/FOB) quando há mais de uma opção habilitada.
  useEffect(() => {
    if (freightOptions.length === 0) { setFreightType(''); return; }
    if (!freightOptions.find(o => o.type === freightType)) setFreightType(freightOptions[0].type);
  }, [payConfig]);

  const subtotalRaw = items.reduce((s, i) => s + i.totalPrice, 0);
  const aVistaDiscount = selectedBrand ? brandPaymentService.computeDiscount(selectedBrand, payMethod, subtotalRaw) : 0;
  const freightValue = selectedBrand ? brandPaymentService.computeFreight(selectedBrand, subtotalRaw, freightType || undefined) : 0;
  const finalTotal = subtotalRaw - aVistaDiscount + freightValue;
  const paymentValidationError = useMemo(
    () => (selectedBrand && paymentTerm) ? brandPaymentService.validate(selectedBrand, payMethod, paymentTerm, subtotalRaw) : null,
    [selectedBrand, payMethod, paymentTerm, subtotalRaw],
  );

  const getRowsSubtotal = (rows = items) => rows.reduce((s, i) => s + i.totalPrice, 0);
  const getEffectiveTotalForRows = (type: OrderType, rows = items) => {
    const subtotal = getRowsSubtotal(rows);
    if (type !== 'pedido') return subtotal;
    const discount = selectedBrand ? brandPaymentService.computeDiscount(selectedBrand, payMethod, subtotal) : 0;
    const freight = hidePayment ? 0 : (selectedBrand ? brandPaymentService.computeFreight(selectedBrand, subtotal, freightType || undefined) : 0);
    return subtotal - discount + freight;
  };
  const getSubmissionError = (type: OrderType, rows = items): string | null => {
    const subtotal = getRowsSubtotal(rows);
    const minOrder = payConfig?.minOrderValue || 0;
    if (!isLead && minOrder > 0 && subtotal < minOrder) {
      return `Valor mínimo para ${selectedBrand}: ${formatBRL(minOrder)}.`;
    }

    if (type === 'pedido' && !hidePayment && selectedBrand && paymentTerm) {
      const paymentError = brandPaymentService.validate(selectedBrand, payMethod, paymentTerm, subtotal);
      if (paymentError) return paymentError;
    }
    if (!isLead) {
      const effectiveTotal = getEffectiveTotalForRows(type, rows);
      if (effectiveTotal > availableCredit) {
        return `Total fora do crédito disponível. Crédito disponível: ${formatBRL(Math.max(0, availableCredit))}.`;
      }
    }
    return null;
  };


  const scrollSubcats = (dir: 'left' | 'right') => {
    if (subcatScrollRef.current) {
      subcatScrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  // Ao ir para o carrinho, passa antes pela tela de sugestões (uma vez).
  const goToCart = () => {
    if (!visitedSuggestions && items.length > 0) { setOrderStep('suggestions'); return; }
    setOrderStep('cart');
  };

  // Marca sugestões como visitadas ao entrar na aba
  useEffect(() => {
    if (orderStep === 'suggestions') setVisitedSuggestions(true);
  }, [orderStep]);

  const isLanding = activeTab === 'order' && !selectedBrand;

  const lastOrder = clientOrders[0];
  const refazerUltimoPedido = () => {
    if (!lastOrder) {
      toast({ title: 'Nenhum pedido anterior', description: 'Você ainda não tem pedidos para refazer.' });
      return;
    }
    setOrderType(lastOrder.type);
    setSelectedBrand(lastOrder.brand);
    setItems(withProductImages(lastOrder.items));
    setEditingOrderId(null);
    setIsFreshDraft(true);
    setOrderStep('cart');
    setVisitedSuggestions(true);
    navigate(`/painel/${brandSlug(lastOrder.brand)}/${lastOrder.type === 'pedido' ? 'pedido' : 'orcamento'}`);
    toast({ title: 'Itens do último pedido carregados', description: `Refazendo pedido de ${new Date(lastOrder.createdAt).toLocaleDateString('pt-BR')}.` });
  };

  const openHelp = () => {
    const text = `Olá! Preciso de ajuda com a área do cliente.\n\nRazão Social: ${user?.companyName || ''}\nCNPJ: ${user?.cnpj || ''}`;
    window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const tabelaAtiva = user?.network || user?.classification || 'PADRÃO';
  const lastOrderDate = lastOrder ? new Date(lastOrder.createdAt).toLocaleDateString('pt-BR') : '—';

  const BRAND_INFO: Record<string, { desc: string; logoText: string; logoColor: string }> = {
    'Cortag': { desc: 'Ferramentas e cortadores profissionais para construção e acabamento.', logoText: 'Cortag', logoColor: '#c8102e' },
    'Claw Motobombas': { desc: 'Motobombas e soluções hidráulicas com alta performance e durabilidade.', logoText: 'CLAW', logoColor: '#1f3a5f' },
    'Ilumi': { desc: 'Materiais elétricos para instalações residenciais, comerciais e industriais.', logoText: 'Ilumi', logoColor: '#5a6470' },
    'Plaspol': { desc: 'Soluções em tubos e conexões para instalações hidráulicas, irrigação e geo.', logoText: 'Plaspol', logoColor: '#2c7fb8' },
  };

  const scrollToBrands = () => {
    document.getElementById('brand-picker-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="app-light client-order min-h-screen bg-background text-foreground" translate="no" lang="pt-BR">
      {/* Unified fixed header — logo + company info in top row, action buttons below */}
      <header ref={headerRef} className="sticky top-0 z-30 bg-[#f9fafb] border-b border-gray-200 shadow-sm">
        <div className="w-full px-4 py-3">
          <div className="bg-secondary border border-border rounded-lg shadow-sm p-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 items-stretch">
              {/* Left column: logo + novo pedido button */}
              <div className="flex flex-col justify-between gap-3">
                <img src="/logo-light.png" alt="Moura" className="h-14 w-auto shrink-0 object-contain" />
                <button
                  onClick={() => { if (isLanding) { scrollToBrands(); } else { navigate('/painel'); resetFlow(); } }}
                  className="inline-flex items-center gap-2 bg-[#f7941d] hover:bg-[#e0851a] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
                >
                  <ShoppingCart size={16} /> {isLead ? '+ Novo Carrinho' : `+ Novo Pedido / ${quoteLabel}`}
                </button>
              </div>

              {/* Right column: company info centered, action buttons at bottom */}
              <div className="flex flex-col justify-between min-w-0 gap-3">
                {/* Company info — distribute fields evenly, last field aligned to Sair button */}
                <div className="flex-1 flex items-center">
                  <div className="flex flex-wrap lg:flex-nowrap lg:justify-between gap-x-8 gap-y-2 text-sm min-w-0 w-full">
                    {[
                      { label: 'Razão Social:', value: user?.companyName, strong: true },
                      { label: 'CNPJ:', value: formatCNPJ(user?.cnpj || ''), strong: false },
                      { label: 'E-mail:', value: user?.email || SITE.email, strong: false },
                      { label: 'Endereço:', value: user?.address || '—', strong: false },
                    ].map((f) => (
                      <div key={f.label} className="min-w-0 text-left">
                        <div className="text-[#6b7280] text-xs mb-0.5">{f.label}</div>
                        <div className={`truncate text-[#111827] ${f.strong ? 'font-semibold uppercase' : ''}`} title={String(f.value || '')}>{f.value || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>



                {/* Action buttons — bottom of the right column */}
                <div className="flex items-end justify-between gap-3 min-w-0 w-full">
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`inline-flex items-center gap-2 border text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0 ${activeTab === 'history' ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white border-gray-300 hover:border-[#f7941d] hover:text-[#f7941d] text-[#374151]'}`}
                  >
                    <ClipboardList size={16} /> {cartWording ? 'Meus Pedidos / Carrinho' : 'Meus Orçamentos'} ({clientOrders.length + savedCarts.reduce((t, c) => t + c.count, 0)})
                  </button>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {user?.name && (
                      <div
                        className="inline-flex items-center gap-2 border border-gray-300 text-[#374151] bg-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm max-w-[220px]"
                        title={`Responsável: ${user.name}`}
                      >
                        <UserIcon size={16} className="shrink-0 text-[#f7941d]" /> <span className="truncate">{user.name}</span>
                      </div>
                    )}
                    {/* Trocar Empresa — ao lado do nome do usuário (cabeçalho) */}
                    {selectedBrand && (
                      <button
                        onClick={() => { navigate('/painel'); resetFlow(); }}
                        className="inline-flex items-center gap-2 border border-gray-300 text-[#374151] hover:border-[#f7941d] hover:text-[#f7941d] bg-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
                        title="Trocar Empresa"
                      >
                        <Building2 size={16} /> <span className="hidden sm:inline">Trocar Empresa</span>
                      </button>
                    )}
                    <button
                      onClick={logout}
                      className="inline-flex items-center gap-2 border border-gray-300 text-[#374151] hover:border-[#f7941d] hover:text-[#f7941d] bg-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
                      title="Sair"
                    >
                      <LogOut size={16} /> Sair
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Image zoom modal */}
      {zoomImage && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setZoomImage(null)}>
          <div className="bg-white rounded-lg p-2 max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <img src={zoomImage} alt="Produto" className="w-full h-auto object-contain" />
            <button onClick={() => setZoomImage(null)} className="mt-2 w-full text-center text-sm text-[#6b7280] hover:text-[#111827]">Fechar</button>
          </div>
        </div>
      )}

      {/* Product details modal — "Ver detalhes" */}
      {detailsProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDetailsProduct(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#111827] pr-4">{detailsProduct.name}</h3>
              <button onClick={() => setDetailsProduct(null)} className="text-[#9ca3af] hover:text-[#111827] shrink-0"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="h-44 flex items-center justify-center bg-gray-50 rounded-xl">
                {detailsProduct.image ? <img src={detailsProduct.image} alt={detailsProduct.name} className="max-h-44 max-w-full object-contain" /> : <Package size={56} className="text-gray-300" />}
              </div>
              {detailsProduct.description?.trim() ? (
                <p className="text-sm text-[#374151] whitespace-pre-line break-words">{detailsProduct.description}</p>
              ) : (
                <p className="text-sm text-[#9ca3af] italic">Sem descrição cadastrada para este produto.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Brand access request modal (item 27) */}
      {brandAccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setBrandAccessModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-[#f7941d]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#111827]">Acesso restrito</h3>
                <p className="text-sm text-[#6b7280] mt-1">Você ainda não possui acesso à empresa <strong>{brandAccessModal}</strong>.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setBrandAccessModal(null)}>Cancelar</Button>
              <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" onClick={() => requestBrandAccess(brandAccessModal)}>
                <MessageCircle size={14} className="mr-1" /> Solicitar acesso a esta empresa
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tela de sucesso do checkout (item 5) */}
      {submittedSuccess && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={48} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#111827] mb-2">
              {submittedSuccess.type === 'pedido' ? 'Pedido enviado com sucesso!' : 'Orçamento enviado com sucesso!'}
            </h2>
            <p className="text-sm text-[#6b7280] mb-1">
              Empresa: <strong className="text-[#111827]">{submittedSuccess.brand}</strong>
            </p>
            <p className="text-sm text-[#6b7280] mb-6">
              Número: <strong className="font-mono text-[#f7941d]">{submittedSuccess.id.slice(0, 8).toUpperCase()}</strong>
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-6 text-xs text-[#374151]">
              Sua solicitação foi recebida e está em <strong>análise</strong>. Acompanhe pela aba "Meus Pedidos".
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={downloadSuccessPdf} variant="outline" className="flex-1" size="lg">
                <Download size={16} className="mr-2" /> Baixar PDF
              </Button>
              <Button onClick={finishSuccess} variant="cta" className="flex-1" size="lg">
                <CheckCircle2 size={16} className="mr-2" /> Concluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ LANDING (igual ao print) ============ */}
      {isLanding && (
        <div className="w-full px-4 py-6">
          <div className="text-center mt-8 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-[#111827]">
              Olá, <span className="text-[#f7941d]">{(user?.name || user?.companyName || '').split(' ')[0] || 'Cliente'}</span>. Seja bem-vindo
            </h1>
            <p className="text-sm text-[#f7941d] mt-1">Você pode fazer o seu Pedido, ou criar um orçamento.</p>
          </div>

          {/* Selecione a empresa */}
          <div id="brand-picker-section">
            <h2 className="text-sm font-bold text-[#111827] mb-3">Selecione a empresa</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                const adminCompanies = categoryService.getCompanies();
                const seen = new Set<string>();
                // Ordem definida no painel admin (drag and drop / sort_order) tem
                // prioridade; marcas fixas não cadastradas entram em seguida.
                const allCompanies = [
                  ...adminCompanies.map(c => ({ name: c })),
                  ...BRANDS.filter(b => !adminCompanies.some(c => c.toLowerCase() === b.name.toLowerCase())).map(b => ({ name: b.name })),
                ].filter(b => { const k = b.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                return allCompanies.map(b => {
                  // Acesso é SEMPRE explícito: sem empresa liberada = sem acesso
                  // (nunca liberar tudo por padrão quando a lista está vazia).
                  const allowed = user?.allowedBrands || [];
                  const hasAccess = allowed.includes(b.name);
                  const info = BRAND_INFO[b.name] || { desc: '', logoText: b.name, logoColor: '#374151' };
                  const customLogo = categoryService.getCompanyMeta(b.name).logoUrl || brandRulesService.get(b.name).logoUrl;
                  const logoSrc = customLogo || DEFAULT_BRAND_LOGOS[b.name];
                  return (
                    <div
                      key={b.name}
                      className={`relative bg-white border rounded-2xl p-5 shadow-sm transition-all flex flex-col ${hasAccess ? 'border-gray-200 hover:shadow-md hover:-translate-y-0.5' : 'border-gray-200 opacity-90 hover:shadow-sm'}`}
                    >
                      <span className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-1 rounded ${hasAccess ? 'bg-[#f7941d] text-white' : 'bg-gray-100 text-[#6b7280] border border-gray-200'}`}>
                        {hasAccess ? 'Disponível' : 'Acesso sob liberação'}
                      </span>
                      <div className={`h-24 rounded-lg flex items-center justify-center mb-4 ${hasAccess ? 'bg-white' : 'bg-gray-50/70'}`}>
                        {logoSrc ? (
                          <img
                            src={logoSrc}
                            alt={b.name}
                            loading="eager"
                            fetchPriority="high"
                            decoding="async"
                            className={`max-h-20 max-w-[80%] object-contain ${hasAccess ? '' : 'grayscale opacity-60'}`}
                          />
                        ) : (
                          <span
                            className="text-3xl font-extrabold tracking-tight"
                            style={{ color: hasAccess ? info.logoColor : '#9ca3af', fontFamily: 'Poppins, Inter, sans-serif' }}
                          >
                            {info.logoText}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[#111827] mb-1">{b.name}</h3>
                      <p className="text-xs text-[#6b7280] leading-relaxed mb-4 flex-1">{info.desc}</p>
                      {hasAccess ? (
                        <button
                          onClick={() => navigate(`/painel/${brandSlug(b.name)}`)}
                          className="w-full inline-flex items-center justify-center gap-2 border border-[#f7941d] text-[#f7941d] hover:bg-[#f7941d] hover:text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                        >
                          <ArrowRight size={16} /> Acessar
                        </button>
                      ) : (
                        <button
                          onClick={() => setBrandAccessModal(b.name)}
                          className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 text-[#374151] hover:bg-gray-50 font-medium py-2.5 rounded-lg transition-colors text-sm"
                        >
                          <Lock size={14} /> Solicitar acesso
                        </button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Lançamentos */}
          <a
            href="/promocoes"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex items-center gap-4 hover:border-[#f7941d] hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 group-hover:bg-orange-100 transition-colors">
              <Sparkles size={22} className="text-[#f7941d]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#f7941d]">Lançamentos</div>
              <div className="text-sm text-[#6b7280]">Confira aqui os últimos lançamentos.</div>
            </div>
            <span className="text-[#f7941d] text-xl opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </a>

          {/* Footer ações */}
          <div className="mt-8 flex flex-wrap justify-center items-center gap-x-10 gap-y-4 pt-6 border-t border-gray-200">
            <button onClick={openHelp} className="flex items-center gap-2 text-[#111827] hover:text-[#f7941d] transition-colors">
              <Headphones size={20} />
              <span className="text-sm font-semibold">Precisa de Ajuda?</span>
            </button>
            <button onClick={() => window.open('/catalogos', '_blank')} className="flex items-center gap-2 text-[#111827] hover:text-[#f7941d] transition-colors">
              <BookOpen size={20} />
              <span className="text-sm font-semibold">Catálogos</span>
            </button>
            <button onClick={() => setPoliticaModal(true)} className="flex items-center gap-2 text-[#111827] hover:text-[#f7941d] transition-colors">
              <FileText size={20} />
              <span className="text-sm font-semibold">Política Comercial de Vendas</span>
            </button>
            <button onClick={() => setInformativoModal(true)} className="flex items-center gap-2 text-[#111827] hover:text-[#f7941d] transition-colors">
              <Megaphone size={20} />
              <span className="text-sm font-semibold">Informativo</span>
            </button>
          </div>
        </div>
      )}

      {/* ============ Pré-fluxo: escolha do tipo (PEDIDO / ORÇAMENTO) após selecionar empresa ============ */}
      {activeTab === 'order' && selectedBrand && !orderType && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => navigate('/painel')}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-[#111827]">
                {isLead
                  ? <>Solicitar Orçamento <span className="text-[#f7941d]">{selectedBrand}</span></>
                  : <>Como deseja iniciar com <span className="text-[#f7941d]">{selectedBrand}</span>?</>}
              </h2>
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              {!isLead && (
                <button
                  onClick={() => navigate(`/painel/${brandSlug(selectedBrand)}/pedido`)}
                  className="relative bg-white border-2 rounded-xl p-6 text-center w-56 group transition-colors border-gray-200 hover:border-[#f7941d]"
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors bg-orange-50 group-hover:bg-[#f7941d] group-hover:text-white text-[#f7941d]">
                    {cartWording ? <FileText size={28} /> : <ShoppingCart size={28} />}
                  </div>
                  <span className="font-bold text-lg text-[#111827] block">PEDIDO</span>
                </button>
              )}
              <button onClick={() => navigate(`/painel/${brandSlug(selectedBrand)}/orcamento`)} className="bg-white border-2 border-gray-200 hover:border-[#f7941d] rounded-xl p-6 text-center transition-colors w-56 group">
                <div className="w-14 h-14 rounded-full bg-orange-50 group-hover:bg-[#f7941d] group-hover:text-white text-[#f7941d] flex items-center justify-center mx-auto mb-3 transition-colors">
                  {cartWording ? <ShoppingCart size={28} /> : <FileText size={28} />}
                </div>
                <span className="font-bold text-lg text-[#111827] block">{cartWording ? 'CARRINHO' : 'ORÇAMENTO'}</span>
              </button>
            </div>
            <div className="flex justify-center mt-6">
              <Button onClick={() => navigate('/painel')} variant="outline" size="sm" className="gap-2">
                <ArrowLeft size={16} /> Voltar para empresas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico de pedidos */}
      {activeTab === 'history' && (
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-[#111827]">{isLead ? 'Orçamentos' : (historyType === 'pedido' ? 'Pedidos' : (cartWording ? 'Meu Carrinho' : 'Orçamentos'))}</h2>
            <Button onClick={() => navigate('/painel')} variant="outline" size="sm" className="gap-2 shrink-0">
              <ArrowLeft size={16} /> Voltar
            </Button>
          </div>
          <div className="flex gap-2 mb-4">
            {!isLead && (
              <button onClick={() => setHistoryType('pedido')} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${historyType === 'pedido' ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-200 hover:border-[#f7941d]'}`}>
                Pedidos ({clientOrders.filter(o => o.type === 'pedido').length})
              </button>
            )}
            <button onClick={() => setHistoryType('orcamento')} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${historyType === 'orcamento' ? 'bg-[#f7941d] text-white border-[#f7941d]' : 'bg-white text-[#374151] border-gray-200 hover:border-[#f7941d]'}`}>
              {cartWording ? 'Carrinho' : 'Orçamentos'} ({clientOrders.filter(o => o.type === 'orcamento').length + savedCarts.reduce((total, cart) => total + cart.count, 0)})
            </button>
          </div>
          {(isLead || historyType === 'orcamento') && savedCarts.length > 0 && (
            <div className="mb-5">
              <h3 className="text-base font-bold mb-3 text-[#111827] flex items-center gap-2"><ShoppingCart size={18} className="text-[#f7941d]" /> Carrinho em andamento</h3>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-[#f3f4f6]"><tr>{['Empresa', 'Atualizado em', 'Itens', 'Total', 'Ações'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
                  <tbody>
                    {savedCarts.map(c => (
                      <tr key={c.brand} className="border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb]">
                        <td className="p-2 font-semibold">{c.brand}</td>
                        <td className="p-2">{c.savedAt ? new Date(c.savedAt).toLocaleString('pt-BR') : '—'}</td>
                        <td className="p-2">{c.count}</td>
                        <td className="p-2 font-semibold">{(isLead || panicService.isBlocked(c.brand)) ? <span className="text-[#9ca3af] italic">—</span> : formatBRL(c.total)}</td>
                        <td className="p-2">
                          <Button size="sm" variant="cta" onClick={() => navigate(`/painel/${brandSlug(c.brand)}/${isLead ? 'orcamento' : 'pedido'}`)}>
                            <ShoppingCart size={14} className="mr-1" /> Abrir carrinho
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {historyOrders.length === 0 ? (
            !((isLead || historyType === 'orcamento') && savedCarts.length > 0) && (
              <p className="text-sm text-[#6b7280] py-8 text-center">Nenhum {historyType === 'pedido' ? 'pedido' : (cartWording ? 'carrinho' : 'orçamento')} encontrado.</p>
            )
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-[#f3f4f6]"><tr>{['Nº Pedido', 'Tipo', 'Empresa', 'Data', 'Itens', 'Total', 'Status', 'Ações'].map(h => <th key={h} className="p-2 text-left font-medium text-[#374151]">{h}</th>)}</tr></thead>
                <tbody>
                  {historyOrders.map(o => (
                    <tr key={o.id} className="border-t border-gray-200 text-[#111827] hover:bg-[#f9fafb]">
                      <td className="p-2 font-mono">{orderNumber(o)}</td>
                      <td className="p-2 uppercase text-[10px] font-semibold">{o.type === 'orcamento' && cartWording ? 'MEU CARRINHO' : o.type}</td>
                      <td className="p-2">{o.brand}</td>
                      <td className="p-2">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="p-2">{o.items.length}</td>
                      <td className="p-2 font-semibold">{(isLead || panicService.isBlocked(o.brand)) ? <span className="text-[#9ca3af] italic">—</span> : formatBRL(o.totalWithTax)}</td>
                      <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[o.status] || 'bg-gray-100 text-gray-800'}`}>{o.status}</span></td>
                      <td className="p-2">
                        <div className="flex gap-1 items-center">
                          {!panicService.isBlocked(o.brand) && (
                            <button onClick={() => downloadOrderPdf(o)} title="Baixar PDF"
                              className="p-1.5 rounded text-[#374151] hover:bg-[#f7941d] hover:text-white transition-colors">
                              <Download size={14} />
                            </button>
                          )}
                          {o.status === 'Rascunho' && (
                            <button onClick={() => editOrder(o)} title="Editar rascunho"
                              className="p-1.5 rounded text-[#374151] hover:bg-[#f7941d] hover:text-white transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                          {cartWording && o.type === 'pedido' && (
                            <button onClick={() => reuseOrder(o, 'pedido')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-[11px] font-medium text-[#374151] hover:bg-[#f7941d] hover:text-white hover:border-[#f7941d] transition-colors">
                              <RefreshCw size={12} /> Repetir Pedido
                            </button>
                          )}
                          {cartWording && o.type === 'orcamento' && (
                            <button onClick={() => reuseOrder(o, 'orcamento')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-[11px] font-medium text-[#374151] hover:bg-[#f7941d] hover:text-white hover:border-[#f7941d] transition-colors">
                              <ShoppingCart size={12} /> Voltar ao Carrinho
                            </button>
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
      )}

      {/* Fluxo de pedido com etapas */}
      {showOrderFlow && (
        <div className="w-full px-4 py-2">
          {true && (
            <>
              {/* Conversão de orçamento em pedido removida daqui (item 3) */}


              {/* Step navigation bar */}
              <div className="sticky z-30 flex items-center gap-2 mb-1.5 bg-secondary border-b border-border py-2" style={{ top: headerH }}>
                <div className="bg-secondary rounded-md p-1 flex items-center gap-0 overflow-x-auto flex-1 min-w-0">
                  {STEPS.map((step, idx) => {
                    const isActive = orderStep === step.key;
                    const stepIdx = STEPS.findIndex(s => s.key === orderStep);
                    const isPast = idx < stepIdx;
                    const Icon = step.Icon;
                    return (
                      <Button variant="ghost" key={step.key} onClick={() => {
                        if (step.key === 'cart' && items.length === 0) return;
                        if (step.key === 'payment' && items.length === 0) return;
                        if (step.key === 'finalize' && items.length === 0) return;
                        setOrderStep(step.key);
                      }}
                        className={`flex items-center gap-1.5 px-4 py-2 h-11 text-base font-semibold whitespace-nowrap rounded-md ${isActive ? 'bg-card text-foreground shadow-sm' : isPast ? 'text-primary' : 'text-muted-foreground'}`}>
                        <Icon size={16} />
                        {step.label}
                        {step.key === 'cart' && items.length > 0 && <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">{items.length}</span>}
                      </Button>
                    );
                  })}
                </div>

                {/* Botão Salvar carrinho — ao lado do carrinho */}
                <Button variant="secondary"
                  onClick={saveDraft}
                  disabled={items.length === 0}
                  className="shrink-0 border border-border text-foreground hover:text-primary h-11"
                  title="Salvar carrinho (não gera pedido)"
                >
                  <Save size={18} /> <span className="hidden sm:inline">Salvar</span>
                </Button>

                {/* ===== Carrinho suspenso (botão + pop-up + painel) ===== */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => { setFloatingCartOpen(o => !o); setAddedToast(null); }}
                    className="relative flex items-center gap-2 bg-[#f7941d] hover:bg-[#e0850f] text-white px-4 py-2.5 rounded-lg font-semibold shadow-sm transition-colors"
                    title="Carrinho">
                    <ShoppingCart size={18} />
                    <span className="hidden sm:inline">Carrinho</span>
                    {items.length > 0 && (
                      <span className="absolute -top-2 -right-2 bg-white text-[#f7941d] border border-[#f7941d] text-[11px] font-bold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center">{items.length}</span>
                    )}
                  </button>

                  {/* Pop-up "Produto adicionado" */}
                  {addedToast && !floatingCartOpen && (
                    <button
                      onClick={() => { setFloatingCartOpen(true); setAddedToast(null); }}
                      className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-green-200 rounded-xl shadow-xl p-3 flex items-center gap-3 text-left animate-in fade-in slide-in-from-top-2">
                      <div className="w-10 h-10 bg-gray-50 rounded border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                        {addedToast.image ? <img src={addedToast.image} alt="" className="w-full h-full object-contain" /> : <Package size={18} className="text-gray-300" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-green-600 flex items-center gap-1"><Check size={13} /> Produto adicionado</p>
                        <p className="text-xs text-[#374151] truncate">{addedToast.name}</p>
                        <p className="text-[11px] text-[#f7941d] font-semibold mt-0.5">Ver carrinho →</p>
                      </div>
                    </button>
                  )}

                  {/* Painel do carrinho suspenso */}
                  {floatingCartOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFloatingCartOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 z-50 w-[360px] max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col max-h-[70vh]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                          <h3 className="font-bold text-[#111827] flex items-center gap-2"><ShoppingCart size={18} /> Carrinho ({items.length})</h3>
                          <button onClick={() => setFloatingCartOpen(false)} className="p-1 text-[#9ca3af] hover:text-[#111827] rounded"><X size={18} /></button>
                        </div>
                        {items.length === 0 ? (
                          <div className="p-8 text-center text-sm text-[#6b7280]">Nenhum item no carrinho.</div>
                        ) : (
                          <>
                            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                              {items.map((item, idx) => (
                                <div key={`${item.productId}-${item.variationKey || idx}`} className="flex items-center gap-3 p-3">
                                  <div className="w-12 h-12 bg-gray-50 rounded border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                    {item.image ? <img src={item.image} alt="" className="w-full h-full object-contain" /> : <Package size={18} className="text-gray-300" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-[#111827] truncate">{item.selections?.length ? item.name.split(' - ')[0] : item.name}</p>
                                    {itemHasPromoFlag(item, products.find(p => p.id === item.productId)) && <span className="inline-block mt-0.5 text-[9px] font-bold bg-[#374151] text-[#f7941d] rounded px-1.5 py-0.5 promo-badge-pulse">PROMOÇÃO</span>}
                                    <p className="text-[11px] text-[#6b7280]">{item.qty} un · {renderPrice(item.totalPrice)}</p>
                                  </div>
                                  <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0" title="Excluir"><Trash2 size={15} /></button>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-gray-200 p-3">
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-semibold text-[#111827]">Total:</span>
                                <span className="text-lg font-bold text-[#f7941d]">{renderPrice(totals.total)}</span>
                              </div>
                              <Button onClick={() => { setOrderStep('cart'); setFloatingCartOpen(false); }} variant="cta" className="w-full">
                                Ver Carrinho Completo <ArrowRight size={16} className="ml-1" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>


              {/* ============ STEP: ADD ITEMS ============ */}
              {orderStep === 'add-items' && (
                <div className="flex flex-col" style={{ minHeight: '420px' }}>
                  {/* ===== Área fixa: busca ===== */}
                  <div className="shrink-0 sticky z-20 bg-[#f9fafb] pt-1 pb-1 -mx-4 px-4" style={{ top: headerH + 68 }}>

                  {/* Search — reposicionado para o topo, com bom aproveitamento da tela */}
                  <div className="relative mb-1.5">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por código, nome, modelo ou aplicação..."
                      className="w-full pl-11 pr-4 py-2 border border-gray-200 rounded-xl bg-white text-[#111827] shadow-sm focus:ring-2 focus:ring-[#f7941d] focus:outline-none" />
                  </div>
                  </div>

                  {/* ===== Grupos na LATERAL ESQUERDA (vertical) + produtos ===== */}
                  <div className="flex gap-4 items-start">
                    <aside className="w-44 md:w-56 shrink-0 sticky max-h-[75vh] overflow-y-auto pb-4" style={{ top: headerH + 124, scrollbarColor: '#9ca3af #e5e7eb' }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] mb-2 px-1">Grupos</p>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => { setSearch(''); setSelectedCategory('all'); setSelectedSubcategory('all'); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors text-left ${selectedCategory === 'all' ? 'bg-[#f7941d] text-white' : 'bg-white text-[#374151] border border-gray-200 hover:bg-gray-50'}`}>
                          <Package size={28} className="shrink-0" /> Todos
                        </button>
                        {brandCategories.map(cat => (
                          <button key={cat.id} onClick={() => { setSearch(''); setSelectedCategory(cat.name); setSelectedSubcategory('all'); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors text-left ${selectedCategory === cat.name ? 'bg-[#f7941d] text-white' : 'bg-white text-[#374151] border border-gray-200 hover:bg-gray-50'}`}>
                            <span className="h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden rounded-lg bg-white/60">
                              {cat.iconUrl ? <img src={cat.iconUrl} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package size={24} />}
                            </span>
                            <span className="leading-tight break-words">{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    </aside>

                  <div className="flex-1 min-w-0">
                  <div className="sticky z-10 bg-[#f9fafb] pt-1" style={{ top: headerH + 124 }}>
                  {/* Subcategory filter */}
                  {availableSubcategories.length > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <button onClick={() => scrollSubcats('left')} className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-[#374151] shrink-0"><ChevronLeft size={16} /></button>
                      <div ref={subcatScrollRef} className="flex gap-2 overflow-x-auto pb-1 flex-1" style={{ scrollbarColor: '#9ca3af #e5e7eb' }}>
                        <button onClick={() => { setSearch(''); setSelectedSubcategory('all'); }}
                          className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${selectedSubcategory === 'all' ? 'bg-[#374151] text-white' : 'bg-gray-100 text-[#374151] hover:bg-gray-200'}`}>
                          Todas
                        </button>
                        {availableSubcategories.map(sub => (
                          <button key={sub} onClick={() => { setSearch(''); setSelectedSubcategory(sub); }}
                            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${selectedSubcategory === sub ? 'bg-[#374151] text-white' : 'bg-gray-100 text-[#374151] hover:bg-gray-200'}`}>
                            {sub}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => scrollSubcats('right')} className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-[#374151] shrink-0"><ChevronRight size={16} /></button>
                    </div>
                  )}

                  {selectedBrand && panicService.isBlocked(selectedBrand) && !isLead && (
                    <div className="mb-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs px-3 py-2 rounded">
                      ⚠ Preços de <strong>{selectedBrand}</strong> temporariamente indisponíveis. Você pode seguir como orçamento e nossa equipe enviará os valores atualizados.
                    </div>
                  )}
                  </div>
                  {/* ===== Área rolável: apenas a grade de produtos ===== */}
                  <div className="pr-1 pb-4">


                  {/* Product grid — cards (filtro por chips de subcategoria) */}
                  {filteredProducts.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-[#6b7280]">Nenhum produto encontrado.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
                      {filteredProducts.map(p => renderProductCard(p))}
                    </div>
                  )}
                  </div>
                  </div>{/* fim coluna produtos */}
                  </div>{/* fim linha lateral+produtos */}
                  {/* ===== Fim da área rolável ===== */}


                  {/* Botão flutuante compacto "Ir para o carrinho" (passa por Sugestões antes) */}
                  {items.length > 0 && (
                    <div className="fixed bottom-4 right-4 z-40">
                      <Button onClick={goToCart} className="shadow-lg h-11">
                        <ShoppingCart size={16} /> Ir para o carrinho ({items.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}


              {/* ============ STEP: SUGGESTIONS — com preços e botão Adicionar (item 12) + Mais Vendidos (item 13) ============ */}
              {orderStep === 'suggestions' && (
                <>
                  <h2 className="text-xl font-bold text-[#111827] mb-4 flex items-center gap-2"><Lightbulb size={22} className="text-[#f7941d]" /> Promoções</h2>

                  {(() => {
                    const brandOk = (p: typeof products[0]) => !selectedBrand || p.brand.toLowerCase() === selectedBrand.toLowerCase();
                    // Ordem definida no admin (aba Promoções): menor sortOrder primeiro.
                    const promoOrder = new Map(promotionService.getAll().map((pr, i) => [pr.productId, i]));
                    const promos = products
                      .filter(p => p.active && brandOk(p) && productIsPromo(p))
                      .sort((a, b) => (promoOrder.get(a.id) ?? 9999) - (promoOrder.get(b.id) ?? 9999));
                    const promoIds = new Set(promos.map(p => p.id));
                    // TOP 10 Mais Vendidos: ordem definida na aba "Mais Vendidos" do admin.
                    const featured = products
                      .filter(p => p.active && p.isFeatured && brandOk(p))
                      .sort((a, b) => (a.featuredOrder ?? 9999) - (b.featuredOrder ?? 9999))
                      .slice(0, 10);
                    return (
                      <>
                        {/* Promoções primeiro (item 5) */}
                        <div className="mb-6">
                          <h3 className="text-lg font-semibold text-[#111827] mb-3 flex items-center gap-2"><Flame size={18} className="text-[#ef4444]" /> Promoções</h3>
                          {promos.length === 0
                            ? <p className="text-sm text-[#6b7280] py-4 text-center">Nenhuma promoção disponível no momento.</p>
                            : <HCarousel>{promos.map(p => SuggestionCard(p, true))}</HCarousel>}
                        </div>
                        {/* Mais Vendidos depois (item 5) */}
                        <div className="mb-6">
                          <h3 className="text-lg font-semibold text-[#111827] mb-3 flex items-center gap-2"><Sparkles size={18} className="text-[#f7941d]" /> TOP 10 Mais Vendidos</h3>
                          {featured.length === 0
                            ? <p className="text-sm text-[#6b7280] py-4 text-center">Nenhum produto destacado no momento.</p>
                            : <HCarousel>{featured.map((p, i) => SuggestionCard(p, promoIds.has(p.id), false, i + 1))}</HCarousel>}
                        </div>
                      
                      </>
                    );
                  })()}

                  <div className="mt-4 flex justify-between">
                    <Button onClick={() => setOrderStep('add-items')} variant="outline"><ArrowLeft size={16} className="mr-1" /> Adicionar Itens</Button>
                    <Button onClick={() => setOrderStep('cart')} variant="cta" size="lg">
                      <ShoppingCart size={18} className="mr-2" /> Ir para o Carrinho ({items.length})
                    </Button>
                  </div>
                </>
              )}

              {/* ============ STEP: HISTÓRICO DE COMPRA ============ */}
              {orderStep === 'history' && (
                <>
                  <h2 className="text-xl font-bold text-[#111827] mb-4 flex items-center gap-2"><Clock size={22} className="text-[#f7941d]" /> Histórico de Compra</h2>
                  <PurchaseHistory clientId={user?.id || ''} orders={clientOrders} products={products}
                    brand={selectedBrand} renderProduct={p => SuggestionCard(p, false, true)} />

                  <div className="mt-4 flex justify-between">
                    <Button onClick={() => setOrderStep('suggestions')} variant="outline"><ArrowLeft size={16} className="mr-1" /> Promoções</Button>
                    <Button onClick={() => setOrderStep('cart')} variant="cta" size="lg" disabled={items.length === 0}>
                      <ShoppingCart size={18} className="mr-2" /> Ir para o Carrinho ({items.length})
                    </Button>
                  </div>
                </>
              )}

              {/* ============ STEP: CART ============ */}
              {orderStep === 'cart' && (
                <>
                  <h2 className="text-xl font-bold text-[#111827] mb-4 flex items-center gap-2"><ShoppingCart size={22} /> Carrinho</h2>
                  {items.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                      <p className="text-[#6b7280]">Nenhum item no carrinho.</p>
                      <Button onClick={() => setOrderStep('add-items')} variant="outline" className="mt-4"><ArrowLeft size={16} className="mr-1" /> Adicionar Itens</Button>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {items.map((item, idx) => {
                          const prod = products.find(p => p.id === item.productId);
                          const baseName = item.selections?.length ? item.name.split(' - ')[0] : item.name;
                          const variationText = item.selections?.length
                            ? item.selections.map(s => `${s.groupName}: ${s.optionName}`).join(' · ')
                            : '';
                          const fullDescription = variationText ? `${baseName} - ${variationText}` : baseName;
                          return (
                          <div key={`${item.productId}-${item.variationKey || idx}`} className={`flex items-center gap-4 p-3 ${idx > 0 ? 'border-t border-gray-200' : ''}`}>
                            <div className="relative w-24 h-24 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer p-1" onClick={() => item.image && setZoomImage(item.image)}>
                              {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package size={40} className="text-gray-300" />}
                            </div>
                            <div className="w-28 shrink-0">
                              {itemHasPromoFlag(item, prod) && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-[#374151] text-[#f7941d] px-1.5 py-0.5 rounded mb-1 shadow-sm promo-badge-pulse">
                                  <Tag size={9} /> PROMOÇÃO
                                </span>
                              )}
                              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Código</p>
                              <p className="text-sm font-mono font-semibold text-[#111827]">{item.code}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Descrição do Item</p>
                              <p className="text-sm text-[#111827] break-words">
                                {baseName}
                                {item.selections?.length ? (
                                  <>
                                    {' - '}
                                    {item.selections.map((s, si) => (
                                      <span key={si}>
                                        {si > 0 && ' · '}
                                        <span className="text-[#6b7280]">{s.groupName}: </span>
                                        <strong className="font-bold text-[#111827]">{s.optionName}</strong>
                                      </span>
                                    ))}
                                  </>
                                ) : null}
                              </p>
                              {item.isNew && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-[10px] font-semibold bg-green-600 text-white rounded px-1.5 py-0.5">Lançamento</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0 w-28">
                              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Valor Unitário</p>
                              <p className="text-sm font-semibold text-[#111827] whitespace-nowrap">
                                {renderPrice(item.unitPrice)}
                              </p>
                            </div>
                            <div className="text-center shrink-0 w-32">
                              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Qtd.</p>
                              <div className="flex items-center justify-center gap-1">
                                <button type="button" onClick={() => updateQty(idx, Math.max(1, (item.qty || 1) - 1), true)}
                                  className="p-1 rounded border border-gray-200 bg-white text-[#374151] hover:bg-gray-50" title="Diminuir">
                                  <Minus size={14} />
                                </button>
                                <input
                                  type="text" inputMode="numeric" value={item.qty || ''}
                                  onChange={e => updateQty(idx, parseQty(e.target.value, 0))}
                                  onBlur={() => updateQty(idx, item.qty, true)}
                                  className="w-14 p-1.5 text-center border border-gray-200 rounded bg-white text-[#111827] text-sm" />
                                <button type="button" onClick={() => updateQty(idx, (item.qty || 0) + 1, true)}
                                  className="p-1 rounded border border-gray-200 bg-white text-[#374151] hover:bg-gray-50" title="Aumentar">
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="text-right shrink-0 w-28">
                              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Valor Total</p>
                              <p className="text-sm font-bold text-[#111827]">{renderPrice(item.totalPrice)}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Excluir"><Trash2 size={16} /></button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg flex justify-between items-center">
                        <span className="text-lg font-bold text-[#111827]">Total Bruto:</span>
                        <span className="text-xl font-bold text-[#f7941d]">{renderPrice(totals.total)}</span>
                      </div>
                      <div className="mt-4 flex justify-between">
                        <Button onClick={() => setOrderStep('add-items')} variant="outline"><ArrowLeft size={16} className="mr-1" /> Adicionar Itens</Button>
                        <Button onClick={() => setOrderStep(hidePayment ? 'finalize' : 'payment')} variant="cta" size="lg">{hidePayment ? 'Finalizar' : 'Pagamento / Frete'} <ArrowRight size={16} className="ml-1" /></Button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ============ STEP: PAYMENT ============ */}
              {orderStep === 'payment' && (
                <>
                  <h2 className="text-xl font-bold text-[#111827] mb-4 flex items-center gap-2"><CreditCard size={22} /> Pagamento</h2>
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="border-b border-[#f7941d] pb-4 mb-6">
                      <h3 className="text-lg font-bold text-[#111827]">Pagamento — {selectedBrand}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium text-[#374151] flex items-center gap-1 mb-2">Meio de Pagamento:</label>
                        <select value={payMethod} onChange={e => setPayMethod(e.target.value as PayMethod)}
                          className="w-full p-3 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none">
                          {availableMethods.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-[#374151] flex items-center gap-1 mb-2">Prazo de Pagamento:</label>
                        <select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)}
                          className="w-full p-3 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none">
                          {availableTerms.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                        </select>
                      </div>
                      {freightOptions.length > 1 && (
                        <div>
                          <label className="text-sm font-medium text-[#374151] flex items-center gap-1 mb-2">Tipo de Frete:</label>
                          <select value={freightType} onChange={e => setFreightType(e.target.value)}
                            className="w-full p-3 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none">
                            {freightOptions.map(o => <option key={o.type} value={o.type}>{o.type}{o.value > 0 ? ` — ${formatBRL(o.value)}` : ' — grátis'}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Resumo financeiro */}
                    <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
                      <div className="flex justify-between"><span>Subtotal:</span><strong>{formatBRL(subtotalRaw)}</strong></div>
                      {aVistaDiscount > 0 && (
                        <div className="flex justify-between text-green-700"><span>Desconto À Vista ({payConfig?.pixDiscountPct}%):</span><strong>- {formatBRL(aVistaDiscount)}</strong></div>
                      )}
                      {freightValue > 0 && (
                        <div className="flex justify-between"><span>Frete:</span><strong>{formatBRL(freightValue)}</strong></div>
                      )}
                      {payConfig?.freightCifAbove && subtotalRaw >= payConfig.freightCifAbove && (
                        <div className="flex justify-between text-green-700"><span>Frete:</span><strong>CIF (grátis)</strong></div>
                      )}
                      <div className="flex justify-between text-lg pt-2 border-t border-gray-200 mt-2"><span className="font-bold">Total:</span><span className="font-bold text-[#f7941d]">{formatBRL(finalTotal)}</span></div>
                    </div>

                    {paymentValidationError && (
                      <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                        ⚠️ {paymentValidationError}
                      </div>
                    )}
                  </div>

                  {payConfig && (
                    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
                      <h4 className="font-bold mb-2 text-[#111827]">Política Comercial — {selectedBrand}</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div><span className="text-[#6b7280]">Pedido Mínimo:</span><br/><strong className="text-[#111827]">{payConfig.minOrderValue ? formatBRL(payConfig.minOrderValue) : '—'}</strong></div>
                        <div><span className="text-[#6b7280]">Boleto Mínimo:</span><br/><strong className="text-[#111827]">{payConfig.minBoletoValue ? formatBRL(payConfig.minBoletoValue) : 'A combinar'}</strong></div>
                        <div><span className="text-[#6b7280]">Frete:</span><br/><strong className="text-[#111827]">{payConfig.freightFixed ? `${formatBRL(payConfig.freightFixed)}${payConfig.freightCifAbove ? ` (CIF acima de ${formatBRL(payConfig.freightCifAbove)})` : ''}` : 'CIF incluso'}</strong></div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex justify-between">
                    <Button onClick={() => setOrderStep('cart')} variant="outline"><ArrowLeft size={16} className="mr-1" /> Carrinho</Button>
                    <Button onClick={() => setOrderStep('finalize')} variant="cta" size="lg">Finalizar <ArrowRight size={16} className="ml-1" /></Button>
                  </div>
                </>
              )}


              {/* ============ STEP: FINALIZE ============ */}
              {orderStep === 'finalize' && (
                <>
                  <h2 className="text-xl font-bold text-[#111827] mb-4 flex items-center gap-2"><CheckCircle2 size={22} /> Finalizar</h2>

                  {(() => {
                    const obsExtrasCard = (
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6 space-y-6">
                      <div>
                        <label className="text-sm font-medium text-[#374151] flex items-center gap-2 mb-2">Observações:</label>
                        <textarea value={observations} onChange={e => setObservations(e.target.value)}
                          rows={6} placeholder="Observações do pedido..."
                          className="w-full p-3 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none resize-none" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#111827] mb-4">Informações Extras</h3>
                        <div className="border-b border-[#f7941d] mb-4"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm text-[#374151] mb-1 block">Ordem de compra:</label>
                            <input type="text" value={purchaseOrder} onChange={e => setPurchaseOrder(e.target.value)}
                              className="w-full p-2.5 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-sm text-[#374151] mb-1 block">Observação Nota Fiscal:</label>
                            <input type="text" value={invoiceNote} onChange={e => setInvoiceNote(e.target.value)}
                              className="w-full p-2.5 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-sm text-[#374151] mb-1 block">Comprador:</label>
                            <input type="text" value={buyer} onChange={e => setBuyer(e.target.value)}
                              className="w-full p-2.5 border border-gray-200 rounded-lg bg-white text-[#111827] focus:ring-2 focus:ring-[#f7941d] focus:outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                    const totalCard = (
                    <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-3 self-start lg:sticky lg:top-24 w-full max-w-md">
                      <div className="flex justify-between items-center text-xl font-bold">
                        <span className="text-[#111827]">Total:</span>
                        <span className="text-[#f7941d]">{renderPrice(totals.total)}</span>
                      </div>

                      {orderType === 'pedido' && !totals.withinCreditLimit && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-xs">Pedido excede o saldo disponível de crédito.</div>
                      )}

                      {(() => {
                        // item 11: pedido abaixo do mínimo não pode finalizar, mas pode salvar.
                        const minOrder = isLead ? 0 : (payConfig?.minOrderValue || 0);
                        const belowMin = minOrder > 0 && totals.total < minOrder;

                        return (
                          <>
                            {belowMin && (
                              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-2 rounded text-xs">
                                Valor mínimo para <strong>{selectedBrand}</strong>: {formatBRL(minOrder)}.
                              </div>
                            )}
                            {pricesBlocked && orderType === 'pedido' && (
                              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-2 rounded text-xs">
                                Preços de <strong>{selectedBrand}</strong> temporariamente indisponíveis. Finalize como orçamento.
                              </div>
                            )}
                            {pricesBlocked && orderType === 'pedido' ? (
                              <Button onClick={() => { setOrderType('orcamento'); submitOrder('orcamento'); }} disabled={items.length === 0} variant="cta" className="w-full" size="lg">
                                <CheckCircle2 size={18} className="mr-2" />
                                Finalizar como {quoteLabel}
                              </Button>
                            ) : (orderType === 'orcamento' && cartWording) ? null : (
                              <Button onClick={() => submitOrder()} disabled={items.length === 0 || belowMin} variant="cta" className="w-full" size="lg">
                                <CheckCircle2 size={18} className="mr-2" />
                                {editingOrderId && !isFreshDraft ? (orderType === 'pedido' ? 'Alterar para Pedido' : `Atualizar ${quoteLabel}`) : `Enviar e Salvar ${orderType === 'pedido' ? 'Pedido' : quoteLabel}`}
                              </Button>

                            )}
                            {orderType === 'orcamento' && !isLead && (
                              <Button onClick={switchToPedido} disabled={items.length === 0} variant="outline" className="w-full" size="lg">
                                <RefreshCw size={16} className="mr-2" /> Alterar para Pedido
                              </Button>
                            )}
                            <Button onClick={saveDraft} disabled={items.length === 0} variant={belowMin ? 'cta' : 'outline'} className="w-full" size="lg">
                              <Save size={16} className="mr-2" /> Salvar Carrinho
                            </Button>

                          </>
                        );
                      })()}
                      <p className="text-[10px] text-[#6b7280]">Preços sujeitos a confirmação. Sem integração com estoque em tempo real.</p>
                    </div>
                    );
                    // Leads: tela Finalizar mostra apenas o cartão de Total centralizado
                    return isLead ? (
                      <div className="flex justify-center">{totalCard}</div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {obsExtrasCard}
                        {totalCard}
                      </div>
                    );
                  })()}

                  <div className="mt-4 flex justify-start">
                    <Button onClick={() => setOrderStep(hidePayment ? 'cart' : 'payment')} variant="outline"><ArrowLeft size={16} className="mr-1" /> {hidePayment ? 'Carrinho' : 'Pagamento / Frete'}</Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {politicaModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setPoliticaModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[#111827] flex items-center gap-2"><FileText size={20} className="text-[#f7941d]" /> Política Comercial de Vendas</h3>
              <button onClick={() => setPoliticaModal(false)} className="text-[#6b7280] hover:text-[#111827]"><X size={20} /></button>
            </div>
            <p className="text-sm text-[#374151] whitespace-pre-line">{globalTexts.policyText || 'Conteúdo ainda não cadastrado. O administrador pode preencher esta política em Admin → Configurações.'}</p>
            <Button variant="cta" className="w-full mt-6" onClick={() => setPoliticaModal(false)}>Fechar</Button>
          </div>
        </div>
      )}
      {informativoModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setInformativoModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[#111827] flex items-center gap-2"><Megaphone size={20} className="text-[#f7941d]" /> Informativo</h3>
              <button onClick={() => setInformativoModal(false)} className="text-[#6b7280] hover:text-[#111827]"><X size={20} /></button>
            </div>
            <p className="text-sm text-[#374151] whitespace-pre-line">{globalTexts.noticeText || 'Nenhum informativo cadastrado no momento.'}</p>
            <Button variant="cta" className="w-full mt-6" onClick={() => setInformativoModal(false)}>Fechar</Button>
          </div>
        </div>
      )}
      {brandRulesPopup && (() => {
        const r = brandRulesService.get(brandRulesPopup);
        const policy = r.policyText;
        const notice = r.noticeText;
        return (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setBrandRulesPopup(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-[#111827]">{brandRulesPopup}</h3>
                <button onClick={() => setBrandRulesPopup(null)} className="text-[#6b7280] hover:text-[#111827]"><X size={20} /></button>
              </div>
              {policy && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-[#f7941d] uppercase tracking-wide mb-1">Política Comercial</h4>
                  <p className="text-sm text-[#374151] whitespace-pre-line">{policy}</p>
                </div>
              )}
              <Button variant="cta" className="w-full" onClick={() => setBrandRulesPopup(null)}>Entendi, continuar</Button>
            </div>
          </div>
        );
      })()}
      <SystemFooter />
    </div>
  );
}
