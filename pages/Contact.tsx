import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { ScrollReveal } from '@/components/ScrollReveal';
import { Button } from '@/components/ui/button';
import { SITE } from '@/lib/constants';
import { formatCNPJMask, formatPhoneMask, isValidCNPJ, isValidPhone, isValidEmail } from '@/lib/formatters';
import { toast } from '@/hooks/use-toast';
import { contactService } from '@/lib/contactService';
import { MessageCircle, Mail, CheckCircle2 } from 'lucide-react';

export default function Contact() {
  const [form, setForm] = useState({ cnpj: '', empresa: '', nome: '', whatsapp: '', email: '', mensagem: '' });
  const [submitted, setSubmitted] = useState(false);
  const upd = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const validate = (): string | null => {
    if (!form.cnpj.trim() || !form.empresa.trim() || !form.nome.trim() || !form.whatsapp.trim() || !form.email.trim() || !form.mensagem.trim()) {
      return 'Preencha todos os campos obrigatórios.';
    }
    if (!isValidCNPJ(form.cnpj)) return 'CNPJ inválido. Informe os 14 dígitos.';
    if (!isValidPhone(form.whatsapp)) return 'WhatsApp inválido. Use (00) 00000-0000.';
    if (!isValidEmail(form.email)) return 'E-mail inválido.';
    if (form.nome.trim().length < 2) return 'Informe um nome válido.';
    if (form.empresa.trim().length < 2) return 'Informe o nome da empresa.';
    if (form.mensagem.trim().length < 5) return 'Escreva uma mensagem mais detalhada.';
    return null;
  };

  const buildBody = () =>
    `Olá! Vim do site e gostaria de atendimento.\n\nCNPJ: ${form.cnpj}\nEmpresa: ${form.empresa}\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}\nE-mail: ${form.email}\nMensagem: ${form.mensagem}`;

  const persistAndOpen = (kind: 'whatsapp' | 'email') => {
    const err = validate();
    if (err) { toast({ title: 'Verifique o formulário', description: err, variant: 'destructive' }); return; }
    contactService.add({ ...form });
    setSubmitted(true);
    toast({ title: 'Mensagem enviada!', description: 'Em breve entraremos em contato.' });
    if (kind === 'whatsapp') {
      window.open(`${SITE.whatsappUrl}&text=${encodeURIComponent(buildBody())}`, '_blank');
    } else {
      const subject = encodeURIComponent(`Contato do site - ${form.nome}`);
      const body = encodeURIComponent(buildBody());
      window.open(`mailto:${SITE.email}?subject=${subject}&body=${body}`);
    }
  };

  if (submitted) {
    return (
      <Layout>
        <section className="py-20">
          <div className="container-moura max-w-lg text-center">
            <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
              <CheckCircle2 className="mx-auto mb-4 text-primary" size={48} />
              <h1 className="font-display text-2xl font-bold mb-3">Mensagem Recebida!</h1>
              <p className="text-muted-foreground mb-6">Sua mensagem foi recebida com sucesso. Em breve entraremos em contato.</p>
              <Button variant="cta" onClick={() => { setSubmitted(false); setForm({ cnpj: '', empresa: '', nome: '', whatsapp: '', email: '', mensagem: '' }); }}>Enviar nova mensagem</Button>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="py-20">
        <div className="container-moura max-w-xl">
          <ScrollReveal>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4 text-center"><span className="text-gradient">Fale Conosco</span></h1>
            <p className="text-lg text-muted-foreground text-center mb-12">Solicite um orçamento ou tire suas dúvidas. Respondemos em até 24h úteis.</p>
          </ScrollReveal>

          <ScrollReveal>
            <form onSubmit={(e) => { e.preventDefault(); persistAndOpen('whatsapp'); }} className="bg-card rounded-card border border-border p-6 space-y-4" data-cta="contact-form" noValidate>
              <div>
                <label className="text-sm font-medium mb-1 block">CNPJ <span className="text-destructive">*</span></label>
                <input type="text" required value={form.cnpj} onChange={e => upd('cnpj', formatCNPJMask(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" maxLength={18} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Empresa <span className="text-destructive">*</span></label>
                <input type="text" required value={form.empresa} onChange={e => upd('empresa', e.target.value)}
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" maxLength={200} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nome <span className="text-destructive">*</span></label>
                <input type="text" required value={form.nome} onChange={e => upd('nome', e.target.value)}
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" maxLength={200} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">WhatsApp <span className="text-destructive">*</span></label>
                <input type="tel" required value={form.whatsapp} onChange={e => upd('whatsapp', formatPhoneMask(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" maxLength={15} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">E-mail <span className="text-destructive">*</span></label>
                <input type="email" required value={form.email} onChange={e => upd('email', e.target.value)}
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none" maxLength={200} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Mensagem <span className="text-destructive">*</span></label>
                <textarea required value={form.mensagem} onChange={e => upd('mensagem', e.target.value)}
                  className="w-full p-3 bg-input border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:outline-none min-h-[100px]" maxLength={1000} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="cta" size="lg" className="flex-1">
                  <MessageCircle /> Enviar via WhatsApp
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => persistAndOpen('email')}>
                  <Mail /> E-mail
                </Button>
              </div>
            </form>
          </ScrollReveal>
        </div>
      </section>
    </Layout>
  );
}
