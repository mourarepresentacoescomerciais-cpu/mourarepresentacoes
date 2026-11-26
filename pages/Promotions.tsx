import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { launchService } from '@/lib/launchService';
import { categoryService } from '@/lib/categoryService';
import { DATA_READY_EVENT } from '@/lib/dataStore';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import type { LaunchImage } from '@/lib/types';
import cortagLogo from '@/assets/launch-brands/cortag-white.png';
import ilumiLogo from '@/assets/launch-brands/ilumi-white.png';
import clawLogo from '@/assets/launch-brands/claw-white.png';
import plaspolLogo from '@/assets/launch-brands/plaspol-white.png';

const AUTOPLAY_MS = 5200;

const BRAND_LOGOS = [
  { match: 'cortag', name: 'Cortag', url: cortagLogo },
  { match: 'ilumi', name: 'Ilumi', url: ilumiLogo },
  { match: 'claw', name: 'Claw Motobombas', url: clawLogo },
  { match: 'plaspol', name: 'Plaspol', url: plaspolLogo },
];

const normalizeBrand = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

const getBrandLogo = (brand: string) =>
  BRAND_LOGOS.find(({ match }) => normalizeBrand(brand).includes(match));

const sortBrands = (brands: string[]) => [...brands].sort((a, b) => {
  const aIndex = BRAND_LOGOS.findIndex(({ match }) => normalizeBrand(a).includes(match));
  const bIndex = BRAND_LOGOS.findIndex(({ match }) => normalizeBrand(b).includes(match));
  return (aIndex < 0 ? BRAND_LOGOS.length : aIndex) - (bIndex < 0 ? BRAND_LOGOS.length : bIndex);
});

