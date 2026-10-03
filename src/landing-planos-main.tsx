import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/globals.css";
import { PaginaPlanos } from "./pages/pagina-planos";

createRoot(document.getElementById("root")!).render(<StrictMode><PaginaPlanos /></StrictMode>);
