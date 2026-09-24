// src/sync/decisoes.ts
// As duas decisões do ciclo de sincronização (doc 17 §5 e §6): o que mudou aqui desde a
// última sincronização (`mudancasLocais`), e o que fazer com uma mudança que chegou de fora
// (`acaoParaRemota`). Módulo puro — sem disco, sem rede; o motor (plano 09) lê o conteúdo e
// aplica as ações.

import { EXT_TMP } from "../app/constantes";

/**
 * Tipo mínimo de que estas funções precisam, estruturalmente compatível com `Mudanca` de
 * `formato.ts` (Task 3 do mesmo plano, ainda não existe quando este arquivo foi escrito — o
 * plano 09 unifica os dois). `formato.ts` acrescenta `conteudo: Uint8Array` ao caso "gravar";
 * como esta interface não declara esse campo, qualquer `Mudanca` real continua aceita aqui
 * (excesso de propriedades é permitido em valores tipados, só não em literais soltos).
 */
export type Mudanca =
  | { tipo: "gravar"; caminho: string; base: string | null; hash: string }
  | { tipo: "apagar"; caminho: string; base: string };

/** Mudança local ainda sem conteúdo — o motor lê os bytes do disco depois. */
export type MudancaLocalSemConteudo =
  | { tipo: "gravar"; caminho: string; base: string | null }
  | { tipo: "apagar"; caminho: string; base: string };

/** As seis ações da tabela do doc 17 §6. */
export type AcaoRemota =
  | "gravar"
  | "so-atualizar-base"
  | "conflito"
  | "mover-para-lixeira"
  | "manter-local-e-reenviar"
  | "recriar";

const PREFIXO_LIXEIRA = ".trash/";
const SUFIXO_TMP = `.${EXT_TMP}`;

function foraDaSincronizacao(caminho: string): boolean {
  return caminho.startsWith(PREFIXO_LIXEIRA) || caminho.endsWith(SUFIXO_TMP);
}

/**
 * O que mudou neste computador desde a última sincronização, comparando o estado atual do
 * vault (`atual`: caminho → hash do disco) com `bases` (caminho → hash do último estado
 * sincronizado). Caminhos com conflito aberto (`emConflito`) ficam de fora até o usuário
 * decidir; a lixeira e os temporários de gravação nunca entram (doc 17 §4.4).
 */
export function mudancasLocais(
  atual: Map<string, string>,
  bases: Record<string, string>,
  emConflito: Set<string>,
): MudancaLocalSemConteudo[] {
  const mudancas: MudancaLocalSemConteudo[] = [];

  for (const [caminho, hash] of atual) {
    if (emConflito.has(caminho) || foraDaSincronizacao(caminho)) continue;
    const base = Object.prototype.hasOwnProperty.call(bases, caminho) ? bases[caminho] : null;
    if (base === hash) continue; // não mudou
    mudancas.push({ tipo: "gravar", caminho, base });
  }

  for (const caminho of Object.keys(bases)) {
    if (atual.has(caminho)) continue; // ainda existe, já tratado acima (ou igual)
    if (emConflito.has(caminho) || foraDaSincronizacao(caminho)) continue;
    mudancas.push({ tipo: "apagar", caminho, base: bases[caminho] });
  }

  return mudancas;
}

/**
 * O que fazer com uma mudança que chegou de fora, seguindo a tabela do doc 17 §6.
 *
 * `local` é o hash atual do arquivo no disco (`null` se ausente). `base` é o hash em `bases`
 * para este caminho (`null` se o caminho nunca esteve em `bases`). `apagadoAquiDesdeBase` diz
 * se este computador apagou o arquivo desde a última base (distingue "nunca existiu aqui" de
 * "existiu e eu apaguei" quando `local` é `null` — os dois têm `local` ausente, mas só o
 * segundo é a linha "gravar de arquivo que apaguei aqui" da tabela).
 *
 * Ambiguidade resolvida (não é uma linha literal da tabela): "apagar" chega e este computador
 * já apagou o mesmo caminho desde a base (`apagadoAquiDesdeBase` true) — os dois lados já
 * concordam que o arquivo sumiu. Não é "local == base" (base é um hash, local é `null`) nem
 * "mexi" (não há conteúdo local para perder, e reenviar um "apagar" para um arquivo que já não
 * existe não faz sentido). Como nenhum texto do usuário está em jogo dos dois lados, a escolha
 * seguinte é "so-atualizar-base": só limpa o registro, sem gravar nem apagar nada.
 */
export function acaoParaRemota(
  mudanca: Mudanca,
  local: string | null,
  base: string | null,
  apagadoAquiDesdeBase: boolean,
): AcaoRemota {
  if (mudanca.tipo === "gravar") {
    if (local === mudanca.hash) return "so-atualizar-base"; // já igual
    if (apagadoAquiDesdeBase) return "recriar"; // apaguei aqui; apagar nunca vence editar
    if (local === base) return "gravar"; // não mexi (inclui nunca ter existido aqui)
    return "conflito"; // mexi
  }

  // tipo === "apagar"
  if (local === base) return "mover-para-lixeira"; // não mexi
  if (apagadoAquiDesdeBase) return "so-atualizar-base"; // convergência — ver comentário acima
  return "manter-local-e-reenviar"; // mexi: a versão local será enviada de novo
}

/**
 * Binário é tudo que não termina em `.md` (case-insensitive). `.draw.md` é markdown de
 * desenho — termina em `.md`, então é texto (doc 02 §3.0 já trata as duas extensões como
 * uma só; aqui basta checar o sufixo).
 */
export function ehBinario(caminho: string): boolean {
  return !/\.md$/i.test(caminho);
}
