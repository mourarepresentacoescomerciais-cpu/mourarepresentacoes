import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NAV_LINKS } from '@/lib/constants';

export function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 glass-header">
      <div className="container-moura flex items-center justify-between h-18">

        <Link to="/" className="flex items-center gap-2">
          <img src="/logo-white.png" alt="Moura Representações" className="h-10" loading="lazy" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Navegação principal">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              to={link.href}
              className={`text-sm font-medium animated-underline transition-colors ${
                pathname === link.href ? 'text-primary' : 'text-foreground/80 hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Link to="/login">
            <Button variant="outline-light" size="sm">Área do Cliente</Button>
          </Link>
          <Link to="/solicitar-orcamento" data-cta="header">
            <Button variant="cta" size="default">Solicitar Acesso</Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden p-2 text-foreground"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="lg:hidden bg-background border-t border-border py-4 animate-fade-in-up" aria-label="Menu mobile">
          <div className="container-moura flex flex-col gap-3">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setOpen(false)}
                className={`py-2 text-base font-medium ${pathname === link.href ? 'text-primary' : 'text-foreground/80'}`}
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-border" />
            <Link to="/login" onClick={() => setOpen(false)}>
              <Button variant="outline-light" className="w-full">Área do Cliente</Button>
            </Link>
            <Link to="/solicitar-orcamento" onClick={() => setOpen(false)} data-cta="header-mobile">
              <Button variant="cta" className="w-full">Solicitar Acesso</Button>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
