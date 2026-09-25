// src/sync/fluxoSecao.ts
// Módulo PURO (sem disco, sem rede, sem zustand) com as decisões de fluxo da seção
// "Sincronização" das Configurações (plano 10 Task 4, doc 04 §17 e doc 17 §7-8):
//
//   - qual dos estados da seção mostrar (doc 17 §7: sem conta / grátis / não sincronizado /
//     sincronizado — "premium sem chave" não é um quinto estado persistente da seção, é um
//     diálogo que aparece ao clicar em "Sincronizar este vault" ou "Baixar…" enquanto este
//     computador não tem a chave guardada, ver `precisaConfirmarSenha`);
//   - se a pasta escolhida pra "Baixar um vault sincronizado" serve (tem que estar vazia);
//   - se é preciso pedir a senha da conta antes de ligar ou baixar um vault;
//   - qual chave do catálogo (`src/i18n/catalogo/sync.ts`) corresponde a um código de erro do
//     ciclo (`ErroCiclo`, `sync/motor.ts`) ou a um `StatusSync` (`estado/syncStore.ts`).
//
// A UI (`SecaoSincronizacao.tsx`) só chama estas funções e traduz a chave devolvida com
// `useTexto()` — nenhuma decisão de "o que mostrar" mora no componente.

import type { PlanoAssinatura } from "../conta/tipos";
import type { ErroCiclo } from "./motor";
import type { StatusSync } from "../estado/syncStore";
import type { ChaveTexto } from "../i18n/catalogo";

export type EstadoSecaoSincronizacao =
  | "sem-conta"
  | "gratis"
  | "nao-sincronizado"
  | "sincronizado";

/** Doc 17 §7: sem sessão, nada mais é mostrado (ADR-31: sem convite insistente). Sessão
 * grátis, mesma coisa, mas com a frase "é recurso do premium" — mesmo que o vault atual
 * estivesse marcado como sincronizado em outro plano, o grátis nunca teria chegado a ligar
 * um (defesa em profundidade, não deveria acontecer). Premium decide só pelo vault ATUAL
 * (`vaultSincronizado` — `useSyncStore.getState().raiz !== null`, plano 10 Task 5). */
export function estadoDaSecaoSincronizacao(input: {
  sessao: { plano: PlanoAssinatura } | null;
  vaultSincronizado: boolean;
}): EstadoSecaoSincronizacao {
  if (!input.sessao) return "sem-conta";
  if (input.sessao.plano === "gratis") return "gratis";
  return input.vaultSincronizado ? "sincronizado" : "nao-sincronizado";
}

/** Doc 17 §7: "Baixar um vault para este computador" exige uma PASTA VAZIA — baixar por cima
 * de arquivos existentes poderia sobrescrever notas que não têm nada a ver com o vault.
 * `entradas` é o que `VaultAdapter.listarPasta("")` devolve pra pasta escolhida no diálogo
 * nativo — qualquer entrada (arquivo ou pasta, mesmo pasta-ponto) reprova. */
export function pastaEstaVazia(entradas: { nome: string }[]): boolean {
  return entradas.length === 0;
}

/** Doc 17 §7: ligar ou baixar um vault exige a `chaveDeEnvelope` deste computador (guardada
 * no cofre do Windows). Sem ela, a ação pede a senha da conta antes de continuar. */
export function precisaConfirmarSenha(chaveDeEnvelope: Uint8Array | null): boolean {
  return chaveDeEnvelope === null;
}

/** Doc 04 §17: `sessao`, `plano` e `espaco` têm texto próprio; todo outro código do ciclo
 * (`rede`, `servidor`, `nao-encontrado`, `ja-existe`, `fora-de-ordem` esgotado, ou
 * `aplicar-lote` — uma mudança vinda de fora que não pôde ser aplicada) cai no genérico "não
 * foi possível sincronizar agora". */
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
 * devolve `null` — é o status de um vault que não está sincronizado; a seção só chama isto
 * no estado "sincronizado" (`estadoDaSecaoSincronizacao`), onde `"desligado"` não deveria
 * aparecer (ver JSDoc de `StatusSync`). Um `{ erro }` reusa `chaveDeErroCiclo`: são os mesmos
 * códigos (`ErroCiclo`). */
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
