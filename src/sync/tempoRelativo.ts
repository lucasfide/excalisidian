// src/sync/tempoRelativo.ts
// Módulo PURO (sem disco, sem relógio de verdade por padrão) para o "{tempo}" de "Sincronizado
// há {tempo}" (doc 04 §17, plano 12 Task 6). Devolve uma unidade + valor, não uma string
// pronta: a UI traduz cada unidade pelo catálogo (`sync.tempo.*`), porque "5 min" muda de forma
// conforme o idioma em outras unidades (mesmo que "min" sozinho não mude aqui).

export type UnidadeTempo = "agora" | "minutos" | "horas" | "dias";

export interface TempoRelativo {
  unidade: UnidadeTempo;
  /** Não usado quando `unidade === "agora"`. */
  valor: number;
}

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

/** `desde` no passado (ou igual) a `agora`; um `desde` no futuro (relógio dessincronizado) cai
 * em "agora" em vez de um número negativo. */
export function tempoRelativo(desde: Date, agora: Date = new Date()): TempoRelativo {
  const diffMs = Math.max(0, agora.getTime() - desde.getTime());
  if (diffMs < MINUTO_MS) return { unidade: "agora", valor: 0 };
  if (diffMs < HORA_MS) return { unidade: "minutos", valor: Math.floor(diffMs / MINUTO_MS) };
  if (diffMs < DIA_MS) return { unidade: "horas", valor: Math.floor(diffMs / HORA_MS) };
  return { unidade: "dias", valor: Math.floor(diffMs / DIA_MS) };
}
