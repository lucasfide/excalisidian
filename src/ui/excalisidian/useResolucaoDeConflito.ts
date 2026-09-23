// Resolução de conflito compartilhada entre ComparadorNotas e ComparadorDesenhos (task-6):
// adaptador ausente -> toast; rejeição de `resolver()` -> `toast.error` com
// `conflito.erro.salvar`; o comparador continua aberto depois da falha (o caminho só sai da
// fila quando a escrita termina, dentro de `conflitosStore`). Extraído para não duplicar essa
// lógica entre os dois comparadores — os dois têm de se comportar exatamente igual aqui.
//
// Falha na gravação (disco cheio, permissão, etc.): o store já mantém o conflito na fila —
// nada foi apagado —, mas a rejeição não pode escapar até o tratador global de
// `capturaDeErros.ts`, que mostraria "Promise rejeitada: Error: <mensagem técnica>" pro
// usuário. Todo outro ponto de escrita do app (criacao.ts, PainelLixeira.tsx) mostra o
// próprio erro com toast; aqui não é diferente.

import { toast } from "sonner";

import { useConflitosStore } from "../../estado/conflitosStore";
import { useVaultStore } from "../../estado/vaultStore";
import { useTexto } from "../../i18n/useTexto";
import type { Resolucao } from "../../sync/tipos";

export function useResolucaoDeConflito(caminho: string) {
  const t = useTexto();
  const emAndamento = useConflitosStore((s) => s.emResolucao(caminho));

  const resolver = async (resolucao: Resolucao) => {
    const adaptador = useVaultStore.getState().adapter;
    if (!adaptador) {
      toast.error(t("conflito.erro.salvar"));
      return;
    }
    try {
      await useConflitosStore.getState().resolver(caminho, resolucao, adaptador);
    } catch {
      toast.error(t("conflito.erro.salvar"));
    }
  };

  return { emAndamento, resolver };
}
