import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/globals.css";
import { PaginaDocumentoLegal } from "./pages/pagina-documento-legal";
import markdown from "../docs/legal/politica-de-privacidade.md?raw";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PaginaDocumentoLegal markdown={markdown} idioma="pt" documento="privacidade" />
  </StrictMode>,
);
