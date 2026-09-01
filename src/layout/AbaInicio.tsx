// Aba do painel de Início: igual AbaDocumento.tsx (mesmo espaçamento e tipografia, sem ícone —
// nenhuma outra aba tem), só que sem o "x" de fechar — a Home é fixa (doc 09 ADR-16: "não pode
// ser arrastada nem fechada sem código dedicado"). Sem isso, fechar esta aba (e depois todas as
// outras) deixava o painel principal completamente vazio, sem nenhum jeito de voltar pela UI: o
// próprio botão de abrir a Home (BotaoInicioAba.tsx) vive dentro do cabeçalho de abas do
// dockview, que some junto quando o último grupo é removido.
//
// Sem ícone de casa aqui: o botão de acesso (BotaoInicioAba, à esquerda de todas as abas) já é
// um ícone de casa — repetir na aba ao lado lia como "duas Home" (achado em uso real).

import type { IDockviewPanelHeaderProps } from "dockview";

export default function AbaInicio(props: IDockviewPanelHeaderProps) {
  return (
    <div className="flex h-full items-center gap-2 px-3 text-[13px] text-tinta-media">
      <span className="truncate">{props.api.title}</span>
    </div>
  );
}
