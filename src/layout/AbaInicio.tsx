// Aba do painel de Início: igual AbaDocumento.tsx, mas sem o "x" de fechar — a Home é fixa
// (doc 09 ADR-16: "não pode ser arrastada nem fechada sem código dedicado"). Sem isso, fechar
// esta aba (e depois todas as outras) deixava o painel principal completamente vazio, sem
// nenhum jeito de voltar pela UI: o próprio botão de abrir a Home (BotaoInicioAba.tsx) vive
// dentro do cabeçalho de abas do dockview, que some junto quando o último grupo é removido.

import { Home } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

export default function AbaInicio(props: IDockviewPanelHeaderProps) {
  return (
    <div className="flex h-full items-center gap-2 px-3 text-[13px] text-tinta-media">
      <Home size={14} strokeWidth={1.5} aria-hidden />
      <span className="truncate">{props.api.title}</span>
    </div>
  );
}
