// Botão fixo à esquerda de todas as abas (pedido do usuário 29/08/2026): abre/foca a Home.
// Vive fora da lista de abas de verdade — usa o slot nativo `prefixHeaderActionsComponent`
// do dockview, então nunca aparece na lista de "próxima aba" (Ctrl+Tab) nem pode ser
// arrastado/fechado como uma aba comum.

import { Home } from "lucide-react";

import { BotaoIcone } from "../ui";
import { useWorkspaceStore } from "../estado/workspaceStore";

export default function BotaoInicioAba() {
  return (
    <div className="flex items-center border-r border-regua px-1">
      <BotaoIcone
        Icone={Home}
        titulo="Início"
        onClick={() => useWorkspaceStore.getState().abrirInicio()}
      />
    </div>
  );
}
