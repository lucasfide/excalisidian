// src/sync/decisaoLigar.ts
// Módulo PURO (sem disco, sem rede, sem zustand) com a decisão de ligar a sincronização ao
// vault aberto nesta janela (plano 10 Task 5, doc 17 §5 e §7). `ligarAoVault.ts` (a "casca")
// só reúne os cinco booleanos e chama esta função — nenhuma decisão de "ligar ou não" mora lá.
//
// "esperar-conta": a conta ainda está carregando (`contaStore.carregado === false`) — no boot,
// `plano()` diz "gratis" mesmo antes de qualquer conclusão (contaStore.ts, JSDoc de
// `carregado`), então esta decisão tem que vir ANTES da checagem de plano, senão um vault
// premium concluiria "sem premium" só porque a rede ainda não respondeu ao `renovar`.
export type MotivoNaoLigar =
  | "sem-vault"
  | "sem-estado-sync"
  | "sem-premium"
  | "sem-chave-no-cofre";

export type DecisaoLigar = "ligar" | "esperar-conta" | { naoLigar: MotivoNaoLigar };

export interface EntradaDecisaoLigar {
  /** Há um vault aberto nesta janela (`vaultStore.adapter !== null`). */
  vaultAberto: boolean;
  /** Este vault tem um `EstadoSync` gravado neste computador (`carregarEstadoSync` achou algo). */
  temEstadoSync: boolean;
  /** `contaStore.carregado` — `false` enquanto o `renovar()` da abertura ainda está em voo. */
  contaCarregada: boolean;
  /** `contaStore.plano() === "premium"`. Só significa algo quando `contaCarregada` é `true`. */
  premium: boolean;
  /** A `chaveDeEnvelope` deste computador está no cofre do Windows. */
  temChaveNoCofre: boolean;
}

export function decidirLigar(entrada: EntradaDecisaoLigar): DecisaoLigar {
  if (!entrada.vaultAberto) return { naoLigar: "sem-vault" };
  if (!entrada.temEstadoSync) return { naoLigar: "sem-estado-sync" };
  if (!entrada.contaCarregada) return "esperar-conta";
  if (!entrada.premium) return { naoLigar: "sem-premium" };
  if (!entrada.temChaveNoCofre) return { naoLigar: "sem-chave-no-cofre" };
  return "ligar";
}
