// Aba do dockview: nome + indicador de não salvo + botão de fechar (doc 06 / doc 04 §1), clique
// do meio pra fechar, e o menu de clique direito (renomear, duplicar, dividir, fechar em lote).
// O ponto ao lado do nome: `ocre` sujo, pulsando ao salvar, `bordo` no erro. A informação
// nunca é transmitida só por cor — o ponto existe além dela (doc 06, piso de qualidade).

import { useState } from "react";
import { createPortal } from "react-dom";
import { Columns2, Copy, Pencil, Rows2, SquareX, X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

import { useDocumentosStore, type EstadoDoc } from "../estado/documentosStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { comandoDuplicar, comandoRenomear } from "../app/comandos/criacao";
import { BotaoIcone, ItemMenu, Menu, SeparadorMenu, type PosicaoMenu } from "../ui";

function pontoDoEstado(
  estado: EstadoDoc | undefined,
): { cor: string; rotulo: string; pulsando: boolean } | null {
  if (estado === "editando") {
    return { cor: "var(--color-ocre)", rotulo: "não salvo", pulsando: false };
  }
  if (estado === "salvando") {
    return { cor: "var(--color-ocre)", rotulo: "salvando", pulsando: true };
  }
  if (estado === "erro") {
    return { cor: "var(--color-bordo)", rotulo: "erro ao salvar", pulsando: false };
  }
  if (estado === "conflito" || estado === "orfao") {
    return { cor: "var(--color-bordo)", rotulo: "mudou fora do app", pulsando: false };
  }
  return null;
}

export default function AbaDocumento(props: IDockviewPanelHeaderProps) {
  const path = (props.params as { path?: string }).path;
  const estado = useDocumentosStore((s) =>
    path ? s.docs.get(path)?.estado : undefined,
  );
  const ponto = pontoDoEstado(estado);
  const [menu, setMenu] = useState<PosicaoMenu | null>(null);

  // Cada item fecha o menu antes de agir: renomear abre um diálogo, e o menu ficaria por cima.
  const comMenuFechado = (acao: () => void) => () => {
    setMenu(null);
    acao();
  };
  const dividir = (direcao: "right" | "below") => {
    props.api.setActive();
    useWorkspaceStore.getState().dividirAtivo(direcao);
  };

  return (
    <div
      className="group relative flex h-full items-center gap-2 px-3 text-[13px] text-tinta-media"
      // Menu próprio em vez do `getTabContextMenuItems` do dockview: aquele não abria (o clique
      // direito caía no menu nativo do WebView2, com "Back"/"Refresh"), e este usa o Menu do app.
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      // Clique do meio fecha a aba, como no navegador. O preventDefault no mousedown impede a
      // rolagem automática do Chromium (o cursor de quatro setas) de entrar antes do clique.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        props.api.close();
      }}
    >
      {ponto && (
        <span
          title={ponto.rotulo}
          aria-label={ponto.rotulo}
          className={`h-[6px] w-[6px] shrink-0 rounded-full ${
            ponto.pulsando ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
          style={{ backgroundColor: ponto.cor }}
        />
      )}
      {/* O X não reserva espaço: fica por cima do fim do nome, e só aparece no hover (ou no
          foco por teclado). Enquanto ele está visível, o fim do nome esmaece pra ele não
          disputar leitura com as letras. */}
      <span className="truncate group-hover:[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] group-has-[:focus-visible]:[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
        {props.api.title}
      </span>
      <BotaoIcone
        Icone={X}
        titulo="Fechar aba"
        tamanho={16}
        className="absolute inset-y-0 right-1 my-auto opacity-0 transition-[opacity,background-color,color] duration-[140ms] ease-caderno group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          props.api.close();
        }}
      />
      {/* Portal: o cabeçalho de abas do dockview recorta o que transborda dele. */}
      {menu &&
        createPortal(
          <Menu posicao={menu} onFechar={() => setMenu(null)}>
            {/* Aba em branco (Ctrl+T) não tem arquivo: sem renomear, duplicar nem dividir. */}
            {path && (
              <>
                <ItemMenu
                  Icone={Pencil}
                  rotulo="Renomear"
                  onClick={comMenuFechado(() => void comandoRenomear(path))}
                />
                <ItemMenu
                  Icone={Copy}
                  rotulo="Duplicar"
                  onClick={comMenuFechado(() => void comandoDuplicar(path))}
                />
                <SeparadorMenu />
                <ItemMenu
                  Icone={Columns2}
                  rotulo="Dividir à direita"
                  onClick={comMenuFechado(() => dividir("right"))}
                />
                <ItemMenu
                  Icone={Rows2}
                  rotulo="Dividir abaixo"
                  onClick={comMenuFechado(() => dividir("below"))}
                />
                <SeparadorMenu />
              </>
            )}
            <ItemMenu
              Icone={X}
              rotulo="Fechar todas as outras abas desta janela"
              onClick={comMenuFechado(() => useWorkspaceStore.getState().fecharOutras(props.api.id))}
            />
            <ItemMenu
              Icone={SquareX}
              rotulo="Fechar todas as abas desta janela"
              onClick={comMenuFechado(() => useWorkspaceStore.getState().fecharTodas(props.api.id))}
            />
          </Menu>,
          document.body,
        )}
    </div>
  );
}
