import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://mudqnvqhzrjkpgofapgm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZHFudnFoenJqa3Bnb2ZhcGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDA4NzMsImV4cCI6MjA5MTY3Njg3M30.v5WqdVHW-6c9rN4_n7Iu4z2KFrNXbYpl1w7iPJFaIdI';

// Storage resiliente: ao receber QuotaExceededError ao gravar a sessão, NÃO
// apaga nenhum dado da aplicação (produtos, categorias, catálogos). Apenas
// ignora a falha de persistência — o login continua funcionando em memória.
const resilientStorage = {
  getItem: (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Não removemos dados da aplicação para liberar espaço — preferimos não
      // persistir a sessão a destruir produtos/categorias do cliente.
      console.warn('[supabase storage] localStorage cheio; sessão não persistida (dados preservados).', e);
    }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); } catch {}
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: resilientStorage,
    storageKey: 'moura_supabase_auth',
  },
});

// Cliente sem sessão persistida para RPCs públicas/locais de login.
// Evita que uma sessão Supabase antiga tente renovar token antes do login por CNPJ,
// que era o principal motivo de demora após clicar em ENTRAR.
export const supabaseStateless = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/** Login por CNPJ é traduzido em e-mail sintético cnpj@moura.local */
export const cnpjToEmail = (cnpj: string) => `${cnpj.replace(/\D/g, '')}@moura.local`;
