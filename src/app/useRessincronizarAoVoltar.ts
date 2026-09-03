// Ressincroniza o vault quando a janela volta depois de muito tempo sem foco.
//
// Por que isto existe: o Windows não entrega evento nenhum de suspender/retomar ao Tauri —
// `WindowEvent::Suspended`/`Resumed` existem no enum mas estão sob `#[cfg(mobile)]`, marcados
// "Linux / macOS / Windows: Unsupported" (conferido no tauri 2.11.5). O sinal confiável que
// sobra é o foco da janela.
//
// E ressincronizar importa porque os eventos do watcher perdidos durante a suspensão NÃO
// voltam: o `emit` do Rust é fire-and-forget, sem buffer nem replay. Quem mexeu nos arquivos
// por fora enquanto o PC dormia ficava invisível pro app até um restart.
//
// O limiar existe pra isto não disparar num alt-tab normal. Reler o vault é seguro (o
// reindex é incremental, compara mtime+size), mas `recarregarArvore` faz um walk completo —
// não é coisa pra rodar a cada troca de janela.

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useVaultStore } from "../estado/vaultStore";

/** Abaixo disso é alt-tab, não ausência de verdade. */
const LIMIAR_MS = 60_000;

export function useRessincronizarAoVoltar() {
  useEffect(() => {
    let perdeuFocoEm: number | null = null;

    const pronto = getCurrentWindow().onFocusChanged(({ payload: focada }) => {
      if (!focada) {
        perdeuFocoEm = Date.now();
        return;
      }
      const desde = perdeuFocoEm;
      perdeuFocoEm = null;
      if (desde === null || Date.now() - desde < LIMIAR_MS) return;
      if (!useVaultStore.getState().adapter) return;
      void useVaultStore.getState().ressincronizar();
    });

    return () => {
      void pronto.then((unlisten) => unlisten());
    };
  }, []);
}
