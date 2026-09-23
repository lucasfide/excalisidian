// src/sync/resolucao.ts
// Decisão do usuário → operações de arquivo. Pura de propósito: é aqui que um erro apagaria
// trabalho de alguém, e função pura tem teste por caminho.
//
// Só existe operação de ESCRITA. Nenhuma resolução remove arquivo — o princípio 1 do doc 01
// diz que nada some sem volta atrás, e "ficar com esta" não é motivo para destruir a outra
// quando o usuário pode ter se enganado.

import { nomeDaCopiaDeConflito } from "./nomeDeConflito";
import type { Conflito, OperacaoArquivo, Resolucao } from "./tipos";

export function operacoesPara(
  conflito: Conflito,
  resolucao: Resolucao,
  quando: Date,
): OperacaoArquivo[] {
  if (resolucao.acao === "ficarCom") {
    // A versão local JÁ é o que está no disco. Reescrever geraria evento de watcher e um
    // novo ciclo de sincronização à toa.
    if (resolucao.origem === "local") return [];
    return [
      { tipo: "escrever", caminho: conflito.caminho, conteudo: conflito.remoto.conteudo },
    ];
  }

  // manterAmbas: a local fica onde está; a remota vira cópia carimbada com o dispositivo
  // DE ONDE ELA VEIO — é essa a informação útil para quem vai abrir as duas depois.
  return [
    {
      tipo: "escrever",
      caminho: nomeDaCopiaDeConflito(conflito.caminho, conflito.remoto.dispositivo, quando),
      conteudo: conflito.remoto.conteudo,
    },
  ];
}
