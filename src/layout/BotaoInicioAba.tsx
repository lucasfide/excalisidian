// Botão fixo à esquerda de todas as abas (pedido do usuário 29/08/2026): abre/foca a Home.
// Vive fora da lista de abas de verdade — usa o slot nativo `prefixHeaderActionsComponent`
// do dockview, então não pode ser arrastado/fechado como uma aba comum.
//
// É a única representação da Home na faixa: a aba do painel de Início fica escondida
// (AbaInicio.tsx). Por isso, com a Home visível neste grupo, a casinha assume o visual de aba
// ativa — mesmas variáveis `--dv-*` das abas e a mesma fusão com o conteúdo (descer 1px sobre
// a hairline da faixa, dockview-excalisidian.css) —, senão nada na faixa diria o que está aberto.

import type { IDockviewHeaderActionsProps } from "dockview";
import { Home } from "lucide-react";

import { BotaoIcone } from "../ui";
import { cn } from "../ui/cn";
import { useWorkspaceStore, ID_PAINEL_INICIO } from "../estado/workspaceStore";

export default function BotaoInicioAba({ activePanel, isGroupActive }: IDockviewHeaderActionsProps) {
  const inicioVisivel = activePanel?.id === ID_PAINEL_INICIO;
  return (
    <div
      className={cn(
        "flex h-full items-center border-r border-regua px-1",
        inicioVisivel && "botao-inicio-ativo",
        inicioVisivel && (isGroupActive ? "bg-superficie" : "bg-lavagem"),
      )}
    >
      <BotaoIcone
        Icone={Home}
        titulo="Início"
        aria-current={inicioVisivel ? "page" : undefined}
        className={cn(inicioVisivel && isGroupActive && "text-tinta")}
        onClick={() => useWorkspaceStore.getState().abrirInicio()}
      />
    </div>
  );
}
