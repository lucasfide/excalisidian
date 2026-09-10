// Flush no fechamento da janela: segura o `close` até todas as abas sujas gravarem e o
// layout de abas ser persistido, então fecha. O autosave por documento (debounce de
// 800 ms) vive no documentosStore; aqui é só a garantia de não perder nada ao fechar.

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useDocumentosStore } from "../estado/documentosStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { useTarefasStore } from "../estado/tarefasStore";

export function useAutosave() {
  useEffect(() => {
    let desmontado = false;
    let fechando = false;
    const janela = getCurrentWindow();
    const pronto = janela.onCloseRequested(async (evento) => {
      if (fechando) return; // segunda chamada: deixa fechar
      fechando = true;
      evento.preventDefault();
      useWorkspaceStore.getState().flushLayout();
      await useDocumentosStore.getState().flushTudo();
      await useTarefasStore.getState()._persistirAgora();
      if (!desmontado) void janela.close();
    });
    return () => {
      desmontado = true;
      void pronto.then((unlisten) => unlisten());
    };
  }, []);
}
