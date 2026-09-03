import React from "react";
import ReactDOM from "react-dom/client";

import App from "./app/App";
import { registrarCapturaDeErros } from "./app/capturaDeErros";
import LimiteDeErro from "./ui/excalisidian/LimiteDeErro";
import "./estilos/globals.css";

registrarCapturaDeErros();

// O `LimiteDeErro` aqui é a rede de segurança da RAIZ. O outro, dentro de App.tsx, cobre só a
// sidebar + workspace — tudo que fica fora dele (BarraStatus, RaizDialogos, RaizSobreposicoes,
// Toaster, os diálogos, e o corpo do próprio App) não tinha limite nenhum acima: um erro de
// renderização em qualquer um deles desmontava a árvore React inteira e deixava a janela em
// branco, sem botão nenhum pra sair. Foi exatamente o sintoma relatado depois de o PC hibernar.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LimiteDeErro
      onFechar={() => window.location.reload()}
      rotuloFechar="Recarregar"
    >
      <App />
    </LimiteDeErro>
  </React.StrictMode>,
);
