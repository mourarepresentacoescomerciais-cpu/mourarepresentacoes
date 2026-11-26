import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { hasError: boolean; errorMessage?: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Erro inesperado na tela.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app error boundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-semibold">A tela encontrou um erro</h1>
            <p className="text-sm text-muted-foreground mt-2">
              O sistema segurou a falha para evitar tela preta. Você pode tentar voltar para a tela anterior.
            </p>
          </div>
          {this.state.errorMessage && (
            <p className="text-xs rounded border border-border bg-muted p-3 text-muted-foreground break-words">
              {this.state.errorMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="cta" onClick={() => this.setState({ hasError: false, errorMessage: undefined })}>
              Tentar novamente
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.assign('/')}>
              Voltar ao início
            </Button>
          </div>
        </section>
      </main>
    );
  }
}