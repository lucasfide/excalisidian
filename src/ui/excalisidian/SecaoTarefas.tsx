// Uma seção do painel de tarefas (doc 10 §4.2): cabeçalho com nome + intervalo (quando é
// semana) + contador, e a lista de linhas. `permiteNova` liga o campo "Nova tarefa" no fim
// da lista. O arraste (doc 10 §5.2) entra aqui como alvo de soltura: a `<section>` carrega
// `data-secao` e cada linha carrega `data-tarefa-id`, e uma linha de 1px em `bg-musgo` marca
// onde a tarefa vai cair.

import type { ReactNode } from "react";

import LinhaTarefa from "./LinhaTarefa";
import NovaTarefaInline from "./NovaTarefaInline";
import type { Secao, Tarefa } from "../../tarefas/tipos";
import {
  addDias,
  sabadoDaSemana,
  intervaloDaSemana,
  formatarIntervalo,
} from "../../tarefas/agrupamento";

/** Estado de um arraste em andamento, compartilhado pelo `PainelTarefas`. `alvo` é atualizado
 * a cada movimento do ponteiro; `null` enquanto o ponteiro não está sobre um destino
 * válido. */
export interface Arrasto {
  id: string;
  origem: Secao;
  alvo: { secao: Secao; indice: number } | null;
}

/** Regras de destino do doc 10 §5.2: "Concluídas" nunca aceita soltura; "Atrasado" só aceita
 * reordenação interna, nunca uma tarefa vinda de outra seção. Todo o resto aceita. */
export function dropPermitido(secao: Secao, origem: Secao): boolean {
  if (secao === "concluidas") return false;
  if (secao === "atrasado" && origem !== "atrasado") return false;
  return true;
}

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
  permiteNova?: boolean;
  arrasto?: Arrasto | null;
  aoIniciarArrasto?: (id: string, origem: Secao) => void;
  aoMoverPonteiro?: (x: number, y: number) => void;
  aoSoltar?: () => void;
  aoCancelarArrasto?: () => void;
}

export default function SecaoTarefas({
  secao,
  hoje,
  tarefas,
  colapsada = false,
  onAlternarColapso,
  permiteNova = false,
  arrasto = null,
  aoIniciarArrasto,
  aoMoverPonteiro,
  aoSoltar,
  aoCancelarArrasto,
}: Props) {
  const sub = subtitulo(secao, hoje);
  const cabecalhoClicavel = secao === "concluidas";

  // Índice (0-based, na lista visível SEM a tarefa arrastada — mesma coordenada que o store
  // espera em `moverTarefa`) onde desenhar a linha indicadora. -1 = não desenhar.
  const mostrarLinha =
    !!arrasto?.alvo && arrasto.alvo.secao === secao && dropPermitido(secao, arrasto.origem);
  const indiceLinha = mostrarLinha ? arrasto!.alvo!.indice : -1;

  const linhaIndicadora = (chave: string) => (
    <div key={chave} className="pointer-events-none h-px bg-musgo" data-linha-soltura="" />
  );

  return (
    <section className="mb-4" data-secao={secao}>
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
          {(() => {
            const filhos: ReactNode[] = [];
            let indiceStore = 0;
            tarefas.forEach((t, i) => {
              const ehArrastada = arrasto?.id === t.id;
              if (!ehArrastada) {
                if (indiceStore === indiceLinha) {
                  filhos.push(linhaIndicadora(`soltura-${indiceStore}`));
                }
                indiceStore += 1;
              }
              filhos.push(
                <LinhaTarefa
                  key={t.id}
                  tarefa={t}
                  hoje={hoje}
                  secao={secao}
                  indice={i}
                  arrastando={ehArrastada}
                  aoIniciarArrasto={aoIniciarArrasto}
                  aoMoverPonteiro={aoMoverPonteiro}
                  aoSoltar={aoSoltar}
                  aoCancelarArrasto={aoCancelarArrasto}
                />,
              );
            });
            if (indiceStore === indiceLinha) filhos.push(linhaIndicadora("soltura-fim"));
            return filhos;
          })()}
          {permiteNova && <NovaTarefaInline secao={secao} hoje={hoje} />}
        </div>
      )}
    </section>
  );
}
