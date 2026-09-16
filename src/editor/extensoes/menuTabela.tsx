// Extensão CM6 que dá corpo ao `tableMenuFacet` de `atomico/table-widget.ts` (doc 14 §2.2):
// o vendorizado só detecta o clique direito numa célula e monta um `TableMenuRequest`; este
// arquivo é quem decide o que aparece no menu, com o `Menu`/`ItemMenu` do app (padrão visual do
// doc 06), em português, e chama de volta `apply`/`deleteTable` com o resultado das operações
// puras de `atomico/table-model.ts`.
//
// Import direto de `../atomico/table-widget` e `../atomico/table-model` (não via
// `atomico/index.ts`): a regra do LEIA-ME de lá ("só EditorNota.tsx importa daqui") é de antes
// de a tabela precisar expor essa API pro app; o contrato do doc 14 §2.2 pede explicitamente
// que este arquivo forneça o handler do facet, então a única forma é importar os dois módulos
// aqui. Reportado no relatório da tarefa como desvio da convenção.
//
// Uma instância de menu por vez (nível de módulo, não por editor): dois splits com tabela não
// deveriam ter dois menus de tabela abertos ao mesmo tempo — abrir um novo fecha o anterior.

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Extension } from "@codemirror/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Check,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Menu, ItemMenu, SeparadorMenu } from "../../ui/Menu";
import {
  tableLabelsFacet,
  tableMenuFacet,
  type TableMenuRequest,
} from "../atomico/table-widget";
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  setAlign,
  type ColumnAlign,
} from "../atomico/table-model";

interface PropsMenuTabela {
  requisicao: TableMenuRequest;
  onFechar: () => void;
}

function MenuTabela({ requisicao, onFechar }: PropsMenuTabela) {
  const { scope, model, row, col } = requisicao;

  // Fecha o menu depois de aplicar a ação — todo item executa exatamente uma operação e some.
  const executar = (acao: () => void) => () => {
    acao();
    onFechar();
  };

  const mostrarSecaoLinha = scope === "cell-body" || scope === "row-handle";
  const mostrarSecaoColuna =
    scope === "cell-body" || scope === "cell-header" || scope === "column-handle";

  // "o alinhamento atual da coluna aparece marcado" (doc 14 §1.3): sem mudar `ItemMenu`, a
  // única forma de marcar sem alterar o visual dele é trocar o ícone do item já ativo pelo
  // ícone de confirmação — `ItemMenu` só recebe um `LucideIcon` qualquer, então isso não pede
  // nenhuma mudança lá. Não desabilita o item: clicar de novo no alinhamento já ativo é
  // inofensivo (`setAlign` devolve o mesmo alinhamento).
  const iconeAlinhamento = (alvo: ColumnAlign, padrao: LucideIcon): LucideIcon =>
    model.aligns[col] === alvo ? Check : padrao;

  return (
    <Menu posicao={{ x: requisicao.x, y: requisicao.y }} onFechar={onFechar}>
      {mostrarSecaoLinha && (
        <>
          <ItemMenu
            Icone={BetweenHorizontalStart}
            rotulo="Inserir linha acima"
            onClick={executar(() =>
              requisicao.apply(insertRow(model, row), { row, col: 0 }),
            )}
          />
          <ItemMenu
            Icone={BetweenHorizontalEnd}
            rotulo="Inserir linha abaixo"
            onClick={executar(() =>
              requisicao.apply(insertRow(model, row + 1), { row: row + 1, col: 0 }),
            )}
          />
          <ItemMenu
            Icone={ArrowUp}
            rotulo="Mover linha para cima"
            desabilitado={row <= 0}
            onClick={executar(() =>
              requisicao.apply(moveRow(model, row, row - 1), { row: row - 1, col }),
            )}
          />
          <ItemMenu
            Icone={ArrowDown}
            rotulo="Mover linha para baixo"
            desabilitado={row >= model.rows.length - 1}
            onClick={executar(() =>
              requisicao.apply(moveRow(model, row, row + 1), { row: row + 1, col }),
            )}
          />
          <ItemMenu
            Icone={Trash2}
            rotulo="Excluir linha"
            onClick={executar(() => requisicao.apply(deleteRow(model, row)))}
          />
          <SeparadorMenu />
        </>
      )}

      {mostrarSecaoColuna && (
        <>
          <ItemMenu
            Icone={BetweenVerticalStart}
            rotulo="Inserir coluna à esquerda"
            onClick={executar(() =>
              requisicao.apply(insertColumn(model, col), { row, col }),
            )}
          />
          <ItemMenu
            Icone={BetweenVerticalEnd}
            rotulo="Inserir coluna à direita"
            onClick={executar(() =>
              requisicao.apply(insertColumn(model, col + 1), { row, col: col + 1 }),
            )}
          />
          <ItemMenu
            Icone={ArrowLeft}
            rotulo="Mover coluna para a esquerda"
            desabilitado={col <= 0}
            onClick={executar(() =>
              requisicao.apply(moveColumn(model, col, col - 1), { row, col: col - 1 }),
            )}
          />
          <ItemMenu
            Icone={ArrowRight}
            rotulo="Mover coluna para a direita"
            desabilitado={col >= model.header.length - 1}
            onClick={executar(() =>
              requisicao.apply(moveColumn(model, col, col + 1), { row, col: col + 1 }),
            )}
          />
          <ItemMenu
            Icone={iconeAlinhamento("left", AlignLeft)}
            rotulo="Alinhar à esquerda"
            onClick={executar(() => requisicao.apply(setAlign(model, col, "left")))}
          />
          <ItemMenu
            Icone={iconeAlinhamento("center", AlignCenter)}
            rotulo="Centralizar"
            onClick={executar(() => requisicao.apply(setAlign(model, col, "center")))}
          />
          <ItemMenu
            Icone={iconeAlinhamento("right", AlignRight)}
            rotulo="Alinhar à direita"
            onClick={executar(() => requisicao.apply(setAlign(model, col, "right")))}
          />
          <ItemMenu
            Icone={Trash2}
            rotulo="Excluir coluna"
            desabilitado={model.header.length <= 1}
            onClick={executar(() => requisicao.apply(deleteColumn(model, col)))}
          />
          <SeparadorMenu />
        </>
      )}

      <ItemMenu
        Icone={Trash2}
        rotulo="Excluir tabela"
        destrutivo
        onClick={executar(() => requisicao.deleteTable())}
      />
    </Menu>
  );
}

// Estado do menu aberto no momento, se houver — nível de módulo de propósito (ver o comentário
// do topo do arquivo).
let menuAberto: { fechar: () => void } | null = null;

function abrirMenuTabela(requisicao: TableMenuRequest): void {
  menuAberto?.fechar();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let fechado = false;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    if (menuAberto?.fechar === fechar) menuAberto = null;
    root.unmount();
    container.remove();
  };
  menuAberto = { fechar };

  root.render(createElement(MenuTabela, { requisicao, onFechar: fechar }));
}

// [excalisidian] O vendorizado não carrega texto em português (doc 14 §2.3): os títulos das
// faixas "+" e das alças (doc 14 §3) entram aqui, junto do handler do menu, porque este é o
// único arquivo de projeto que já fornece extensões para `table-widget.ts`.
export const menuTabela: Extension = [
  tableMenuFacet.of(abrirMenuTabela),
  tableLabelsFacet.of({
    addColumn: "Adicionar coluna",
    addRow: "Adicionar linha",
    rowHandle: "Arraste para mover a linha. Clique para mais opções.",
    columnHandle: "Arraste para mover a coluna. Clique para mais opções.",
  }),
];
