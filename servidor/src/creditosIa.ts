// servidor/src/creditosIa.ts
// Créditos da IA do Excalisidian (doc 18 §5.2, ADR-43). 1 crédito = US$ 0,001 de custo real
// do fornecedor. Toda a conta é feita em inteiros: o preço em US$ por milhão de tokens é o
// mesmo número que micro-dólares por token; multiplicado por 1000 vira nano-dólares por
// token, inteiro para os seis preços — assim não há erro de ponto flutuante (1000 × 0,15 dá
// 150 exatos, não 150,00000000000003).

import type { BancoSqlite } from "./banco";

export type FaixaIa = "padrao" | "superior";

/** Créditos por mês de cada faixa. Mudar aqui é atualizar o servidor, não o app. */
export const COTA_POR_FAIXA: Record<FaixaIa, number> = { padrao: 3000, superior: 10_000 };

/** Preços do fornecedor verificados em 28/09/2026 (doc 09, Parte 2), em nano-dólares por
 * token (= US$ por milhão × 1000). */
const PRECOS_NANO_USD = {
  foraDePico: { entradaComCache: 3, entradaSemCache: 150, saida: 600 },
  pico: { entradaComCache: 6, entradaSemCache: 300, saida: 1200 },
} as const;

/** Brasília é UTC−3 fixo (sem horário de verão desde 2019). */
const DESLOCAMENTO_BRASILIA_MS = 3 * 60 * 60 * 1000;

export interface UsoFornecedor {
  entradaComCache: number;
  entradaSemCache: number;
  saida: number;
}

/** Pico do fornecedor: segunda a sexta, 01:00–04:00 e 06:00–10:00 UTC. Feriado chinês é
 * tratado como dia comum — cobra no máximo o preço de pico, nunca menos que o real. */
export function ehHorarioDePico(agoraMs: number): boolean {
  const d = new Date(agoraMs);
  const dia = d.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) return false;
  const hora = d.getUTCHours();
  return (hora >= 1 && hora < 4) || (hora >= 6 && hora < 10);
}

/** Custo do pedido em micro-dólares, arredondado para cima. Um pedido demora até 90 s: vale o
 * preço de pico se o início OU o fim caiu no pico (nunca cobra menos que o real). */
export function custoMicroUsd(uso: UsoFornecedor, agoraMs: number, inicioMs?: number): number {
  const pico = ehHorarioDePico(agoraMs) || (inicioMs !== undefined && ehHorarioDePico(inicioMs));
  const p = pico ? PRECOS_NANO_USD.pico : PRECOS_NANO_USD.foraDePico;
  const nano =
    uso.entradaComCache * p.entradaComCache +
    uso.entradaSemCache * p.entradaSemCache +
    uso.saida * p.saida;
  return Math.ceil(nano / 1000);
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

/** Soma o pedido ao mês corrente da conta (período e saldo pelo fim do pedido, `agoraMs`).
 * Devolve o custo do pedido em micro-dólares. */
export function debitar(
  banco: BancoSqlite,
  contaId: number,
  agoraMs: number,
  uso: UsoFornecedor,
  inicioMs?: number,
): number {
  const micro = custoMicroUsd(uso, agoraMs, inicioMs);
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
