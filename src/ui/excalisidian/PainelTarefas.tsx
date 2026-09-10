// Painel de tarefas (doc 10 §4): barra lateral vertical à direita. Cabeçalho, corpo rolável
// com as seções em ordem fixa e a divisória de largura. O estado do arraste (doc 10 §5.2)
// mora aqui e desce por props: a árvore é rasa (Painel → Seção → Linha).

import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { BotaoIcone, EstadoVazio } from "../index";
import SecaoTarefas, { dropPermitido, type Arrasto } from "./SecaoTarefas";
import NovaTarefaInline from "./NovaTarefaInline";
import ModalTarefa from "./ModalTarefa";
import { useHojeLocal } from "../../app/useHojeLocal";
import { agruparTarefas, SECOES_ORDEM } from "../../tarefas/agrupamento";
import { useTarefasStore } from "../../estado/tarefasStore";
import type { Secao } from "../../tarefas/tipos";

/**
 * Geometria da soltura — espelha `gapMaisProximo` de `moverBloco.ts`, adaptado a componentes
 * React marcados com `data-*`. Acha a `<section data-secao>` sob o ponteiro e devolve o índice
 * (0-based, na lista visível SEM a tarefa arrastada — a coordenada que `moverTarefa` espera)
 * onde a linha indicadora deve ficar. `null` quando o ponteiro não está sobre um destino
 * permitido (doc 10 §5.2: fora de qualquer seção, "Concluídas", ou "Atrasado" vindo de fora).
 */
