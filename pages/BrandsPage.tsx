import { Layout } from '@/components/Layout';
import { ScrollReveal } from '@/components/ScrollReveal';
import { BRANDS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import clawLogo from '@/assets/brands/claw.png';
import plaspolLogo from '@/assets/brands/plaspol.png';
import ilumiLogo from '@/assets/brands/ilumi.png';
import cortagLogo from '@/assets/brands/cortag.png';

const brandLogos: Record<string, string> = {
  claw: clawLogo,
  plaspol: plaspolLogo,
  ilumi: ilumiLogo,
  cortag: cortagLogo,
};

export default function BrandsPage() {
  return (
    <Layout>
      <section className="py-20">
        <div className="container-moura">
          <ScrollReveal>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4 text-center"><span className="text-gradient">Nossas Representadas</span></h1>
            <p className="text-lg text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Trabalhamos exclusivamente com marcas que compartilham nosso compromisso com qualidade, inovação e suporte real aos nossos parceiros.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            {BRANDS.map((brand) => (
              <ScrollReveal key={brand.logo}>
                <div className="bg-card rounded-card border border-border p-4 sm:p-8 flex items-center justify-center card-hover min-h-[120px] sm:min-h-[140px]">
                  <img src={brandLogos[brand.logo]} alt={brand.name} className="max-h-20 max-w-full object-contain" loading="lazy" />
                </div>
              </ScrollReveal>
            ))}
          </div>

          <div className="text-center" data-cta="brands-page">
            <Link to="/contato"><Button variant="cta" size="lg">Quero Trabalhar com Essas Marcas</Button></Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
