// Barra de formatação do editor de nota (doc 06): flutuante, grudada acima do texto
// selecionado ou da linha do cursor, mesma linguagem visual do ToolbarCanvas — Superficie
// flutuante, botões de 32px/ícone 18px, grupos separados por hairline vertical. Ou acoplada
// embaixo da nota (PainelDocumento), quando o usuário prefere ela parada num lugar só. Sem
// atalho de teclado catalogado aqui: quem quiser o atalho já tem (atalhosFormatacao.ts); a
// barra existe pra quem não usa.

import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  SquareCheck,
  Link,
  Table,
  PanelBottom,
  PanelBottomClose,
  type LucideIcon,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";

import { BotaoIcone, Superficie } from "../index";
import { usePrefsStore } from "../../estado/prefsStore";
import {
  envolver,
  alternarHeading,
  alternarPrefixoLinha,
  alternarListaNumerada,
  inserirLink,
  inserirTabela,
} from "../../editor/extensoes/comandosMarkdown";

interface Props {
  view: EditorView;
  /** `flutuante`: tooltip do CodeMirror (barraFlutuante.ts). `acoplada`: faixa ancorada
   * embaixo da nota (PainelDocumento.tsx) — sem sombra, porque superfície ancorada não tem. */
  modo?: "flutuante" | "acoplada";
}

interface Acao {
  Icone: LucideIcon;
  titulo: string;
  executar: (view: EditorView) => boolean;
  // `inserirTabela` já deixa o foco dentro da célula nova (doc 14 §1.1) — chamar
  // `view.focus()` depois dela tiraria o foco de lá e devolveria pro corpo do editor.
  mantemProprioFoco?: boolean;
}

const GRUPOS: Acao[][] = [
  [
    { Icone: Bold, titulo: "Negrito", executar: envolver("**") },
    { Icone: Italic, titulo: "Itálico", executar: envolver("*") },
    { Icone: Strikethrough, titulo: "Riscado", executar: envolver("~~") },
    { Icone: Code, titulo: "Código", executar: envolver("`") },
  ],
  [
    { Icone: Heading1, titulo: "Título 1", executar: alternarHeading(1) },
    { Icone: Heading2, titulo: "Título 2", executar: alternarHeading(2) },
    { Icone: Heading3, titulo: "Título 3", executar: alternarHeading(3) },
  ],
  [
    { Icone: Quote, titulo: "Citação", executar: alternarPrefixoLinha("> ") },
    { Icone: List, titulo: "Lista", executar: alternarPrefixoLinha("- ") },
    { Icone: ListOrdered, titulo: "Lista numerada", executar: alternarListaNumerada() },
    {
      Icone: SquareCheck,
      titulo: "Checkbox",
      executar: alternarPrefixoLinha("- [ ] ", ["- [x] ", "- [X] "]),
    },
    { Icone: Link, titulo: "Link", executar: inserirLink() },
  ],
  // Grupo próprio no fim da barra (doc 14 §1.1): criar tabela também sem saber a sintaxe.
  [{ Icone: Table, titulo: "Tabela", executar: inserirTabela(), mantemProprioFoco: true }],
];

// mousedown com preventDefault: sem isto, o clique tiraria o foco do editor e colapsaria a
// seleção ANTES do comando rodar (mesmo truque de CampoLink.tsx).
const manterFoco = (e: React.MouseEvent) => e.preventDefault();

function Botoes({ view }: { view: EditorView }) {
  return (
    <>
      {GRUPOS.map((grupo, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="mx-1 h-6 w-px bg-regua" />}
          {grupo.map(({ Icone, titulo, executar, mantemProprioFoco }) => (
            <BotaoIcone
              key={titulo}
              Icone={Icone}
              titulo={titulo}
              onMouseDown={manterFoco}
              onClick={() => {
                executar(view);
                if (!mantemProprioFoco) view.focus();
              }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

export default function BarraFlutuanteFormatacao({ view, modo = "flutuante" }: Props) {
  const alternarAcoplada = usePrefsStore((s) => s.alternarBarraFormatacaoAcoplada);

  if (modo === "acoplada") {
    return (
      <div role="toolbar" aria-label="Formatação do texto" className="flex items-center gap-1">
        <Botoes view={view} />
        <span aria-hidden className="mx-1 h-6 w-px bg-regua" />
        <BotaoIcone
          Icone={PanelBottomClose}
          titulo="Desacoplar"
          onMouseDown={manterFoco}
          onClick={() => {
            alternarAcoplada();
            view.focus();
          }}
        />
      </div>
    );
  }

  // O botão de acoplar fica FORA da barra (pedido do usuário, 16/09/2026): é uma ação sobre a
  // barra, não sobre o texto — numa superfície própria ao lado ele não se confunde com a
  // formatação.
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <Superficie
        flutuante
        role="toolbar"
        aria-label="Formatação do texto"
        className="flex items-center gap-1 p-1"
      >
        <Botoes view={view} />
      </Superficie>
      <Superficie flutuante className="p-1">
        <BotaoIcone
          Icone={PanelBottom}
          titulo="Acoplar embaixo"
          onMouseDown={manterFoco}
          onClick={alternarAcoplada}
        />
      </Superficie>
    </div>
  );
}
