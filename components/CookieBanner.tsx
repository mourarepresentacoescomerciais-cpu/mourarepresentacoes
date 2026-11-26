import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('moura_cookie_choice')) {
      setTimeout(() => setShow(true), 1500);
    }
  }, []);

  if (!show) return null;

  const saveChoice = (choice: 'accepted' | 'declined') => {
    localStorage.setItem('moura_cookie_choice', choice);
    localStorage.setItem('moura_cookies_accepted', choice === 'accepted' ? 'true' : 'false');
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-6 z-50 animate-fade-in-up">
      <div className="glass-card rounded-2xl px-5 py-4 sm:px-7 sm:py-5 max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-4">
        <p className="text-sm text-muted-foreground flex-1 leading-relaxed">
          Utilizamos cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa{' '}
          <a href="/privacidade" className="text-primary animated-underline font-medium">Política de Privacidade</a>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="cta" size="sm" onClick={() => saveChoice('accepted')}>Aceitar</Button>
          <Button variant="ghost" size="sm" onClick={() => saveChoice('declined')}>Recusar</Button>
        </div>
      </div>
    </div>
  );
}
