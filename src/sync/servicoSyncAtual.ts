// src/sync/servicoSyncAtual.ts
// Ponto único de escolha da implementação de `ServicoSync` (doc 17 §10, task-6): em
// desenvolvimento (`npm run tauri dev`), grava no servidor de teste local dentro do app data
// (`ServicoSyncLocal`); em produção, fala com o servidor real por HTTP (`ServicoSyncHttp`).
//
// Mesmo mecanismo de eliminação de `simularConflito.ts`/`PaletaComandos.tsx`: Vite troca
// `import.meta.env.DEV` por uma constante literal no build, e o empacotador prova que o ramo
// `? new ServicoSyncLocal() : …` nunca roda em produção e remove esse ramo — junto com o
// import de `ServicoSyncLocal.ts` e a string "sync-teste" — do bundle publicado (confira com
// grep em dist/ depois de `npm run build`).

import type { ServicoSync } from "./ServicoSync";
import { ServicoSyncHttp } from "./ServicoSyncHttp";
import { ServicoSyncLocal } from "./ServicoSyncLocal";

export function servicoSyncAtual(): ServicoSync {
  return import.meta.env.DEV ? new ServicoSyncLocal() : new ServicoSyncHttp();
}
