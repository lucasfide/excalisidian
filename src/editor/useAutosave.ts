// Autosave da nota (Fatia 1): debounce de 800 ms depois da última tecla, mais flush no blur
// do editor e no fechamento da janela. O flush no fechamento segura o `close` até a gravação
// terminar, então nada se perde ao fechar o app com edição pendente.

import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useVaultStore } from "../estado/vaultStore";

const DEBOUNCE_MS = 800;

export function useAutosave() {
  const salvar = useVaultStore((s) => s.salvar);
  const conteudoEditor = useVaultStore((s) => s.conteudoEditor);
  const caminhoAberto = useVaultStore((s) => s.caminhoAberto);
  const estadoSalvamento = useVaultStore((s) => s.estadoSalvamento);

  const timerRef = useRef<number | undefined>(undefined);

  // Debounce por mudança de conteúdo.
  useEffect(() => {
    if (estadoSalvamento !== "editando") return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void salvar(), DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [conteudoEditor, estadoSalvamento, caminhoAberto, salvar]);

  // Flush ao fechar a janela: cancela o close, grava, e só então fecha.
  useEffect(() => {
    let desmontado = false;
    const janela = getCurrentWindow();
    const pronto = janela.onCloseRequested(async (evento) => {
      const st = useVaultStore.getState();
      if (st.conteudoEditor !== st.conteudoDisco) {
        evento.preventDefault();
        window.clearTimeout(timerRef.current);
        await st.salvar();
        if (!desmontado) void janela.close();
      }
    });
    return () => {
      desmontado = true;
      void pronto.then((unlisten) => unlisten());
    };
  }, []);
}
