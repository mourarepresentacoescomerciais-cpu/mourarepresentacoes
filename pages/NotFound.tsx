import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <section className="min-h-[70vh] flex items-center justify-center py-20">
        <div className="container-moura text-center max-w-2xl">
          <div className="text-[120px] md:text-[180px] font-display font-extrabold leading-none text-gradient">
            404
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-2 mb-3 text-foreground">
            Página não encontrada
          </h1>
          <p className="text-muted-foreground mb-2">
            A página que você tentou acessar não existe ou foi movida.
          </p>
          <p className="text-sm text-muted-foreground/80 mb-8 break-all">
            <code className="bg-muted px-2 py-1 rounded">{location.pathname}</code>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline-light" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Link to="/">
              <Button variant="cta">
                <Home className="w-4 h-4 mr-2" />
                Ir para a página inicial
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default NotFound;
