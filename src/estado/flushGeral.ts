// Contrato único de flush do app (auditoria 12/09, achados 02/05/06): drena canvas,
// documentos, tarefas e layout antes de qualquer encerramento do processo — fechar a janela
// (useAutosave) e instalar atualização (atualizacaoStore). Não mostra diálogo: devolve o
// resultado e quem chama decide o que fazer com pendências.

import { useDocumentosStore } from "./documentosStore";
import { useWorkspaceStore } from "./workspaceStore";
import { useTarefasStore } from "./tarefasStore";
import { flusharCanvas } from "../canvas/flushCanvas";

export interface ResultadoFlushGeral {
  /** Documentos cuja gravação falhou. */
  falhas: string[];
  /** Documentos em conflito/órfão com edição pendente: só o usuário resolve. */
  bloqueados: string[];
  /** false se o tarefas.json falhou ao gravar. */
  tarefasOk: boolean;
}

export async function flusharTudoAntesDeSair(): Promise<ResultadoFlushGeral> {
  useWorkspaceStore.getState().flushLayout();
  // O canvas tem debounce próprio: sem este passo, a última edição do desenho ainda não
  // existe no documentosStore quando o flush dos documentos roda (achado 05).
  await flusharCanvas();
  const { falhas, bloqueados } = await useDocumentosStore.getState().flushTudo();
  const tarefasOk = await useTarefasStore.getState()._persistirAgora();
  return { falhas, bloqueados, tarefasOk };
}
