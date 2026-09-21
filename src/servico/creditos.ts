// src/servico/creditos.ts
// Interpretação do saldo de créditos que o servidor manda. Nada aqui CONTA consumo: a
// contagem que vale é a do servidor (decisão do estudo de viabilidade — o medidor local do
// doc 11 §5.6 continua servindo só o modo com chave própria, onde quem paga é o usuário).

import { tagDeLocale, type Idioma } from "../i18n/idioma";

export interface SaldoCreditos {
  usados: number;
  total: number;
  /** Epoch em ms da próxima renovação da cota. */
  renovaEm: number;
}

/** Limiar do aviso "acabando": últimos 10% da cota. */
const LIMIAR_ACABANDO = 0.9;

export function restantes(s: SaldoCreditos): number {
  return Math.max(0, s.total - s.usados);
}

export function fracaoUsada(s: SaldoCreditos): number {
  if (s.total <= 0) return 1;
  return Math.max(0, Math.min(1, s.usados / s.total));
}

export function nivelDeAviso(s: SaldoCreditos): "ok" | "acabando" | "esgotado" {
  if (restantes(s) <= 0) return "esgotado";
  return fracaoUsada(s) >= LIMIAR_ACABANDO ? "acabando" : "ok";
}

/** Sempre para baixo: arredondar para cima prometeria crédito que o servidor não tem.
 * `idioma` decide o separador (pt-BR padrão, para não quebrar chamador existente). */
export function formatarCreditos(n: number, idioma: Idioma = "pt-BR"): string {
  return new Intl.NumberFormat(tagDeLocale(idioma)).format(Math.floor(n));
}
