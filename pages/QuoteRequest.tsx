import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { accessRequestService } from '@/lib/accessRequestService';
import { leadService } from '@/lib/leadService';
import { getCachedRows } from '@/lib/dataStore';
import type { Client } from '@/lib/types';
import { Link } from 'react-router-dom';
import { SITE } from '@/lib/constants';
import { formatCNPJMask, formatPhoneMask, isValidCNPJ, isValidPhone, isValidEmail } from '@/lib/formatters';
import { MessageCircle, Mail, CheckCircle2, Send } from 'lucide-react';

interface AccessForm {
  cnpj: string;
  companyName: string;
  contactName: string;
  whatsapp: string;
  email: string;
}

export default function QuoteRequest() {
  const [form, setForm] = useState<AccessForm>({ cnpj: '', companyName: '', contactName: '', whatsapp: '', email: '' });
  const [submitted, setSubmitted] = useState(false);

  const upd = (k: keyof AccessForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const validate = (): string | null => {
    if (!form.cnpj.trim() || !form.companyName.trim() || !form.contactName.trim() || !form.whatsapp.trim() || !form.email.trim()) {
      return 'Preencha todos os campos obrigatórios.';
    }
    if (!isValidCNPJ(form.cnpj)) return 'CNPJ inválido. Informe os 14 dígitos.';
    if (!isValidPhone(form.whatsapp)) return 'WhatsApp inválido. Use (00) 00000-0000.';
    if (!isValidEmail(form.email)) return 'E-mail inválido.';
    if (form.contactName.trim().length < 2) return 'Informe um nome válido.';
    if (form.companyName.trim().length < 2) return 'Informe o nome da empresa.';

    // Bloqueio: CNPJ já cadastrado como cliente, lead, ou solicitação ativa
    const cleanCnpj = form.cnpj.replace(/\D/g, '');
    const clients: Client[] = getCachedRows<Client>('moura_clients') ?? [];
    if (clients.some(c => c.cnpj.replace(/\D/g, '') === cleanCnpj)) {
      return "Este CNPJ já possui cadastro. Utilize a opção 'Esqueci minha senha' na área do cliente.";
    }
    if (leadService.findByCnpj(cleanCnpj)) {
      return "Este CNPJ já possui cadastro. Utilize a opção 'Esqueci minha senha' na área do cliente.";
    }
    if (accessRequestService.existsByCnpj(cleanCnpj)) {
      return 'Já existe uma solicitação em andamento para este CNPJ. Aguarde nosso contato.';
    }
    return null;
  };

  const buildBody = () =>
    `Olá! Vim pelo site e gostaria de solicitar acesso à plataforma.\n\nCNPJ: ${form.cnpj}\nEmpresa: ${form.companyName}\nNome: ${form.contactName}\nWhatsApp: ${form.whatsapp}\nE-mail: ${form.email}`;

  const persist = () => accessRequestService.add(form);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { toast({ title: 'Verifique o formulário', description: err, variant: 'destructive' }); return; }
    persist();
    setSubmitted(true);
    toast({ title: 'Solicitação enviada!', description: 'Em breve entraremos em contato.' });
  };

  const handleWhatsApp = () => {
    const err = validate();
    if (err) { toast({ title: 'Verifique o formulário', description: err, variant: 'destructive' }); return; }
    persist();
    window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(buildBody())}`, '_blank');
    setSubmitted(true);
  };

  const handleEmail = () => {
    const err = validate();
    if (err) { toast({ title: 'Verifique o formulário', description: err, variant: 'destructive' }); return; }
    persist();
    const subject = encodeURIComponent(`Solicitação de acesso - ${form.contactName}`);
    const body = encodeURIComponent(buildBody());
    window.open(`mailto:${SITE.email}?subject=${subject}&body=${body}`);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Layout>
        <section className="py-20">
          <div className="container-moura max-w-lg text-center">
            <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
              <CheckCircle2 className="mx-auto mb-4 text-primary" size={48} />
              <h1 className="font-display text-2xl font-bold mb-3">Solicitação Recebida!</h1>
              <p className="text-muted-foreground mb-6">
                Analisaremos sua solicitação e, após a liberação, você receberá os dados de acesso via WhatsApp ou e-mail.
              </p>
              <Link to="/"><Button variant="cta">Voltar ao Site</Button></Link>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="py-16">
        <div className="container-moura max-w-2xl">
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2 text-center">Solicitar Acesso</h1>
          <p className="text-muted-foreground text-center mb-8">
            Preencha os dados abaixo para solicitar acesso à plataforma de orçamentos e pedidos.
          </p>

          <form onSubmit={submit} className="bg-card border border-border rounded-lg p-6 space-y-4 shadow-sm" noValidate>
            <div>
              <label className="text-sm font-medium">CNPJ <span className="text-destructive">*</span></label>
              <input required maxLength={18} className="w-full p-3 border border-border rounded-lg bg-input text-foreground mt-1" value={form.cnpj} onChange={e => upd('cnpj', formatCNPJMask(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="text-sm font-medium">Empresa <span className="text-destructive">*</span></label>
              <input required maxLength={200} className="w-full p-3 border border-border rounded-lg bg-input text-foreground mt-1" value={form.companyName} onChange={e => upd('companyName', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Nome do Responsável <span className="text-destructive">*</span></label>
              <input required maxLength={200} className="w-full p-3 border border-border rounded-lg bg-input text-foreground mt-1" value={form.contactName} onChange={e => upd('contactName', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">WhatsApp <span className="text-destructive">*</span></label>
              <input required maxLength={15} className="w-full p-3 border border-border rounded-lg bg-input text-foreground mt-1" value={form.whatsapp} onChange={e => upd('whatsapp', formatPhoneMask(e.target.value))} placeholder="(51) 99999-9999" />
            </div>
            <div>
              <label className="text-sm font-medium">E-mail <span className="text-destructive">*</span></label>
              <input required type="email" maxLength={200} className="w-full p-3 border border-border rounded-lg bg-input text-foreground mt-1" value={form.email} onChange={e => upd('email', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button type="submit" variant="cta" size="lg">
                <Send /> Solicitar Acesso
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={handleWhatsApp}>
                <MessageCircle /> Via WhatsApp
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={handleEmail}>
                <Mail /> Via E-mail
              </Button>
            </div>
          </form>

          <div className="mt-8 bg-muted/40 border border-border rounded-lg p-6">
            <h2 className="font-display text-lg font-bold mb-2">Como funciona</h2>
            <p className="text-sm text-muted-foreground">
              Analisaremos sua solicitação e, após a liberação, você receberá os dados de acesso via WhatsApp ou e-mail.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
