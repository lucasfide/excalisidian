import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/globals.css";
import { PaginaDocumentoLegal } from "./pages/pagina-documento-legal";
import markdown from "../docs/legal/terms-of-use.md?raw";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PaginaDocumentoLegal markdown={markdown} idioma="en" documento="termos" />
  </StrictMode>,
);
