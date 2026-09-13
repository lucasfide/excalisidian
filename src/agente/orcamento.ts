// Orçamento do agente (doc 11 §5.6): contagem local de tokens e custo estimado. Sem
// telemetria — os números vêm do `usage` que cada provedor devolve na resposta.
// Puro, testável em node.

import type { UsoSimples } from "./tipos";

/** USD por milhão de tokens; catálogo em provedores.ts. null = sem preço verificado
 * (doc 09, incerteza 26) — o medidor mostra só tokens. */
export interface PrecoModelo {
  entrada: number;
  saida: number;
}

export function usoVazio(): UsoSimples {
  return { tokensEntrada: 0, tokensSaida: 0 };
}

export function somarUso(a: UsoSimples, b: UsoSimples): UsoSimples {
  return {
    tokensEntrada: a.tokensEntrada + b.tokensEntrada,
    tokensSaida: a.tokensSaida + b.tokensSaida,
  };
}

/** Custo em USD da resposta com o preço por milhão; null quando o modelo não tem preço. */
export function custoDaResposta(
  uso: UsoSimples,
  preco: PrecoModelo | undefined,
): number | null {
  if (!preco) return null;
  return (
    (uso.tokensEntrada / 1_000_000) * preco.entrada +
    (uso.tokensSaida / 1_000_000) * preco.saida
  );
}

/** Sem teto configurado, nunca se atinge o teto (doc 11 §10.4: padrão é sem teto). */
export function atingiuTeto(
  custoDoDia: number | null,
  tetoDiarioUsd: number | null,
): boolean {
  if (tetoDiarioUsd === null || custoDoDia === null) return false;
  return custoDoDia >= tetoDiarioUsd;
}

export function podeChamar(
  custoDoDia: number | null,
  tetoDiarioUsd: number | null,
): boolean {
  return !atingiuTeto(custoDoDia, tetoDiarioUsd);
}

// ——— formatação (pt-BR, sentence case) ———

/** "940", "12,4 mil", "1,2 milhão" — números nunca em notação crua no UI. */
export function formatarTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return (n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " milhão";
}

/** "~US$ 0,03" — null quando não há preço; a UI mostra só tokens nesse caso. */
export function formatarCusto(custoUsd: number | null): string | null {
  if (custoUsd === null) return null;
  const casas = custoUsd < 1 ? 2 : 0;
  return `~US$ ${custoUsd.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}`;
}

/** Texto do medidor no rodapé do painel (doc 11 §6.2): "{n} tokens · ~US$ {v} hoje". */
export function formatarUso(uso: UsoSimples, custoHoje: number | null): string {
  const total = uso.tokensEntrada + uso.tokensSaida;
  const tokens = `${formatarTokens(total)} tokens`;
  const custo = formatarCusto(custoHoje);
  return custo ? `${tokens} · ${custo} hoje` : `${tokens} hoje`;
}
