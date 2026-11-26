import { Layout } from '@/components/Layout';
import { ScrollReveal } from '@/components/ScrollReveal';

export default function About() {
  return (
    <Layout>
      <section className="py-20">
        <div className="container-moura max-w-4xl">
          <ScrollReveal>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6"><span className="text-gradient">Sobre a Moura Representações</span></h1>
          </ScrollReveal>

          <ScrollReveal>
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {[
                { icon: '🚀', title: 'Missão', text: 'Desenvolver distribuidores e revendedores por meio de uma representação comercial estratégica, integrando relacionamento, inteligência de mercado e tecnologia para gerar crescimento consistente e sustentável.' },
                { icon: '👁', title: 'Visão', text: 'Ser reconhecida como a principal estrutura de representação comercial B2B do Rio Grande do Sul, evoluindo continuamente em processos, tecnologia e gestão para liderar a transformação do mercado de distribuição e varejo.' },
                { icon: '💎', title: 'Valores', text: 'Valorizamos relacionamento, inteligência comercial e execução de excelência para gerar crescimento consistente e duradouro.' },
              ].map(item => (
                <div key={item.title} className="bg-card rounded-card border border-border p-6">
                  <span className="text-2xl mb-2 block">{item.icon}</span>
                  <h3 className="font-display font-semibold text-primary text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="bg-card rounded-card border border-border p-8">
              <h2 className="font-display text-2xl font-bold mb-4">Nossa História</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                A Moura Representações Comerciais nasceu com o propósito de fortalecer distribuidores e revendedores por meio de uma atuação comercial próxima, dedicada e orientada a resultados.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Com 6 anos de atuação no mercado B2B do Rio Grande do Sul, construímos nossa trajetória com base em relacionamento, confiança e presença constante junto aos nossos parceiros. Acreditamos que representar vai muito além de intermediar negócios — é entender as necessidades de cada cliente, acompanhar de perto seus desafios e trabalhar diariamente para gerar crescimento real.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Nosso compromisso é estar ao lado do distribuidor e do revendedor em cada etapa do processo, oferecendo suporte, agilidade e clareza nas negociações. Valorizamos o diálogo aberto, o pós-venda ativo e a construção de parcerias duradouras, porque entendemos que resultados consistentes nascem de relações sólidas.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </Layout>
  );
}
