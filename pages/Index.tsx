import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/ScrollReveal';
import { COPY, SITE, BRANDS } from '@/lib/constants';
import heroBg from '@/assets/hero-bg.jpg';
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

export default function Index() {
  return (
    <div>
      {/* HERO */}
      <section
        className="relative min-h-[92vh] flex items-center overflow-hidden hero-bg-animated"
        data-cta="hero"
        style={{ ['--hero-bg-url' as any]: `url(${heroBg})` }}
      >
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover scale-105" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
          <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
        </div>
        
        <div className="bg-blob animate-blob float-soft hidden sm:block" style={{ width: 'min(400px, 60vw)', height: 'min(400px, 60vw)', background: 'hsla(28, 90%, 46%, 0.18)', bottom: '5%', right: '5%', animationDelay: '4s' }} />
        <div className="container-moura relative z-10 py-20">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 glass-card rounded-full text-xs font-semibold text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              🏆 Referência em Representação Comercial B2B
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight max-w-[22ch]">
              <span className="text-foreground">{COPY.hero.titleLine1}</span><br />
              <span className="text-gradient">{COPY.hero.titleLine2}</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
              {COPY.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link to="/contato" data-cta="hero-main">
                <Button variant="cta" size="xl" className="btn-lift">{COPY.hero.cta}</Button>
              </Link>
              <Link to="/representadas">
                <Button variant="outline-light" size="lg" className="btn-lift">Conheça as Marcas</Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">{COPY.hero.ctaMicro}</p>
          </div>
        </div>
      </section>

      <hr className="gradient-divider" />

      {/* SLOGAN */}
      <section className="py-12 bg-card">
        <div className="container-moura">
          <ScrollReveal>
            <blockquote className="text-center text-lg md:text-xl italic text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              "{SITE.slogan}"
            </blockquote>
          </ScrollReveal>
        </div>
      </section>





      <hr className="gradient-divider" />

      {/* SOLUTION / VIRADA */}
      <section className="py-24 relative overflow-hidden" data-cta="solution">
        <div className="bg-blob" style={{ width: 600, height: 600, background: 'hsla(33, 93%, 54%, 0.06)', top: '20%', left: '50%', transform: 'translateX(-50%)' }} />
        <div className="container-moura relative z-10">
          <ScrollReveal>
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-5 tracking-tight">
                <span className="text-gradient">{COPY.solution.title}</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">{COPY.solution.subtitle}</p>
            </div>
            <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-16 leading-relaxed">{COPY.solution.mechanism}</p>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {COPY.solution.steps.map((step, i) => (
              <ScrollReveal key={i}>
                <div className="relative glass-card rounded-2xl p-7 text-center card-hover h-full">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-display font-bold text-xl mx-auto mb-5 text-primary-foreground shadow-lg" style={{ background: 'var(--gradient-primary)', boxShadow: '0 10px 24px -8px hsla(33, 93%, 54%, 0.5)' }}>{step.number}</div>
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* MARQUEE — frase de relacionamento */}
      <section aria-label="Faixa rolante" className="py-4 overflow-hidden border-y border-[#d97e0a]" style={{ background: 'var(--gradient-primary, linear-gradient(90deg, #f7941d, #e8830a))' }}>
        <div className="marquee-content whitespace-nowrap text-white uppercase tracking-[0.18em] text-sm md:text-base font-semibold">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="inline-flex items-center gap-6 px-6">
              <span>Moura Representações - Sua Plataforma B2B.</span>
              <span className="text-white">✦</span>
              <span className="opacity-70">•</span>
            </span>
          ))}
        </div>
      </section>

      {/* BRANDS WITH LOGOS */}
      <section className="py-20 relative" data-cta="brands">
        <div className="container-moura mb-10">
          <ScrollReveal>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-center mb-3 tracking-tight">
              <span className="text-gradient">{COPY.brands.title}</span>
            </h2>
            <p className="text-center text-muted-foreground text-lg">{COPY.brands.subtitle}</p>
          </ScrollReveal>
        </div>
        <div className="container-moura">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {BRANDS.map((brand) => (
              <ScrollReveal key={brand.logo}>
                <div className="glass-card rounded-2xl p-8 flex items-center justify-center card-hover tilt-3d min-h-[140px]">
                  <img src={brandLogos[brand.logo]} alt={brand.name} className="max-h-16 max-w-full object-contain glow-ring" loading="lazy" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Mid */}
      <section className="py-14" data-cta="mid2">
        <div className="container-moura text-center">
          <ScrollReveal>
            <p className="text-xl font-medium mb-5 text-foreground">Quer trabalhar com essas marcas?</p>
            <Link to="/contato"><Button variant="cta" size="lg">Entrar em Contato</Button></Link>
          </ScrollReveal>
        </div>
      </section>

      <hr className="gradient-divider" />

      {/* DIFFERENTIALS */}
      <section className="py-24 relative overflow-hidden" data-cta="differentials">
        <div className="bg-blob animate-blob" style={{ width: 500, height: 500, background: 'hsla(33, 93%, 54%, 0.08)', top: '0%', right: '-10%' }} />
        <div className="container-moura relative z-10">
          <ScrollReveal>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-center mb-16 tracking-tight">
              <span className="text-gradient">{COPY.differentials.title}</span>
            </h2>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {COPY.differentials.items.map((item, i) => (
              <ScrollReveal key={i}>
                <div className="relative glass-card rounded-2xl p-7 card-hover premium-glow h-full">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 text-2xl" style={{ background: 'hsla(33, 93%, 54%, 0.12)', border: '1px solid hsla(33, 93%, 54%, 0.25)' }}>
                    {item.icon}
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <hr className="gradient-divider" />

      {/* FINAL CTA */}
      <section className="py-24 relative overflow-hidden" data-cta="final">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-primary/5" />
        <div className="bg-blob animate-blob float-soft-slow" style={{ width: 600, height: 600, background: 'hsla(33, 93%, 54%, 0.18)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div className="container-moura relative z-10 text-center">
          <ScrollReveal>
            <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-tight leading-tight">
              <span className="text-gradient">{COPY.finalCta.title}</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">{COPY.finalCta.subtitle}</p>
            <div className="flex justify-center">
              <Link to="/contato" data-cta="final-main">
                <Button variant="cta" size="xl">Entrar em Contato</Button>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

    </div>
  );
}
