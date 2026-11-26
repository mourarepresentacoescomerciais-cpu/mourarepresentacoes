import { Layout } from '@/components/Layout';
import { SITE } from '@/lib/constants';

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Layout>
      <section className="py-20">
        <div className="container-moura max-w-3xl">
          <h1 className="font-display text-4xl font-bold mb-8">{title}</h1>
          <div className="prose prose-invert max-w-none space-y-4 text-muted-foreground text-sm leading-relaxed">
            {children}
          </div>
        </div>
      </section>
    </Layout>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>A Moura Representações ({SITE.email}) valoriza a privacidade dos seus visitantes e clientes. Esta política descreve como coletamos, usamos e protegemos suas informações pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Dados Coletados</h2>
      <p>Coletamos apenas dados fornecidos voluntariamente por você através de formulários de contato: nome, telefone, e-mail, empresa e mensagem. Não coletamos dados sensíveis.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Finalidade</h2>
      <p>Os dados são utilizados exclusivamente para responder solicitações de contato e orçamento, gerenciar a relação comercial B2B e enviar comunicações relevantes ao seu negócio.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Compartilhamento</h2>
      <p>Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros, exceto quando necessário para cumprimento de obrigação legal.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Seus Direitos</h2>
      <p>Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento através do e-mail {SITE.email}.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Cookies</h2>
      <p>Utilizamos cookies essenciais para o funcionamento do site e cookies analíticos para melhorar sua experiência. Você pode gerenciar suas preferências de cookies através do seu navegador.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Termos de Uso">
      <p>Ao acessar e utilizar o site da Moura Representações, você concorda com os seguintes termos:</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Uso do Site</h2>
      <p>O conteúdo deste site é destinado a fins informativos e comerciais B2B. É vedada a reprodução não autorizada do conteúdo.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Área Restrita</h2>
      <p>O acesso ao sistema B2B é restrito a distribuidores cadastrados. O compartilhamento de credenciais é proibido. O acesso pode ser revogado a qualquer momento pela administração.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Preços e Pedidos</h2>
      <p>Preços exibidos no sistema são referência e podem sofrer alterações. Pedidos gerados pelo sistema são solicitações de orçamento e não configuram venda até confirmação formal.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Responsabilidade</h2>
      <p>A Moura Representações não se responsabiliza por interrupções no serviço, erros de precificação ou indisponibilidade temporária do sistema.</p>
    </LegalPage>
  );
}

export function CookiePolicy() {
  return (
    <LegalPage title="Aviso de Cookies">
      <p>Este site utiliza cookies para proporcionar a melhor experiência ao visitante.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">O que são cookies?</h2>
      <p>Cookies são pequenos arquivos de texto armazenados no seu navegador que permitem ao site lembrar suas preferências e melhorar sua experiência de navegação.</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Tipos de cookies utilizados</h2>
      <p><strong>Essenciais:</strong> Necessários para o funcionamento básico do site, como autenticação na área restrita.</p>
      <p><strong>Analíticos:</strong> Nos ajudam a entender como os visitantes interagem com o site (Google Analytics).</p>
      <h2 className="font-display font-semibold text-foreground text-lg mt-6">Gerenciamento</h2>
      <p>Você pode configurar seu navegador para recusar cookies. Isso pode afetar a funcionalidade de algumas áreas do site. Para mais informações, consulte nossa Política de Privacidade.</p>
    </LegalPage>
  );
}
