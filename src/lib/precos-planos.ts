import type { Moeda, Periodo, PrecoPlano } from "../types/planos";

/**
 * pt, pt-BR e variantes sem região (ou com região BR) cobram em reais. Qualquer outro idioma,
 * inclusive pt-PT, cobra em dólares: o preço em R$ é só para o Brasil.
 */
export function moedaPadraoPorIdioma(idioma: string | null | undefined): Moeda {
  if (!idioma) return "USD";
  const partes = idioma.toLowerCase().split(/[-_]/);
  if (partes[0] !== "pt") return "USD";
  const regioes = partes.slice(1).filter(parte => parte.length === 2);
  return regioes.length === 0 || regioes.includes("br") ? "BRL" : "USD";
}

/** Inteiro sem centavos (R$ 35, US$ 8); com duas casas só quando não for inteiro (R$ 20,75). */
export function formatarMoeda(valor: number, moeda: Moeda): string {
  const inteiro = Number.isInteger(valor);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  }).format(valor);
}

export function formatarCreditos(creditos: number): string {
  return new Intl.NumberFormat("pt-BR").format(creditos);
}

/**
 * Equivalente mensal do preço anual, arredondado PARA CIMA no centavo: nunca mostrar um mensal
 * menor do que o real. A conta usa centavos inteiros (249 / 12 = 20,75 exato).
 */
export function equivalenteMensalDoAnual(anual: number): number {
  return Math.ceil((anual * 100) / 12) / 100;
}

/** O que se paga a mais por 12 meses no mensal do que no anual (nunca negativo). */
export function economiaAnualValor(mensal: number, anual: number): number {
  return Math.max(0, mensal * 12 - anual);
}

/** Economia do anual em %, arredondada PARA BAIXO: nunca prometer mais do que existe. */
export function economiaAnualPercentual(mensal: number, anual: number): number {
  const totalMensal = mensal * 12;
  if (totalMensal <= 0) return 0;
  return Math.floor((economiaAnualValor(mensal, anual) * 100) / totalMensal);
}

export interface PrecoExibido {
  /** Valor em destaque, sempre "por mês" (no anual, o equivalente mensal). */
  valor: string;
  /** Total cobrado por ano, só no anual de plano pago. */
  totalAnual: string | null;
  economiaValor: string | null;
  economiaPercentual: number | null;
}

export function descreverPreco(precos: PrecoPlano, moeda: Moeda, periodo: Periodo): PrecoExibido {
  const pago = precos.mensal > 0 || precos.anual > 0;
  if (periodo === "mensal" || !pago) {
    return { valor: formatarMoeda(precos.mensal, moeda), totalAnual: null, economiaValor: null, economiaPercentual: null };
  }
  const valorEconomia = economiaAnualValor(precos.mensal, precos.anual);
  return {
    valor: formatarMoeda(equivalenteMensalDoAnual(precos.anual), moeda),
    totalAnual: formatarMoeda(precos.anual, moeda),
    economiaValor: valorEconomia > 0 ? formatarMoeda(valorEconomia, moeda) : null,
    economiaPercentual: valorEconomia > 0 ? economiaAnualPercentual(precos.mensal, precos.anual) : null,
  };
}