function alvoNoPonto(
  x: number,
  y: number,
  origem: Secao,
  idArrastada: string,
): { secao: Secao; indice: number } | null {
  const pilha = document.elementsFromPoint(x, y);
  let secaoEl: HTMLElement | null = null;
  for (const el of pilha) {
    const s = (el as HTMLElement).closest?.("section[data-secao]") as HTMLElement | null;
    if (s) {
      secaoEl = s;
      break;
    }
  }
  if (!secaoEl) return null;

  const secao = secaoEl.dataset.secao as Secao;
  if (!dropPermitido(secao, origem)) return null;

  const linhas = Array.from(
    secaoEl.querySelectorAll<HTMLElement>("[data-tarefa-id]"),
  ).filter((el) => el.dataset.tarefaId !== idArrastada);
  if (linhas.length === 0) return { secao, indice: 0 };

  for (let i = 0; i < linhas.length; i += 1) {
    const r = linhas[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return { secao, indice: i };
  }
  return { secao, indice: linhas.length };
}

export default function PainelTarefas() {
  const aberto = useTarefasStore((s) => s.painelAberto);
  const largura = useTarefasStore((s) => s.larguraPainel);
  const definirLargura = useTarefasStore((s) => s.definirLargura);
  const alternarPainel = useTarefasStore((s) => s.alternarPainel);

  const hoje = useHojeLocal();
  const tarefas = useTarefasStore((s) => s.tarefas);
  const moverTarefa = useTarefasStore((s) => s.moverTarefa);
  const concluidasExpandidas = useTarefasStore((s) => s.concluidasExpandidas);
  const alternarConcluidas = useTarefasStore((s) => s.alternarConcluidas);
  const grupos = useMemo(() => agruparTarefas(tarefas, hoje), [tarefas, hoje]);
  const vazioTotal = tarefas.length === 0;

  // Modal de detalhe (doc 10 §5.5): `tarefaAberta` é o id; resolvemos a tarefa aqui e
  // passamos por prop. Se ela some (excluída, vault trocado), o modal não renderiza.
  const tarefaAberta = useTarefasStore((s) => s.tarefaAberta);
  const tarefaDoModal = useMemo(
    () => tarefas.find((t) => t.id === tarefaAberta) ?? null,
    [tarefas, tarefaAberta],
  );

  const arrastando = useRef(false);

  const aoArrastarDivisoria = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      arrastando.current = true;
      const mover = (ev: PointerEvent) => {
        if (!arrastando.current) return;
        // divisória na borda esquerda do painel: largura = distância até a borda direita da janela
        definirLargura(window.innerWidth - ev.clientX);
      };
      const soltar = () => {
        arrastando.current = false;
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [definirLargura],
  );

  // --- Arraste de tarefa. `arrastoRef` acompanha o estado para os listeners de `window`
  // registrados no pointerdown não lerem um valor obsoleto; `arrasto` é só o gatilho de
  // re-render que desce para as seções desenharem a linha indicadora. ---
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const arrastoRef = useRef<Arrasto | null>(null);
  const aplicarArrasto = useCallback((a: Arrasto | null) => {
    arrastoRef.current = a;
    setArrasto(a);
  }, []);

  const iniciarArrasto = useCallback(
    (id: string, origem: Secao) => aplicarArrasto({ id, origem, alvo: null }),
    [aplicarArrasto],
  );

  const moverPonteiro = useCallback(
    (x: number, y: number) => {
      const atual = arrastoRef.current;
      if (!atual) return;
      const alvo = alvoNoPonto(x, y, atual.origem, atual.id);
      const anterior = atual.alvo;
      if (anterior?.secao === alvo?.secao && anterior?.indice === alvo?.indice) return;
      aplicarArrasto({ ...atual, alvo });
    },
    [aplicarArrasto],
  );

  const soltar = useCallback(() => {
    const atual = arrastoRef.current;
    if (atual?.alvo && dropPermitido(atual.alvo.secao, atual.origem)) {
      moverTarefa(atual.id, atual.alvo.secao, atual.alvo.indice, hoje);
    }
    aplicarArrasto(null);
  }, [aplicarArrasto, moverTarefa, hoje]);

  // pointercancel: só descarta o estado de arraste, sem cometer o movimento.
  const cancelarArrasto = useCallback(() => aplicarArrasto(null), [aplicarArrasto]);

  if (!aberto) return null;

  return (
    <aside
      id="painel-tarefas"
      className="relative flex shrink-0 flex-col border-l border-regua bg-superficie"
      style={{ width: `${largura}px` }}
    >
      {/* divisória de largura: 1px visível, 8px de área de arraste */}
      <div
        onPointerDown={aoArrastarDivisoria}
        className="absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize"
      >
        <div className="mx-auto h-full w-px bg-regua" />
      </div>
      <div className="flex items-center justify-between border-b border-regua px-3 py-2">
        <span className="text-sm font-medium text-tinta">Tarefas</span>
        <BotaoIcone Icone={X} titulo="Fechar" onClick={alternarPainel} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {vazioTotal ? (
          <EstadoVazio
            titulo="Nenhuma tarefa"
            apoio="Crie a primeira e ela aparece agrupada por prazo."
          >
            <NovaTarefaInline secao="hoje" hoje={hoje} />
          </EstadoVazio>
        ) : (
          SECOES_ORDEM.map((secao) => {
            if (secao === "atrasado" && grupos.atrasado.length === 0) return null;
            return (
              <SecaoTarefas
                key={secao}
                secao={secao}
                hoje={hoje}
                tarefas={grupos[secao]}
                colapsada={secao === "concluidas" && !concluidasExpandidas}
                onAlternarColapso={
                  secao === "concluidas" ? alternarConcluidas : undefined
                }
                permiteNova={secao !== "atrasado" && secao !== "concluidas"}
                arrasto={arrasto}
                aoIniciarArrasto={iniciarArrasto}
                aoMoverPonteiro={moverPonteiro}
                aoSoltar={soltar}
                aoCancelarArrasto={cancelarArrasto}
              />
            );
          })
        )}
      </div>

      {tarefaAberta && tarefaDoModal && (
        <ModalTarefa tarefa={tarefaDoModal} hoje={hoje} />
      )}
    </aside>
  );
}
