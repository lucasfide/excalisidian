// Política de novas tentativas do segundo plano (doc 11 §5.0/§5.1). Puro.
//
// Depois de uma falha que não seja de sessão/plano/créditos, a mesma nota só é tentada de novo
// depois de uma espera que cresce a cada falha seguida. Passada a última espera, o agente
// desiste até a nota crescer (gateiro: +50%; ciclo: 200 caracteres novos).

export const ESPERAS_APOS_FALHA_MS = [5_000, 30_000, 120_000, 600_000];

/** Espera antes da próxima tentativa, dado o número de falhas seguidas da nota (≥ 1).
 * `null` = desistir até a nota crescer. */
export function esperaAposFalha(falhasSeguidas: number): number | null {
  const posicao = Math.max(falhasSeguidas - 1, 0);
  return ESPERAS_APOS_FALHA_MS[posicao] ?? null;
}
