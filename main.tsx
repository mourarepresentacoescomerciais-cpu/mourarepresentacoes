/*
 * ============================================================
 *  Moura Representações
 *  Site desenvolvido por NortTech Marketing
 *  https://norttech.com.br/
 *  Desenvolvimento web, design e marketing digital.
 * ============================================================
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Assinatura de desenvolvimento — NortTech Marketing (https://norttech.com.br)
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log(
    "%cSite desenvolvido por NortTech Marketing — https://norttech.com.br/",
    "color:#f7941d;font-weight:bold;"
  );
}

createRoot(document.getElementById("root")!).render(<App />);
