// Uma seção do painel de tarefas (doc 10 §4.2): cabeçalho com nome + intervalo (quando é
// semana) + contador, e a lista de linhas. O botão "Nova tarefa" entra no Task 8 via
// `permiteNova`.

import LinhaTarefa from "./LinhaTarefa";
import type { Secao, Tarefa } from "../../tarefas/tipos";
import {
  addDias,
  sabadoDaSemana,
  intervaloDaSemana,
  formatarIntervalo,
} from "../../tarefas/agrupamento";

const NOME: Record<Secao, string> = {
  atrasado: "Atrasado",
  hoje: "Hoje",
  amanha: "Amanhã",
  "essa-semana": "Essa semana",
  "proxima-semana": "Próxima semana",
  concluidas: "Concluídas",
};

function subtitulo(secao: Secao, hoje: string): string | null {
  if (secao === "essa-semana") {
    const { inicio, fim } = intervaloDaSemana(sabadoDaSemana(hoje));
    return formatarIntervalo(inicio, fim);
  }
  if (secao === "proxima-semana") {
    const { inicio, fim } = intervaloDaSemana(addDias(sabadoDaSemana(hoje), 7));
    return formatarIntervalo(inicio, fim);
  }
  return null;
}

interface Props {
  secao: Secao;
  hoje: string;
  tarefas: Tarefa[];
  colapsada?: boolean;
  onAlternarColapso?: () => void;
}

export default function SecaoTarefas({
  secao,
  hoje,
  tarefas,
  colapsada = false,
  onAlternarColapso,
}: Props) {
  const sub = subtitulo(secao, hoje);
  const cabecalhoClicavel = secao === "concluidas";

  return (
    <section className="mb-4">
      <button
        type="button"
        disabled={!cabecalhoClicavel}
        onClick={onAlternarColapso}
        className="mb-1 flex w-full items-baseline gap-2 border-b border-regua pb-1 text-left"
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-tinta-suave">
          {NOME[secao]}
        </span>
        {sub && <span className="text-[11px] text-tinta-suave">· {sub}</span>}
        <span className="ml-auto text-[11px] text-tinta-suave">{tarefas.length}</span>
      </button>

      {!colapsada && (
        <div className="flex flex-col gap-0.5">
          {tarefas.map((t) => (
            <LinhaTarefa key={t.id} tarefa={t} hoje={hoje} />
          ))}
        </div>
      )}
    </section>
  );
}