function FlyerLightbox({ flyers, startIndex, onClose }: { flyers: LaunchImage[]; startIndex: number; onClose: () => void }) {
  const [current, setCurrent] = useState(startIndex);
  const total = flyers.length;

  const goTo = useCallback((i: number) => setCurrent(((i % total) + total) % total), [total]);
  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const prev = useCallback(() => goTo(current - 1), [goTo, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center" onClick={onClose}>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
        aria-label="Fechar"
      >
        <X size={24} />
      </button>

      {total > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-primary text-white flex items-center justify-center transition"
            aria-label="Anterior">
            <ChevronLeft size={28} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-primary text-white flex items-center justify-center transition"
            aria-label="Próximo">
            <ChevronRight size={28} />
          </button>
        </>
      )}

      <div className="relative flex flex-col items-center gap-3 px-4" onClick={(e) => e.stopPropagation()}>
        <img
          key={flyers[current].id}
          src={flyers[current].imageUrl}
          alt={flyers[current].title || 'Lançamento'}
          className="max-h-[82vh] max-w-full object-contain drop-shadow-2xl animate-fade-in"
        />
        {flyers[current].title && (
          <div className="text-center text-white">
            <span className="inline-block px-3 py-1 bg-primary/90 text-primary-foreground text-[10px] font-semibold rounded-full uppercase tracking-wider mb-1">
              {flyers[current].brand || 'Lançamento'}
            </span>
            <p className="font-display text-xl md:text-2xl font-bold">{flyers[current].title}</p>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-10">
        {flyers.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); goTo(i); }}
            className={`h-2 rounded-full transition-all ${i === current ? 'w-8 bg-primary' : 'w-2 bg-white/40 hover:bg-white/70'}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Promotions() {
  const [allLaunches, setAllLaunches] = useState<LaunchImage[]>(() => launchService.getAll());
  const [BRANDS, setBRANDS] = useState<string[]>(() => sortBrands(categoryService.getCompanies().filter(c => categoryService.isCompanyActive(c))));
  const [activeBrand, setActiveBrand] = useState<string>(BRANDS[0] ?? '');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0); // reinicia a barra de progresso
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setAllLaunches(launchService.getAll());
      setBRANDS(sortBrands(categoryService.getCompanies().filter(c => categoryService.isCompanyActive(c))));
    };
    refresh();
    window.addEventListener(DATA_READY_EVENT, refresh);
    return () => window.removeEventListener(DATA_READY_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (BRANDS.length && !BRANDS.includes(activeBrand)) setActiveBrand(BRANDS[0]);
  }, [BRANDS, activeBrand]);

  const byBrand = useMemo(() => {
    const map: Record<string, LaunchImage[]> = {};
    BRANDS.forEach(b => { map[b] = []; });
    allLaunches.forEach(l => {
      const b = (l.brand || '').trim();
      if (b && map[b]) map[b].push(l);
      else if (!b) BRANDS.forEach(br => map[br].push(l));
    });
    return map;
  }, [allLaunches, BRANDS]);

  const flyers = byBrand[activeBrand] || [];
  const total = flyers.length;

  const goTo = useCallback((i: number) => {
    if (total === 0) return;
    setCarouselIndex(((i % total) + total) % total);
    setCycle(c => c + 1);
  }, [total]);
  const next = useCallback(() => goTo(carouselIndex + 1), [goTo, carouselIndex]);
  const prev = useCallback(() => goTo(carouselIndex - 1), [goTo, carouselIndex]);

  useEffect(() => { setCarouselIndex(0); setCycle(c => c + 1); }, [activeBrand]);

  // Autoplay cinematográfico
  useEffect(() => {
    if (paused || total <= 1 || lightboxIndex !== null) return;
    const t = setTimeout(() => setCarouselIndex(i => (i + 1) % total), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [carouselIndex, paused, total, lightboxIndex, cycle]);

  // Navegação por teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIndex !== null) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, lightboxIndex]);

  const current = flyers[carouselIndex];

  // Posição relativa de cada flyer no coverflow (-2..2 visíveis)
  const slotFor = (i: number) => {
    if (total === 0) return 0;
    let d = i - carouselIndex;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  };

  return (
    <Layout>
      <section className="relative overflow-hidden launch-stage">
        {/* Luzes de palco */}
        <div className="launch-spotlight launch-spotlight-left" />
        <div className="launch-spotlight launch-spotlight-right" />
        <div className="launch-floor-glow" />

        {/* Texto gigante de fundo */}
        <div aria-hidden="true" className="launch-backdrop-text font-display">
          LANÇA&shy;MENTOS
        </div>

        <div className="container-moura relative z-10 pt-16 pb-20">
          {/* Cabeçalho */}
          <div className="text-center mb-7">
            <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-none">
              <span className="text-gradient launch-title-shimmer">Lançamentos</span>
            </h1>
          </div>

          {/* Seletor de marcas */}
          <div className="launch-brand-selector mb-8" role="tablist" aria-label="Marcas">
            {BRANDS.map((brand) => {
              const isActive = brand === activeBrand;
              const logo = getBrandLogo(brand);
              return (
                <button
                  key={brand}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveBrand(brand)}
                  className={`launch-brand-logo ${isActive ? 'launch-brand-logo-active' : ''}`}
                  aria-label={`Ver lançamentos ${brand}`}
                >
                  {logo ? (
                    <img src={logo.url} alt={logo.name} />
                  ) : (
                    <span className="font-display font-bold text-foreground">{brand}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Palco 3D */}
          <div
            className="relative h-[440px] md:h-[540px] select-none launch-perspective"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; setPaused(true); }}
            onTouchEnd={(e) => {
              if (touchStartX.current != null) {
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 50) (dx < 0 ? next() : prev());
                touchStartX.current = null;
              }
              setPaused(false);
            }}
          >
            {total === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center py-16 px-10 border border-dashed border-border rounded-card glass-card">
                  <Sparkles size={32} className="mx-auto mb-4 text-primary opacity-70" />
                  <p className="text-foreground text-lg mb-1 font-display font-semibold">Nenhum lançamento para {activeBrand}</p>
                  <p className="text-muted-foreground text-sm">Em breve novidades desta marca.</p>
                </div>
              </div>
            ) : (
              <>
                {flyers.map((flyer, i) => {
                  const slot = slotFor(i);
                  const abs = Math.abs(slot);
                  if (abs > 2) return null;
                  const isCurrent = slot === 0;
                  return (
                    <button
                      key={flyer.id}
                      onClick={() => (isCurrent ? setLightboxIndex(carouselIndex) : goTo(i))}
                      className="absolute left-1/2 top-1/2 h-[88%] aspect-[3/4] rounded-card overflow-hidden border transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        transform: `translate(-50%, -50%) translateX(${slot * 62}%) scale(${isCurrent ? 1 : 1 - abs * 0.16}) rotateY(${slot * -28}deg) translateZ(${-abs * 120}px)`,
                        zIndex: 30 - abs * 10,
                        opacity: isCurrent ? 1 : 0.55 - abs * 0.12,
                        borderColor: isCurrent ? 'hsla(33, 93%, 54%, 0.5)' : 'hsl(var(--border))',
                        boxShadow: isCurrent
                          ? '0 30px 80px -20px hsla(33, 93%, 54%, 0.45), 0 12px 40px rgba(0,0,0,0.55)'
                          : '0 12px 32px rgba(0,0,0,0.45)',
                        filter: isCurrent ? 'none' : `brightness(${0.75 - abs * 0.1}) saturate(0.85)`,
                      }}
                      aria-label={isCurrent ? `Abrir ${flyer.title || 'lançamento'}` : `Ver ${flyer.title || 'lançamento'}`}
                    >
                      <img
                        src={flyer.imageUrl}
                        alt={flyer.title || 'Flyer de lançamento'}
                        className="w-full h-full object-contain bg-white"
                        loading={abs === 0 ? 'eager' : 'lazy'}
                      />
                      {isCurrent && <span className="launch-card-sheen" aria-hidden="true" />}
                      {isCurrent && (
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary-foreground launch-badge-pulse" style={{ background: 'var(--gradient-primary)' }}>
                          Novo
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Setas */}
                {total > 1 && (
                  <>
                    <button
                      onClick={prev}
                      className="absolute left-1 md:left-6 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full glass-card hover:scale-110 text-foreground flex items-center justify-center transition-all duration-300 border border-border hover:border-primary/50 launch-arrow-glow"
                      aria-label="Anterior"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      onClick={next}
                      className="absolute right-1 md:right-6 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full glass-card hover:scale-110 text-foreground flex items-center justify-center transition-all duration-300 border border-border hover:border-primary/50 launch-arrow-glow"
                      aria-label="Próximo"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Legenda + progresso */}
          {total > 0 && current && (
            <div className="mt-8 flex flex-col items-center gap-4" key={`caption-${current.id}`}>
              <div className="text-center animate-fade-in">
                <span className="inline-block px-3 py-1 bg-primary/15 text-primary border border-primary/30 text-[10px] font-bold rounded-full uppercase tracking-[0.14em] mb-2">
                  {current.brand || activeBrand}
                </span>
                {current.title && (
                  <p className="font-display text-xl md:text-2xl font-bold text-foreground">{current.title}</p>
                )}
                {current.description && (
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg mx-auto">{current.description}</p>
                )}
              </div>

              {total > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-display font-bold text-primary tabular-nums">
                    {String(carouselIndex + 1).padStart(2, '0')}
                  </span>
                  <div className="flex gap-1.5">
                    {flyers.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i)}
                        className="relative h-1.5 rounded-full overflow-hidden bg-muted transition-all duration-500"
                        style={{ width: i === carouselIndex ? 48 : 12 }}
                        aria-label={`Slide ${i + 1}`}
                      >
                        {i === carouselIndex && (
                          <span
                            key={cycle}
                            className="absolute inset-y-0 left-0 rounded-full launch-progress-fill"
                            style={{
                              background: 'var(--gradient-primary)',
                              animationDuration: `${AUTOPLAY_MS}ms`,
                              animationPlayState: paused ? 'paused' : 'running',
                            }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-display font-bold text-muted-foreground tabular-nums">
                    {String(total).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>

        {lightboxIndex !== null && flyers.length > 0 && (
          <FlyerLightbox
            flyers={flyers}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </section>
    </Layout>
  );
}
