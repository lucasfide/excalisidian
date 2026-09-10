// Datas e agrupamento por prazo (doc 10 §3). Puro — recebe `hoje` como string YYYY-MM-DD,
// nunca lê o relógio. Semana de domingo a sábado.

import type { Tarefa, Secao } from "./tipos";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const SECOES_ORDEM: readonly Secao[] = [
  "atrasado", "hoje", "amanha", "essa-semana", "proxima-semana", "concluidas",
];

/** Data local de um Date, como YYYY-MM-DD. */
export function dataLocalDe(d: Date): string {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${a}-${m}-${dia}`;
}

/** Interpreta YYYY-MM-DD como data local ao meio-dia — meio-dia evita que somar dias
 * atravesse um limite de horário de verão e mude o dia. */
function comoData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, 12, 0, 0, 0);
}

export function addDias(iso: string, n: number): string {
  const d = comoData(iso);
  d.setDate(d.getDate() + n);
  return dataLocalDe(d);
}

/** Primeiro sábado com data >= hoje. getDay(): 0 = domingo … 6 = sábado. */
export function sabadoDaSemana(hoje: string): string {
  const g = comoData(hoje).getDay();
  return addDias(hoje, (6 - g + 7) % 7);
}

export function intervaloDaSemana(sabado: string): { inicio: string; fim: string } {
  return { inicio: addDias(sabado, -6), fim: sabado };
}

export function formatarIntervalo(inicio: string, fim: string): string {
  const di = comoData(inicio);
  const df = comoData(fim);
  if (di.getMonth() === df.getMonth()) {
    return `${di.getDate()}–${df.getDate()} de ${MESES[di.getMonth()]}`;
  }
  return `${di.getDate()} de ${MESES[di.getMonth()]} – ${df.getDate()} de ${MESES[df.getMonth()]}`;
}

export function secaoDe(t: Tarefa, hoje: string): Secao {
  if (t.concluida) return "concluidas";
  const v = t.vencimento;
  if (v < hoje) return "atrasado";
  if (v === hoje) return "hoje";
  if (v === addDias(hoje, 1)) return "amanha";
  if (v <= sabadoDaSemana(hoje)) return "essa-semana";
  return "proxima-semana";
}

export function dataDaSecao(secao: Secao, hoje: string): string | null {
  switch (secao) {
    case "hoje": return hoje;
    case "amanha": return addDias(hoje, 1);
    case "essa-semana": return sabadoDaSemana(hoje);
    case "proxima-semana": return addDias(sabadoDaSemana(hoje), 7);
    default: return null; // concluidas, atrasado
  }
}

export function agruparTarefas(tarefas: Tarefa[], hoje: string): Record<Secao, Tarefa[]> {
  const grupos: Record<Secao, Tarefa[]> = {
    atrasado: [], hoje: [], amanha: [], "essa-semana": [], "proxima-semana": [], concluidas: [],
  };
  for (const t of tarefas) grupos[secaoDe(t, hoje)].push(t);
  for (const s of SECOES_ORDEM) {
    if (s === "concluidas") {
      grupos[s].sort((a, b) => {
        const c = (b.concluidaEm ?? "").localeCompare(a.concluidaEm ?? "");
        return c !== 0 ? c : a.id.localeCompare(b.id);
      });
    } else {
      grupos[s].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
    }
  }
  return grupos;
}
