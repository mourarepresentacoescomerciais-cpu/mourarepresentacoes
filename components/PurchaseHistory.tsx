import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Package, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { Order } from '@/lib/orders';
import type { Product } from '@/lib/types';
import { readHistoryOverrides, resolvePurchaseHistory, saveHistoryOverride, type HistoryOverride } from '@/lib/purchaseHistory';

interface Props {
  clientId: string;
  orders: Order[];
  products: Product[];
  brand?: string;
  renderProduct?: (product: Product) => ReactNode;
  /** Admin panel: use the administrator session, never a client login from another tab. */
  asAdmin?: boolean;
}

export function PurchaseHistory({ clientId, orders, products, brand, renderProduct, asAdmin = false }: Props) {
  const [overrides, setOverrides] = useState<HistoryOverride[]>([]);
  const [loadedClient, setLoadedClient] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ originalId: string; product: Product } | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [replacementId, setReplacementId] = useState('');
  useEffect(() => {
    let active = true;
    setLoadedClient(''); setError(''); setOverrides([]); setEditing(null);
    if (!clientId) return;
    readHistoryOverrides(clientId, asAdmin).then(rows => {
      if (active) { setOverrides(rows); setLoadedClient(clientId); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [clientId, reload, asAdmin]);
  const rows = useMemo(() => resolvePurchaseHistory(orders, products, overrides, brand), [orders, products, overrides, brand]);
  const candidates = useMemo(() => products.filter(p => p.active && p.id !== editing?.product.id
    && p.id !== editing?.originalId && p.brand.toLowerCase() === editing?.product.brand.toLowerCase()
    && `${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())), [products, editing, search]);

  const addCandidates = useMemo(() => !adding ? [] : products.filter(p => p.active
    && (!brand || p.brand.toLowerCase() === brand.toLowerCase())
    && !rows.some(r => r.product.id === p.id)
    && `${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())).slice(0, 200), [adding, products, brand, rows, search]);
  const add = async () => {
    if (!replacementId) return;
    const product = products.find(p => p.id === replacementId);
    if (!product) return;
    if (await save({ originalId: product.id, product }, product.id, false)) setAdding(false);
  };
  const save = async (row: { originalId: string; product: Product }, replacement: string | null, hidden: boolean) => {
    setBusy(true); setError('');
    try {
      await saveHistoryOverride(clientId, row.originalId, replacement, hidden, asAdmin);
      setOverrides(prev => [...prev.filter(change => change.original_product_id !== row.originalId), {
        original_product_id: row.originalId, replacement_product_id: replacement, hidden,
      }]);
      setEditing(null);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); return false; }
    finally { setBusy(false); }
  };
  const ready = loadedClient === clientId && !!clientId;
  return <>
    {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 border border-border bg-muted p-3 text-sm text-foreground">
      <span>{error}</span><Button variant="outline" size="sm" onClick={() => setReload(n => n + 1)}><RefreshCw size={14} /> Tentar novamente</Button>
    </div>}
    {!ready && !error && <p role="status" className="py-3 text-sm text-muted-foreground">Carregando histórico…</p>}
    <div className="mb-3 flex justify-end">
      <Button variant="cta" size="sm" disabled={!ready || busy} onClick={() => { setAdding(true); setSearch(''); setReplacementId(''); }}><Plus size={14} /> Adicionar produto</Button>
    </div>
    {rows.length === 0 ? <p className="py-10 text-center text-muted-foreground">Nenhum produto no histórico de compra.</p> :
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(row => <div key={row.originalId} className="min-w-0">
          {renderProduct ? renderProduct(row.product) : <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground">
            <div className="flex h-28 items-center justify-center bg-muted">{row.product.image ? <img src={row.product.image} alt={row.product.name} className="h-full w-full object-contain" /> : <Package className="text-muted-foreground" />}</div>
            <span className="text-xs text-muted-foreground">{row.product.brand} · {row.product.code}</span><p className="text-sm">{row.product.name}</p>
          </div>}
          <div className="mt-2 flex flex-wrap gap-1">
            <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={!ready || busy} onClick={() => { setEditing(row); setSearch(''); setReplacementId(''); }}><ArrowLeftRight size={13} /> Trocar</Button>
            <Button variant="outline" size="icon" className="h-9 w-9 text-destructive" title="Excluir do histórico" aria-label={`Excluir ${row.product.name} do histórico`} disabled={!ready || busy} onClick={() => { if (window.confirm(`Excluir "${row.product.name}" do Histórico de Compra? Os pedidos enviados não serão alterados.`)) void save(row, null, true); }}><Trash2 size={14} /></Button>
          </div>
        </div>)}
      </div>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Trocar produto no histórico</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{editing?.product.code} · {editing?.product.name}</p>
        <input aria-label="Buscar produto substituto" placeholder="Buscar por código ou nome" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border border-input bg-background p-2 text-foreground" />
        <select aria-label="Produto substituto" value={replacementId} onChange={e => setReplacementId(e.target.value)} className="w-full rounded border border-input bg-background p-2 text-foreground">
          <option value="">Selecione o produto</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
        {candidates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto encontrado nesta empresa.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button><Button variant="cta" disabled={!replacementId || busy} onClick={() => { if (editing) void save(editing, replacementId, false); }}>{busy ? 'Salvando…' : 'Salvar troca'}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={adding} onOpenChange={open => { if (!open && !busy) setAdding(false); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Adicionar produto ao histórico</DialogTitle></DialogHeader>
        <input aria-label="Buscar produto" placeholder="Buscar por código ou nome" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border border-input bg-background p-2 text-foreground" />
        <select aria-label="Produto" value={replacementId} onChange={e => setReplacementId(e.target.value)} className="w-full rounded border border-input bg-background p-2 text-foreground">
          <option value="">Selecione o produto</option>{addCandidates.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}{brand ? '' : ` (${p.brand})`}</option>)}
        </select>
        {addCandidates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button><Button variant="cta" disabled={!replacementId || busy} onClick={() => void add()}>{busy ? 'Salvando…' : 'Adicionar'}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}