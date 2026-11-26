import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/constants';
import { formatCNPJMask, isValidCNPJ } from '@/lib/formatters';
import { passwordRecoveryService } from '@/lib/passwordRecoveryService';
import { supabase } from '@/lib/supabase';
import { KeyRound, X, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { SystemFooter } from '@/components/SystemFooter';

export default function Login({ mode = 'client' }: { mode?: 'client' | 'admin' }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotCnpj, setForgotCnpj] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await login(identifier, password);
    if (result.success) {
      navigate(result.user?.role === 'admin' ? '/admin/painel' : '/painel');
    } else {
      setError(result.error || 'Credenciais inválidas.');
    }
  };

  const handleIdentifierChange = (v: string) => {
    if (mode === 'admin') { setIdentifier(v); return; }
    if (/[a-zA-Z@]/.test(v)) setIdentifier(v);
    else setIdentifier(formatCNPJMask(v));
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!isValidCNPJ(forgotCnpj)) { setForgotError('CNPJ inválido. Informe os 14 dígitos.'); return; }
    setForgotLoading(true);
    // Verifica se o CNPJ realmente possui cadastro antes de aceitar.
    const { data, error } = await supabase.rpc('cnpj_exists', { _cnpj: forgotCnpj });
    if (error) {
      setForgotLoading(false);
      setForgotError('Não foi possível validar o CNPJ agora. Tente novamente.');
      return;
    }
    if (!data) {
      setForgotLoading(false);
      setForgotError('CNPJ não encontrado. Verifique se o cadastro já foi aprovado.');
      return;
    }
    // Salva no painel admin (item 1)
    passwordRecoveryService.add(forgotCnpj);
    const text = `Olá, esqueci minha senha e preciso de ajuda para acessar a plataforma.\n\nCNPJ: ${forgotCnpj}`;
    window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(text)}`, '_blank');
    setForgotCnpj('');
    setForgotLoading(false);
    setForgotSent(true);
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotSent(false);
    setForgotError('');
    setForgotCnpj('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src="/logo-white.png" alt="Moura Representações" className="h-16 mx-auto mb-6" />
          <h1 className="font-display text-2xl font-bold">
            {mode === 'admin' ? 'Acesso Administrativo' : 'Área do Cliente'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === 'admin' ? 'Painel de gerenciamento do sistema' : 'Acesse sua conta para gerar orçamentos e pedidos'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-card border border-border p-8 space-y-4 shadow-card">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-lg">{error}</div>
          )}

          <div>
            <label htmlFor="identifier" className="block text-sm font-medium mb-1.5">
              {mode === 'admin' ? 'Usuário' : 'CNPJ ou E-mail'}
            </label>
            <input id="identifier" type="text" value={identifier} onChange={e => handleIdentifierChange(e.target.value)}
              placeholder={mode === 'admin' ? 'admin' : '00.000.000/0000-00'}
              className="w-full p-3 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              required autoFocus maxLength={mode === 'admin' ? 50 : 200} />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">Senha</label>
            <div className="relative">
              <input id="password" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 pr-12 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                required />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'} tabIndex={-1}>
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" variant="cta" size="lg" className="w-full">ENTRAR</Button>

          {mode === 'client' && (
            <div className="flex justify-between text-xs text-muted-foreground pt-2">
              <button type="button" onClick={() => setShowForgot(true)} className="hover:text-primary inline-flex items-center gap-1">
                <KeyRound size={12} /> Esqueci minha senha
              </button>
              <Link to="/solicitar-orcamento" className="hover:text-primary">Solicitar acesso</Link>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground pt-2">Cadastro não aberto. Acesso criado manualmente pela administração.</p>
        </form>

        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">← Voltar para o Site</Link>
        </div>
      </div>

      {showForgot && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={closeForgot}>
          {forgotSent ? (
            <div onClick={e => e.stopPropagation()} className="bg-card border border-border rounded-lg p-8 w-full max-w-md text-center space-y-4 shadow-xl">
              <CheckCircle2 className="mx-auto text-primary" size={56} />
              <h2 className="font-display text-xl font-bold">Solicitação Recebida!</h2>
              <p className="text-sm text-muted-foreground">
                Analisaremos sua solicitação e, após a liberação, você receberá os dados de acesso via WhatsApp ou e-mail.
              </p>
              <Button type="button" variant="cta" onClick={closeForgot} className="w-full">Voltar ao Site</Button>
            </div>
          ) : (
            <form onClick={e => e.stopPropagation()} onSubmit={handleForgotSubmit} className="bg-card border border-border rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Recuperar Acesso</h2>
                <button type="button" onClick={closeForgot} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
              </div>
              <p className="text-xs text-muted-foreground">Informe seu CNPJ. Abriremos o WhatsApp e registraremos sua solicitação.</p>
              {forgotError && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs p-2 rounded">{forgotError}</div>}
              <div>
                <label className="block text-sm font-medium mb-1.5">CNPJ <span className="text-destructive">*</span></label>
                <input value={forgotCnpj} onChange={e => setForgotCnpj(formatCNPJMask(e.target.value))}
                  placeholder="00.000.000/0000-00" maxLength={18} required autoFocus
                  className="w-full p-2.5 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
              <Button type="submit" variant="cta" className="w-full" disabled={forgotLoading}>{forgotLoading ? 'Verificando...' : 'Enviar via WhatsApp'}</Button>
            </form>
          )}
        </div>
      )}
      </div>
      <SystemFooter />
    </div>
  );
}
