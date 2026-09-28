// src/sync/fluxoSecao.ts
// Módulo PURO (sem disco, sem rede, sem zustand) com as decisões de fluxo da seção
// "Sincronização" das Configurações (plano 13 Task 2, doc 04 §17, doc 17 §7-8, decisão do dono
// do produto 29/09/2026):
//
//   - qual dos quatro estados da seção mostrar (sem conta / grátis / premium sem chave / lista
//     "Seus vaults" — ver `estadoDaSecaoSincronizacao`);
//   - se é preciso pedir a senha da conta antes de mostrar a lista (`precisaConfirmarSenha`);
//   - quais ações aparecem para cada estado de um item da lista (`acoesDoEstado`, doc 17 §8) —
//     só três estados agora, mais a flag `outraSenha` (`listaDeVaults.ts#ItemVault`), que
//     restringe a lista a só "Apagar";
//   - o texto de "N conflitos" de um item (`chaveDeConflitos` — singular/plural, doc 04 §17);
//   - qual chave do catálogo (`src/i18n/catalogo/sync.ts`) corresponde a um código de erro do
//     ciclo (`ErroCiclo`, `sync/motor.ts`) ou a um `StatusSync` (`estado/syncStore.ts`).
//
// A UI (`SecaoSincronizacao.tsx`) só chama estas funções e traduz a chave devolvida com
// `useTexto()` — nenhuma decisão de "o que mostrar" mora no componente.
//
// Plano 13 Task 2 (pedido do dono do produto no teste de 29/09): a lista "Seus vaults" perdeu
// as ações "Abrir", "Parar neste computador" e "Esquecer neste computador" — sobrou
// "Sincronizar agora"/"Apagar" (sincronizado), "Sincronizar" (só local) e "Baixar…" (só nuvem).
// "Pasta não encontrada" e "Criado com outra senha" deixaram de ser estados próprios da lista
// (ver `listaDeVaults.ts`).

import type { PlanoAssinatura } from "../conta/tipos";
import type { ErroCiclo } from "./motor";
import type { EstadoItem } from "./listaDeVaults";
import type { StatusSync } from "../estado/syncStore";
import type { ChaveTexto } from "../i18n/catalogo";

export type EstadoSecaoSincronizacao = "sem-conta" | "gratis" | "sem-chave" | "lista";

/** Doc 17 §7: sem sessão, nada além da frase (ADR-31: sem convite insistente). Sessão grátis,
 * mesma coisa, com a frase "é recurso do premium". Premium sem a `chaveDeEnvelope` deste
 * computador: pede a senha ANTES de mostrar a lista — nenhuma ação da lista (ligar, baixar,
 * sincronizar agora, apagar da nuvem) funciona sem ela (doc 17 §7, "Ligar... exige... Se este
 * computador ainda não tem a chaveDeEnvelope, pede a senha da conta"), e sem a chave também não
 * dá para decifrar nome nenhum da nuvem — mostrar uma lista pela metade seria mais confuso do
 * que pedir a senha primeiro. Premium com chave: mostra a lista de verdade. */
export function estadoDaSecaoSincronizacao(input: {
  sessao: { plano: PlanoAssinatura } | null;
  temChave: boolean;
}): EstadoSecaoSincronizacao {
  if (!input.sessao) return "sem-conta";
  if (input.sessao.plano === "gratis") return "gratis";
  return input.temChave ? "lista" : "sem-chave";
}

/** Doc 17 §7 / spec §1: sem a `chaveDeEnvelope` deste computador (guardada no cofre do
 * Windows), a seção pede a senha da conta antes de mostrar a lista. Mesmo teste que
 * `estadoDaSecaoSincronizacao` usa por dentro — exportado à parte porque `SecaoSincronizacao`
 * também chama isto sozinho depois de `contaStore.entrar` resolver, para saber se pode
 * recarregar a lista. */
export function precisaConfirmarSenha(chaveDeEnvelope: Uint8Array | null): boolean {
  return chaveDeEnvelope === null;
}

/** Uma ação de item da lista "Seus vaults" (doc 17 §8, tabela; doc 04 §17, linha "Ação"). */
export type AcaoItem = "sincronizarAgora" | "apagarDaNuvem" | "sincronizar" | "baixarParaEsteComputador";

/** Doc 17 §8 (tabela): quais ações aparecem para cada estado de um item. `outraSenha` (true
 * para um vault que não abre com a chave desta conta — `ItemVault.outraSenha`) restringe
 * qualquer estado a só "Apagar", não importa se é "sincronizado" ou "so-nuvem". */
export function acoesDoEstado(estado: EstadoItem, outraSenha: boolean): AcaoItem[] {
  if (outraSenha) return ["apagarDaNuvem"];
  switch (estado) {
    case "sincronizado":
      return ["sincronizarAgora", "apagarDaNuvem"];
    case "so-local":
      return ["sincronizar"];
    case "so-nuvem":
      return ["baixarParaEsteComputador"];
  }
}

/** Doc 04 §17: "{n} conflitos — abra o vault para resolver" (1: "1 conflito — abra o vault
 * para resolver") — singular tem texto próprio (nunca "1 conflitos"). `null` sem conflito: a
 * UI não mostra a linha. */
export function chaveDeConflitos(
  n: number,
): { chave: ChaveTexto; params?: Record<string, number> } | null {
  if (n <= 0) return null;
  if (n === 1) return { chave: "sync.item.conflito" };
  return { chave: "sync.item.conflitos", params: { n } };
}

/** Doc 04 §17: `sessao`, `plano` e `espaco` têm texto próprio; todo outro código do ciclo
 * (`rede`, `servidor`, `nao-encontrado`, `ja-existe`, `fora-de-ordem` esgotado, `aplicar-lote` —
 * uma mudança vinda de fora que não pôde ser aplicada — ou `outra-senha`, que na lista "Seus
 * vaults" nunca chega a esta função: `ItemVault.outraSenha` já mostra o texto próprio) cai no
 * genérico "não foi possível sincronizar agora". */
export function chaveDeErroCiclo(erro: ErroCiclo): ChaveTexto {
  switch (erro) {
    case "sessao":
      return "sync.erro.sessao";
    case "plano":
      return "sync.erro.plano";
    case "espaco":
      return "sync.erro.espaco";
    default:
      return "sync.erro.generico";
  }
}

/** Doc 17 §8: texto do ícone de estado e da seção para cada `StatusSync`. `"desligado"`
 * devolve `null` — é o status de um vault que não está sincronizado nesta janela. Um `{ erro }`
 * reusa `chaveDeErroCiclo`: são os mesmos códigos (`ErroCiclo`). */
export function chaveDeStatus(status: StatusSync): ChaveTexto | null {
  if (typeof status === "object") return chaveDeErroCiclo(status.erro);
  switch (status) {
    case "sincronizado":
      return "sync.status.sincronizado";
    case "sincronizando":
      return "sync.status.sincronizando";
    case "sem-conexao":
      return "sync.status.semConexao";
    case "pausado":
      return "sync.status.pausado";
    case "desligado":
      return null;
  }
}
