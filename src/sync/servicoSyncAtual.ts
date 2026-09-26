// src/sync/servicoSyncAtual.ts
// Ponto único de escolha da implementação de `ServicoSync` (doc 17 §10, doc 18 §5): em
// desenvolvimento (`npm run tauri dev`), grava no servidor de teste local dentro do app data
// (`ServicoSyncLocal`); em produção, fala com o servidor real por HTTP (`ServicoSyncHttp`).
// Em DEV, `VITE_SERVIDOR=real` troca para o servidor de verdade também (`decidirModoServidor`).
//
// Mesmo mecanismo de eliminação de `simularConflito.ts`/`PaletaComandos.tsx`: Vite troca
// `import.meta.env.DEV` por uma constante literal no build, e o empacotador prova que o ramo
// `? new ServicoSyncLocal() : …` nunca roda em produção e remove esse ramo — junto com o
// import de `ServicoSyncLocal.ts` e a string "sync-teste" — do bundle publicado (confira com
// grep em dist/ depois de `npm run build`). Por isso `import.meta.env.DEV` continua literal
// aqui, e `decidirModoServidor` só entra como condição extra dentro do mesmo ramo — nunca no
// lugar dele.

import type { ServicoSync } from "./ServicoSync";
import { ServicoSyncHttp } from "./ServicoSyncHttp";
import { ServicoSyncLocal } from "./ServicoSyncLocal";
import { decidirModoServidor } from "../servico/modoServidor";

export function servicoSyncAtual(): ServicoSync {
  const local =
    import.meta.env.DEV &&
    decidirModoServidor({ dev: import.meta.env.DEV, variavelServidor: import.meta.env.VITE_SERVIDOR }) ===
      "local";
  return local ? new ServicoSyncLocal() : new ServicoSyncHttp();
}
