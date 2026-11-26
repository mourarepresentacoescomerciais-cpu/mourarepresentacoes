import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function ClientRoute({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, isClient, isLead } = useAuth();
  if (!authReady) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Carregando…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isClient && !isLead) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, isAdmin } = useAuth();
  if (!authReady) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Carregando…</div>;
  if (!isAuthenticated || !isAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
