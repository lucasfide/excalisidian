// Painel de tarefas (doc 10 §4): barra lateral vertical à direita. Cabeçalho, corpo rolável
// com as seções em ordem fixa e a divisória de largura.

import { useCallback, useMemo, useRef } from "react";
import { X } from "lucide-react";

import { BotaoIcone, EstadoVazio } from "../index";
import SecaoTarefas from "./SecaoTarefas";
import NovaTarefaInline from "./NovaTarefaInline";
import { useHojeLocal } from "../../app/useHojeLocal";
import { agruparTarefas, SECOES_ORDEM } from "../../tarefas/agrupamento";
import { useTarefasStore } from "../../estado/tarefasStore";

export default function PainelTarefas() {
  const aberto = useTarefasStore((s) => s.painelAberto);
  const largura = useTarefasStore((s) => s.larguraPainel);
  const definirLargura = useTarefasStore((s) => s.definirLargura);
  const alternarPainel = useTarefasStore((s) => s.alternarPainel);

  const hoje = useHojeLocal();
  const tarefas = useTarefasStore((s) => s.tarefas);
  const concluidasExpandidas = useTarefasStore((s) => s.concluidasExpandidas);
  const alternarConcluidas = useTarefasStore((s) => s.alternarConcluidas);
  const grupos = useMemo(() => agruparTarefas(tarefas, hoje), [tarefas, hoje]);
  const vazioTotal = tarefas.length === 0;

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
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [definirLargura],
  );

  if (!aberto) return null;

  return (
    <aside
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
              />
            );
          })
        )}
      </div>
    </aside>
  );
}
