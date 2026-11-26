import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { ClientRoute, AdminRoute } from "@/components/ProtectedRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useAuth } from "@/lib/auth";
import { bootstrapDataStore, bootstrapAdminData } from "@/lib/dataStore";
import { runMigrationIfNeeded } from "@/lib/migrationService";
import { visitService } from "@/lib/visitService";

import Index from "./pages/Index";
import Login from "./pages/Login";

// Rotas pesadas / menos acessadas carregadas sob demanda (reduz o bundle inicial).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const About = lazy(() => import("./pages/About"));
const BrandsPage = lazy(() => import("./pages/BrandsPage"));
const Catalogs = lazy(() => import("./pages/Catalogs"));
const Promotions = lazy(() => import("./pages/Promotions"));
const Contact = lazy(() => import("./pages/Contact"));
const QuoteRequest = lazy(() => import("./pages/QuoteRequest"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const Privacy = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.Terms })));
const CookiePolicy = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.CookiePolicy })));
const NotFound = lazy(() => import("./pages/NotFound"));


const queryClient = new QueryClient();

function AdminGate() {
  const { isAuthenticated, isAdmin } = useAuth();
  useEffect(() => { if (isAdmin) void runMigrationIfNeeded(true); }, [isAdmin]);
  if (isAuthenticated && isAdmin) return <AdminPanel />;
  return <Login mode="admin" />;
}

function Bootstrapper({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, isAdmin } = useAuth();
  const loc = useLocation();
  const isLoginScreen = loc.pathname === '/login' || loc.pathname === '/admin';

  useEffect(() => {
    // A tela de login precisa responder ao clique imediatamente. Não iniciamos
    // o bootstrap pesado da vitrine aqui para não competir com a RPC de login.
    if (isLoginScreen) return;
    void bootstrapDataStore();
  }, [isLoginScreen]);
  useEffect(() => {
    // Dados restritos (pedidos, perfis, orçamentos, etc.) só são baixados
    // quando há sessão autenticada — evita egress para visitantes anônimos.
    // Usuários logados (admin/cliente) são poucos: revalidamos a vitrine para
    // que vejam sempre dados frescos, sem impactar o egress dos anônimos.
    if (authReady && isAuthenticated) {
      // NÃO forçar aqui: bootstrapDataStore() já faz stale-while-revalidate
      // (revalida contra o Supabase em segundo plano). Forçar reiniciava o
      // bootPromise e disparava uma SEGUNDA hidratação completa por cima da
      // primeira — a causa do carregamento em dobro (travamento/lentidão).
      if (!isLoginScreen) void bootstrapDataStore();
      // Dados administrativos (perfis/pedidos/orçamentos) só para admin —
      // evita chamadas "forbidden" e a lentidão delas no login do cliente.
      if (isAdmin) void bootstrapAdminData(true);
    }
  }, [authReady, isAuthenticated, isAdmin, isLoginScreen]);

  return <>{children}</>;
}

function VisitTracker() {
  const loc = useLocation();
  useEffect(() => {
    if (loc.pathname === '/login' || loc.pathname === '/admin') return;
    visitService.track(loc.pathname);
  }, [loc.pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Bootstrapper>
              <VisitTracker />
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>}>
                <Routes>
                  <Route path="/" element={<Layout><Index /></Layout>} />
                  <Route path="/sobre" element={<About />} />
                  <Route path="/representadas" element={<BrandsPage />} />
                  <Route path="/catalogos" element={<Catalogs />} />
                  <Route path="/promocoes" element={<Promotions />} />
                  <Route path="/contato" element={<Contact />} />
                  <Route path="/solicitar-orcamento" element={<QuoteRequest />} />
                  <Route path="/orcamento" element={<QuoteRequest />} />
                  <Route path="/login" element={<Login mode="client" />} />
                  <Route path="/painel" element={<ClientRoute><Dashboard /></ClientRoute>} />
                  <Route path="/painel/pedidos" element={<ClientRoute><Dashboard /></ClientRoute>} />
                  <Route path="/painel/:brand" element={<ClientRoute><Dashboard /></ClientRoute>} />
                  <Route path="/painel/:brand/:type" element={<ClientRoute><Dashboard /></ClientRoute>} />
                  <Route path="/admin" element={<AdminGate />} />
                  <Route path="/admin/painel" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                  <Route path="/admin/painel/:tab" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                  <Route path="/admin/diagnostico" element={<AdminRoute><Diagnostics /></AdminRoute>} />
                  <Route path="/privacidade" element={<Privacy />} />
                  <Route path="/termos" element={<Terms />} />
                  <Route path="/cookies" element={<CookiePolicy />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>

            </Bootstrapper>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

export default App;
