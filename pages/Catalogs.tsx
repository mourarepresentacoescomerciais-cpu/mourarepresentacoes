import { Layout } from '@/components/Layout';
import { ScrollReveal } from '@/components/ScrollReveal';
import { catalogService, catalogCoverThumb } from '@/lib/catalogService';
import { DATA_READY_EVENT } from '@/lib/dataStore';
import { useEffect, useState } from 'react';

export default function Catalogs() {
  const [catalogs, setCatalogs] = useState(() => catalogService.getActive());

  // Os catálogos chegam de forma assíncrona (Supabase). Reatualizamos a lista
  // quando o carregamento termina, para que catálogos recém-cadastrados no
  // admin apareçam sem precisar recarregar a página.
  useEffect(() => {
    const refresh = () => setCatalogs(catalogService.getActive());
    refresh();
    window.addEventListener(DATA_READY_EVENT, refresh);
    return () => window.removeEventListener(DATA_READY_EVENT, refresh);
  }, []);

  return (
    <Layout>
      <section className="py-20">
        <div className="container-moura">
          <ScrollReveal>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4 text-center"><span className="text-gradient">Catálogos</span></h1>
            <p className="text-lg text-muted-foreground text-center mb-12">Baixe os catálogos atualizados das nossas representadas.</p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {catalogs.map((catalog) => (
              <ScrollReveal key={catalog.id}>
                <div className="bg-card rounded-card border border-border overflow-hidden card-hover tilt-3d group shadow-sm hover:shadow-lg transition-shadow">
                  <div className="aspect-[3/4] overflow-hidden bg-muted">
                    <img
                      src={catalogCoverThumb(catalog.coverImage)}
                      alt={`Catálogo ${catalog.title}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-muted"><span class="text-4xl">📄</span></div>`;
                      }}
                    />
                  </div>
                  <div className="p-5 space-y-3">
                    <h3 className="font-display font-semibold text-lg">{catalog.title}</h3>
                    <a
                      href={catalog.pdfUrl}
                      download={`catalogo-${catalog.brand}.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all w-full justify-center"
                    >
                      BAIXAR
                    </a>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
