// servidor/src/creditosIa.ts
// Créditos da IA do Excalisidian (doc 18 §5.2, ADR-44). 1 crédito = US$ 0,001 de custo real.
// O custo real de um pedido é o `usage.cost` que o OpenRouter informa, mais a taxa de 5,5% da
// compra de créditos; sem esse valor, cobra-se pelo teto de preço enviado ao fornecedor. Toda a
// conta é feita em inteiros (nano-dólares), sem erro de ponto flutuante.

import type { BancoSqlite } from "./banco";

export type FaixaIa = "padrao" | "superior";

/** Créditos por mês de cada faixa. Mudar aqui é atualizar o servidor, não o app. */
export const COTA_POR_FAIXA: Record<FaixaIa, number> = { padrao: 3000, superior: 10_000 };

/** Taxa de 5,5% que o OpenRouter cobra na compra de créditos, em milésimos (1055 = × 1,055). */
export const TAXA_COMPRA_CREDITOS_MILESIMOS = 1055;

/** Teto de preço enviado ao fornecedor (`max_price`), em nano-dólares por token
 * (= US$ por milhão × 1000): entrada 0,30 e saída 1,20. Tem de bater com `fornecedorIa.ts`. */
const TETO_NANO_USD = { entrada: 300, saida: 1200 } as const;

/** Brasília é UTC−3 fixo (sem horário de verão desde 2019). */
const DESLOCAMENTO_BRASILIA_MS = 3 * 60 * 60 * 1000;

export interface UsoFornecedor {
  entradaComCache: number;
  entradaSemCache: number;
  saida: number;
}

/** Custo do pedido em micro-dólares, arredondado para cima. Com `custoUsd` (finito e ≥ 0) vale
 * esse custo × 1,055. Sem ele, cobra pelo teto de preço, sem desconto de cache — nunca menos que
 * o real, porque o teto impede provedor mais caro. */
export function custoMicroUsd(uso: UsoFornecedor, custoUsd?: number): number {
  if (typeof custoUsd === "number" && Number.isFinite(custoUsd) && custoUsd >= 0) {
    // Passa por nano-dólares inteiros antes da taxa: 0,0002 × 1e6 × 1,055 daria 211,00000000000003.
    const nano = Math.round(custoUsd * 1e9);
    return Math.ceil((nano * TAXA_COMPRA_CREDITOS_MILESIMOS) / 1_000_000);
  }
  const nano =
    (uso.entradaComCache + uso.entradaSemCache) * TETO_NANO_USD.entrada + uso.saida * TETO_NANO_USD.saida;
  return Math.ceil((nano * TAXA_COMPRA_CREDITOS_MILESIMOS) / 1_000_000);
}

/** "AAAA-MM" do mês civil de Brasília que contém `agoraMs`. */
export function periodoDe(agoraMs: number): string {
  const d = new Date(agoraMs - DESLOCAMENTO_BRASILIA_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Instante (ms) da meia-noite de Brasília do dia 1º do mês seguinte. */
export function renovaEmDe(agoraMs: number): number {
  const d = new Date(agoraMs - DESLOCAMENTO_BRASILIA_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + DESLOCAMENTO_BRASILIA_MS;
}

/** Créditos usados a partir do custo acumulado; fração de crédito conta como inteiro. */
export function creditosDeMicroUsd(micro: number): number {
  return Math.ceil(micro / 1000);
}

export interface Saldo {
  usados: number;
  total: number;
  /** Epoch em ms — mesmo formato de `SaldoCreditos` no app (src/servico/creditos.ts). */
  renovaEm: number;
}

export function saldoDaConta(banco: BancoSqlite, contaId: number, agoraMs: number): Saldo {
  const conta = banco.prepare(`select faixa_ia as faixa from contas where id = ?`).get(contaId) as
    | { faixa: string }
    | undefined;
  const faixa: FaixaIa = conta?.faixa === "superior" ? "superior" : "padrao";
  const uso = banco
    .prepare(`select custo_micro_usd as micro from uso_ia where conta_id = ? and periodo = ?`)
    .get(contaId, periodoDe(agoraMs)) as { micro: number } | undefined;
  return {
    usados: creditosDeMicroUsd(uso?.micro ?? 0),
    total: COTA_POR_FAIXA[faixa],
    renovaEm: renovaEmDe(agoraMs),
  };
}

/** Soma o pedido ao mês corrente da conta (período pelo fim do pedido, `agoraMs`).
 * Devolve o custo do pedido em micro-dólares. */
export function debitar(
  banco: BancoSqlite,
  contaId: number,
  agoraMs: number,
  uso: UsoFornecedor,
  custoUsd?: number,
): number {
  const micro = custoMicroUsd(uso, custoUsd);
  banco
    .prepare(
      `insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida)
       values (?, ?, ?, 1, ?, ?)
       on conflict(conta_id, periodo) do update set
         custo_micro_usd = custo_micro_usd + excluded.custo_micro_usd,
         pedidos = pedidos + 1,
         tokens_entrada = tokens_entrada + excluded.tokens_entrada,
         tokens_saida = tokens_saida + excluded.tokens_saida`,
    )
    .run(contaId, periodoDe(agoraMs), micro, uso.entradaComCache + uso.entradaSemCache, uso.saida);
  return micro;
}
