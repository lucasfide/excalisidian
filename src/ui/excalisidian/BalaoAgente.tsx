// Balão do agente de IA (doc 11 §6.1, doc 06 "Balão e painel do agente"): canto inferior
// direito, acima do Toaster, só existe quando o agente está habilitado — sem configuração,
// este componente renderiza null e o produto não sabe que ele existe (RF11.2).
// Alterna o painel. Os estados visuais do doc 11: ocioso/observando/pensando/convite/
// sugestões/pausado/erro — convite e sugestões chegam na fase 2; aqui: ocioso, pensando,
// pausado, erro.

import type { ReactNode } from "react";
import { Bot } from "lucide-react";

import { cn } from "../../ui";
import { chaveConversaAgente, useAgenteStore } from "../../estado/agenteStore";
import { useDocumentosStore } from "../../estado/documentosStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import "./balao-agente.css";

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
  const novidades = useAgenteStore((s) => s.novidades);
  const atividades = useAgenteStore((s) => s.atividades);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const caminhoAtualizacoes = useDocumentosStore((s) => chaveConversaAgente(caminhoAtivo, s.docs));
  const conviteAqui = convite?.path === caminhoAtualizacoes ? convite : null;
  const atualizacoes = novidades[caminhoAtualizacoes];
  const novasSugestoes = atualizacoes?.sugestoes ?? false;
  const novaResposta = atualizacoes?.resposta ?? false;
  const trabalhandoAqui = Object.values(atividades).some((atividade) => atividade.path === caminhoAtualizacoes);
  const statusVisual = trabalhandoAqui && status !== "erro" && status !== "pausado" ? "pensando" : status;

  if (!habilitado) return null;

  const tooltipAtualizacoes = novasSugestoes && novaResposta
    ? "novas sugestões e resposta"
    : novasSugestoes
      ? "novas sugestões"
      : novaResposta
        ? "nova resposta"
        : null;
  const tooltip = conviteAqui
    ? "Agente — convite para acompanhar a nota"
    : tooltipAtualizacoes
      ? `Agente — ${tooltipAtualizacoes}`
      : (TOOLTIP[statusVisual] ?? "Agente");

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
        "balao-agente rounded-pilula border border-border bg-background shadow-ficha",
        "transition-colors duration-[140ms] ease-caderno",
        statusVisual === "pensando" &&
          "motion-safe:animate-[pulsoAgente_1.6s_ease-in-out_infinite]",
        painelAberto && "border-primary",
      )}
    >
      <Bot
        size={18}
        strokeWidth={1.5}
        aria-hidden
        className={cn(
          status === "erro" && "text-destructive",
          statusVisual === "pensando" && "text-warning-foreground",
          status === "pausado" && "opacity-50",
          (statusVisual === "ocioso" || statusVisual === "desligado") && "text-muted-foreground",
          statusVisual === "observando" && "text-foreground",
        )}
      />
      {conviteAqui && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pilula bg-primary px-1 meta text-primary-foreground"
        >
          !
        </span>
      )}
      {!conviteAqui && tooltipAtualizacoes && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pilula bg-primary"
        />
      )}
      {(statusVisual === "observando" || statusVisual === "pensando") && !conviteAqui && !tooltipAtualizacoes && (
        <span
          aria-hidden
          className={cn(
            "absolute right-1 top-1 h-2 w-2 rounded-pilula",
            statusVisual === "pensando" ? "bg-warning" : "bg-primary",
          )}
        />
      )}
    </button>
  );
}
