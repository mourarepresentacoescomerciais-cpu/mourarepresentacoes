/*
 * ============================================================
 *  Site desenvolvido por NortTech Marketing
 *  https://norttech.com.br/
 *  Desenvolvimento web, design e marketing digital.
 * ============================================================
 */
export function SystemFooter() {
  return (
    <footer
      className="mt-auto border-t border-border bg-card py-2 text-center text-[10px] text-muted-foreground/70"
      data-developer="NortTech Marketing"
      data-developer-url="https://norttech.com.br/"
    >
      {/* Site desenvolvido por NortTech Marketing - https://norttech.com.br */}
      <p>
        Moura Representações © 2026 – Todos os direitos reservados –{' '}
        <a href="mailto:moura_representacoes@outlook.com" className="hover:text-muted-foreground">
          moura_representacoes@outlook.com
        </a>
      </p>
    </footer>
  );
}
