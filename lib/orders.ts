import { useState, useCallback, useEffect } from 'react';
import type { OrderItem, OrderStatus, OrderType, QuoteRequest, QuoteRequestItem } from './types';

import { insertOrderDB, updateOrderDB, deleteOrderDB, insertQuoteDB, updateQuoteDB, deleteQuoteDB, DATA_READY_EVENT, bootstrapAdminData, getCachedRows, setCachedRows } from './dataStore';

export interface Order {
  id: string;
  clientId: string;
  clientName: string;
  clientCnpj: string;
  brand: string;
  type: OrderType;
  items: OrderItem[];
  generalDiscountPct: number;
  totalBruto: number;
  totalWithDiscount: number;
  totalIPI: number;
  totalST: number;
  totalWithTax: number;
  status: OrderStatus;
  createdAt: string;
  observations?: string;
  purchaseOrder?: string;
  invoiceNote?: string;
  buyer?: string;
  paymentMethod?: string;
  paymentTerm?: string;
}

const STORAGE_KEY = 'moura_orders';
const QUOTE_KEY = 'moura_quote_requests';

function getOrders(): Order[] {
  return getCachedRows<Order>(STORAGE_KEY) ?? [];
}

function saveOrders(orders: Order[]) {
  setCachedRows(STORAGE_KEY, orders);
}

function getQuoteRequests(): QuoteRequest[] {
  return getCachedRows<QuoteRequest>(QUOTE_KEY) ?? [];
}

function saveQuoteRequests(quotes: QuoteRequest[]) {
  setCachedRows(QUOTE_KEY, quotes);
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(() => getOrders());
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>(() => getQuoteRequests());

  const refreshLocal = useCallback(() => {
    setOrders(getOrders());
    setQuoteRequests(getQuoteRequests());
  }, []);

  const refresh = useCallback(() => {
    void bootstrapAdminData(true).then(refreshLocal);
  }, [refreshLocal]);

  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      const rows = (e as CustomEvent).detail?.rows;
      if (scope === 'orders' && Array.isArray(rows)) setOrders(rows);
      else if (scope === 'quotes' && Array.isArray(rows)) setQuoteRequests(rows);
      else if (scope === 'orders' || scope === 'quotes' || scope === 'all') refreshLocal();
    };
    window.addEventListener(DATA_READY_EVENT, handler);
    return () => window.removeEventListener(DATA_READY_EVENT, handler);
  }, [refreshLocal]);

  const addOrder = useCallback((order: Omit<Order, 'id' | 'status' | 'createdAt'> & { status?: OrderStatus }) => {
    const now = new Date();
    const newOrder: Order = {
      ...order,
      // O id precisa ser um UUID válido (coluna uuid no banco). O número
      // legível do pedido (DDMMAAAAHHMM) é derivado de createdAt via orderNumber().
      id: crypto.randomUUID(),
      status: order.status ?? 'Recebido',
      createdAt: now.toISOString(),
    };
    const updated = [...getOrders(), newOrder];
    saveOrders(updated);
    setOrders(updated);
    void insertOrderDB(newOrder);
    return newOrder;
  }, []);

  const updateStatus = useCallback((id: string, status: OrderStatus) => {
    const updated = getOrders().map(o => o.id === id ? { ...o, status } : o);
    saveOrders(updated);
    setOrders(updated);
    void updateOrderDB(id, { status });
  }, []);

  const addQuoteRequest = useCallback((quote: Omit<QuoteRequest, 'id' | 'status' | 'createdAt'>) => {
    const newQuote: QuoteRequest = {
      ...quote,
      id: crypto.randomUUID(),
      status: 'Recebido',
      createdAt: new Date().toISOString(),
    };
    const updated = [...getQuoteRequests(), newQuote];
    saveQuoteRequests(updated);
    setQuoteRequests(updated);
    void insertQuoteDB(newQuote);
    return newQuote;
  }, []);

  const updateQuoteStatus = useCallback((id: string, status: OrderStatus) => {
    const updated = getQuoteRequests().map(q => q.id === id ? { ...q, status } : q);
    saveQuoteRequests(updated);
    setQuoteRequests(updated);
    void updateQuoteDB(id, { status });
  }, []);

  const updateOrder = useCallback((id: string, data: Partial<Order>) => {
    const updated = getOrders().map(o => o.id === id ? { ...o, ...data } : o);
    saveOrders(updated);
    setOrders(updated);
    void updateOrderDB(id, data);
  }, []);

  const deleteOrder = useCallback((id: string) => {
    const updated = getOrders().filter(o => o.id !== id);
    saveOrders(updated);
    setOrders(updated);
    void deleteOrderDB(id);
  }, []);

  const deleteQuoteRequest = useCallback((id: string) => {
    const updated = getQuoteRequests().filter(q => q.id !== id);
    saveQuoteRequests(updated);
    setQuoteRequests(updated);
    void deleteQuoteDB(id);
  }, []);

  const getOrdersByClient = useCallback((clientId: string) => {
    return getOrders().filter(o => o.clientId === clientId);
  }, []);

  return { orders, quoteRequests, addOrder, updateStatus, addQuoteRequest, updateQuoteStatus, getOrdersByClient, refresh, updateOrder, deleteOrder, deleteQuoteRequest };
}
