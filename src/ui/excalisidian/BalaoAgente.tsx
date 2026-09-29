// Balão do agente de IA (doc 11 §6.1, doc 06 "Balão e painel do agente"): canto inferior
// direito, acima do Toaster, só existe quando o agente está habilitado — sem configuração,
// este componente renderiza null e o produto não sabe que ele existe (RF11.2).
// Alterna o painel. Os estados visuais do doc 11: ocioso/observando/pensando/convite/
// sugestões/pausado/erro — convite e sugestões chegam na fase 2; aqui: ocioso, pensando,
// pausado, erro.

import type { ReactNode } from "react";
import { Bot } from "lucide-react";

import { cn } from "../../ui";
import { useAgenteStore } from "../../estado/agenteStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";

const TOOLTIP: Record<string, string> = {
  desligado: "Agente",
  ocioso: "Agente",
  observando: "Agente — acompanhando esta nota",
  pensando: "Agente — pensando",
  pausado: "Agente — pausado",
  erro: "Agente — erro",
};

export default function BalaoAgente(): ReactNode {
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const status = useAgenteStore((s) => s.status);
  const painelAberto = useAgenteStore((s) => s.painelAberto);
  const convite = useAgenteStore((s) => s.convite);
  const sugestoes = useAgenteStore((s) => s.sugestoes);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const sugestoesAtivas = caminhoAtivo ? (sugestoes[caminhoAtivo] ?? []) : [];

  if (!habilitado) return null;

  const rotulo = convite ? "convite" : sugestoesAtivas.length > 0 ? "sugestões" : status;
  const tooltip = convite
    ? "Agente — convite para acompanhar a nota"
    : (TOOLTIP[status] ?? "Agente");

  return (
    <button
      type="button"
      data-balao-agente
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={painelAberto}
      onClick={() => useAgenteStore.getState().alternarPainel()}
      className={cn(
        "fixed bottom-4 right-4 z-[90] flex h-10 w-10 items-center justify-center",
        "rounded-pilula border border-regua bg-superficie shadow-ficha",
        "transition-colors duration-[140ms] ease-caderno",
        status === "pensando" &&
          "motion-safe:animate-[pulsoAgente_1.6s_ease-in-out_infinite]",
        painelAberto && "border-regua-forte",
      )}
    >
      <Bot
        size={18}
        strokeWidth={1.5}
        aria-hidden
        className={cn(
          status === "erro" && "text-bordo",
          status === "pensando" && "text-ocre-tinta",
          status === "pausado" && "opacity-50",
          (status === "ocioso" || status === "desligado") && "text-tinta-suave",
          status === "observando" && "text-tinta-media",
        )}
      />
      {rotulo === "convite" && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pilula bg-cristal px-1 meta text-superficie"
        >
          !
        </span>
      )}
      {rotulo === "sugestões" && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pilula bg-cristal px-1 [font-size:9px] [line-height:1] font-medium text-superficie"
        >
          {sugestoesAtivas.length}
        </span>
      )}
      {(status === "observando" || status === "pensando") && !convite && sugestoesAtivas.length === 0 && (
        <span
          aria-hidden
          className={cn(
            "absolute right-1 top-1 h-2 w-2 rounded-pilula",
            status === "pensando" ? "bg-ocre" : "bg-cristal",
          )}
        />
      )}
    </button>
  );
}
