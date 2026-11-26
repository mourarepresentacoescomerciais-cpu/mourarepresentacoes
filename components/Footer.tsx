import { Link } from 'react-router-dom';
import { SITE, NAV_LINKS } from '@/lib/constants';
import { Mail, MessageCircle, Clock } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative bg-gradient-to-b from-card to-background border-t border-border/60 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="bg-blob animate-blob" style={{ width: 400, height: 400, background: 'hsla(33, 93%, 54%, 0.08)', top: -100, right: -100 }} />
      <div className="container-moura py-16 relative z-10">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo & Slogan */}
          <div className="space-y-4">
            <img src="/logo-white.png" alt="Moura Representações" className="h-12" loading="lazy" />
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "{SITE.slogan}"
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-4 text-foreground">Navegação</h4>
            <nav className="flex flex-col gap-2">
              {NAV_LINKS.map(link => (
                <Link key={link.href} to={link.href} className="text-sm text-muted-foreground hover:text-primary animated-underline w-fit">
                  {link.label}
                </Link>
              ))}
              <Link to="/login" className="text-sm text-muted-foreground hover:text-primary animated-underline w-fit">Área do Cliente</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-4 text-foreground">Contato</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a href={`mailto:${SITE.email}`} className="hover:text-primary inline-flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" /> {SITE.email}
              </a>
              <a href={`https://api.whatsapp.com/send?phone=${SITE.phone}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-2">
                <MessageCircle className="w-4 h-4 shrink-0" /> {SITE.phoneFormatted}
              </a>
              <p className="inline-flex items-center gap-2"><Clock className="w-4 h-4 shrink-0" /> {SITE.hours}</p>
            </div>
          </div>

          {/* Legal & Social */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-4 text-foreground">Legal</h4>
            <nav className="flex flex-col gap-2 mb-4">
              <Link to="/privacidade" className="text-sm text-muted-foreground hover:text-primary">Política de Privacidade</Link>
              <Link to="/termos" className="text-sm text-muted-foreground hover:text-primary">Termos de Uso</Link>
              <Link to="/cookies" className="text-sm text-muted-foreground hover:text-primary">Aviso de Cookies</Link>
            </nav>
            <div className="flex gap-3">
              <a href={SITE.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href={SITE.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border py-2">
        {/* Site desenvolvido por NortTech Marketing - https://norttech.com.br */}
        <div className="container-moura text-center text-[10px] text-muted-foreground/70 space-y-0.5">
          <p>Moura Representações © 2026 – Todos os direitos reservados – {SITE.email}</p>
        </div>
      </div>
    </footer>
  );
}
