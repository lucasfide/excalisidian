// Aba do painel de Início: invisível. Ela existe só por dois motivos — sem "x", a Home não se
// fecha pela UI (doc 09 ADR-16: fechar a Home e depois todas as outras deixava o painel
// principal vazio, sem nenhum jeito de voltar); e o dockview exige uma aba por painel. Quem
// representa a Home na faixa é a casinha (BotaoInicioAba.tsx), que fica marcada quando a Home
// está ativa. Mostrar esta aba com o texto "Início" ao lado da casinha lia como duas Home
// (pedido do usuário, 16/09/2026) — a classe `aba-inicio` faz o CSS esconder a `.dv-tab`
// inteira (dockview-excalisidian.css), não só o conteúdo, senão sobraria a ficha vazia.

import type { IDockviewPanelHeaderProps } from "dockview";

export default function AbaInicio(_props: IDockviewPanelHeaderProps) {
  return <span className="aba-inicio" aria-hidden />;
}
