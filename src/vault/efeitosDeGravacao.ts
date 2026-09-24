// src/vault/efeitosDeGravacao.ts
// Efeitos que TODA gravação vinda de fora do editor (resolução de conflito, motor de
// sincronização — plano 09) precisa disparar depois de escrever, na mesma ordem: cancelar o
// autosave pendente ANTES de escrever (senão o timer já armado regravaria o conteúdo antigo
// do editor por cima da versão nova — ADR-32), gravar, recarregar a árvore, reindexar,
// recarregar a aba aberta. Extraído de `estado/conflitosStore.ts` (que já fazia exatamente
// isso pra resolução de conflito) pra não existir uma segunda cópia dessa regra quando o
// motor de sincronização precisar da mesma coisa.

import { useVaultStore } from "../estado/vaultStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { excluir, type ResultadoExclusao } from "./lixeira";
import type { VaultAdapter } from "./VaultAdapter";

/** Efeitos que uma escrita fora do editor precisa disparar, além da própria escrita (doc 02
 * §10: o watcher ignora o eco da própria gravação atômica, então ninguém além de quem gravou
 * vai atualizar árvore/índice/aba — "demorou pra aparecer" era exatamente essa lacuna). */
export interface EfeitosDeGravacao {
  recarregarArvore(): Promise<void>;
  reindexarArquivo(caminho: string): Promise<void>;
  /** Cancela um autosave pendente da aba deste caminho, se houver. No-op se a aba não
   * existir ou não tiver timer armado. */
  cancelarAutosavePendente(caminho: string): void;
  /** Relê o disco pra dentro da aba deste caminho, se ela estiver aberta. No-op se a aba
   * não existir. */
  recarregarDoDisco(caminho: string): Promise<void>;
  /** Move para a lixeira (`.trash/`) — delega inteiramente a `vault/lixeira.ts#excluir`, que
   * já cuida de fechar aba, registrar no índice da lixeira e recarregar árvore/índice. */
  moverParaLixeira(caminho: string): Promise<ResultadoExclusao>;
}

/** Efeitos reais, ligados aos stores globais (vaultStore/documentosStore). Testes injetam
 * versões falsas em vez desta — não precisam montar os stores do zustand inteiros. */
export function efeitosReais(): EfeitosDeGravacao {
  return {
    recarregarArvore: () => useVaultStore.getState().recarregarArvore(),
    reindexarArquivo: (caminho) => useVaultStore.getState().reindexarArquivo(caminho),
    cancelarAutosavePendente: (caminho) =>
      useDocumentosStore.getState().cancelarAutosave(caminho),
    recarregarDoDisco: (caminho) => useDocumentosStore.getState().recarregarDoDisco(caminho),
    moverParaLixeira: (caminho) => excluir(caminho),
  };
}

/** Grava um arquivo (texto ou binário) pelo adaptador e dispara a sequência inteira que faz
 * o resultado aparecer na tela: cancela o autosave pendente deste caminho ANTES de escrever,
 * grava, recarrega a árvore, reindexa o caminho e recarrega a aba se ela estiver aberta
 * (no-op se não estiver). Usada quando `caminho` é o próprio arquivo que mudou — não serve
 * pra gravações "de lado" que não devem tocar aba/autosave de outro caminho (ex.: a cópia
 * carimbada de "manter as duas", que tem sua própria orquestração em conflitosStore). */
export async function gravarComEfeitos(
  adaptador: VaultAdapter,
  efeitos: EfeitosDeGravacao,
  caminho: string,
  conteudo: string | Uint8Array,
): Promise<void> {
  efeitos.cancelarAutosavePendente(caminho);
  if (typeof conteudo === "string") {
    await adaptador.escreverTexto(caminho, conteudo);
  } else {
    await adaptador.escreverBinario(caminho, conteudo);
  }
  await efeitos.recarregarArvore();
  await efeitos.reindexarArquivo(caminho);
  await efeitos.recarregarDoDisco(caminho);
}

/** Um arquivo a gravar dentro de um lote — `gravarLoteComEfeitos`. */
export interface GravacaoEmLote {
  caminho: string;
  conteudo: string | Uint8Array;
}

/** Mesma sequência de `gravarComEfeitos`, mas pra N arquivos de um lote só: cancela o
 * autosave de cada um ANTES de gravar qualquer coisa (a ordem entre arquivos não importa,
 * mas "cancelar antes de escrever" continua valendo por arquivo), grava todos, e só então
 * recarrega a árvore UMA VEZ (não uma vez por arquivo — é o motivo de existir: o motor de
 * sincronização aplica um lote inteiro por ciclo, e recarregar a árvore N vezes seria
 * trabalho redobrado à toa), reindexando e recarregando a aba de cada caminho em seguida. */
export async function gravarLoteComEfeitos(
  adaptador: VaultAdapter,
  efeitos: EfeitosDeGravacao,
  gravacoes: GravacaoEmLote[],
): Promise<void> {
  for (const { caminho } of gravacoes) {
    efeitos.cancelarAutosavePendente(caminho);
  }
  for (const { caminho, conteudo } of gravacoes) {
    if (typeof conteudo === "string") {
      await adaptador.escreverTexto(caminho, conteudo);
    } else {
      await adaptador.escreverBinario(caminho, conteudo);
    }
  }
  if (gravacoes.length > 0) {
    await efeitos.recarregarArvore();
  }
  for (const { caminho } of gravacoes) {
    await efeitos.reindexarArquivo(caminho);
    await efeitos.recarregarDoDisco(caminho);
  }
}
