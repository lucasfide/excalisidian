// Flush no fechamento da janela: segura o `close` até o canvas serializar a última cena,
// todas as abas sujas gravarem (fila drenada, incluindo edições feitas durante gravação
// lenta), as tarefas e o layout serem persistidos. Se algo falhar ou ficar bloqueado em
// conflito, pergunta antes de fechar — fechar em silêncio descartaria edições (auditoria
// 12/09, achados 02/05). O autosave por documento (debounce de 800 ms) vive no
// documentosStore; o contrato de flush completo, em estado/flushGeral.ts.

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { flusharTudoAntesDeSair } from "../estado/flushGeral";
import { confirmar } from "../estado/dialogoStore";

export function useAutosave() {
  useEffect(() => {
    let desmontado = false;
    let fechando = false;
    const janela = getCurrentWindow();
    const pronto = janela.onCloseRequested(async (evento) => {
      if (fechando) return; // segunda chamada: deixa fechar
      fechando = true;
      evento.preventDefault();
      const { falhas, bloqueados, tarefasOk } = await flusharTudoAntesDeSair();
      if (desmontado) return;
      if (falhas.length > 0 || bloqueados.length > 0 || !tarefasOk) {
        // Doc 04 §1: fechar com pendência não salva exige decisão explícita.
        const fecharMesmo = await confirmar({
          titulo: "Não foi possível salvar",
          descricao: "Fechar mesmo assim descarta as alterações.",
          textoConfirmar: "Fechar mesmo assim",
          destrutivo: true,
        });
        if (desmontado) return;
        if (!fecharMesmo) {
          fechando = false; // permite tentar de novo
          return;
        }
      }
      if (!desmontado) void janela.close();
    });
    return () => {
      desmontado = true;
      void pronto.then((unlisten) => unlisten());
    };
  }, []);
}
