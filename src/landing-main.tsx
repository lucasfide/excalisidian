import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/globals.css";
import { LandingPage } from "./pages/landing-page";

createRoot(document.getElementById("root")!).render(<StrictMode><LandingPage /></StrictMode>);
