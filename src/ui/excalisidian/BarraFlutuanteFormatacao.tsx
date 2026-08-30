// Barra de formatação flutuante do editor de nota (doc 06): aparece grudada acima do texto
// selecionado, mesma linguagem visual do ToolbarCanvas — Superficie flutuante, botões de
// 32px/ícone 18px, grupos separados por hairline vertical. Sem atalho de teclado catalogado
// aqui: quem quiser o atalho já tem (atalhosFormatacao.ts); a barra existe pra quem não usa.

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
  type LucideIcon,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";

import { BotaoIcone, Superficie } from "../index";
import {
  envolver,
  alternarHeading,
  alternarPrefixoLinha,
  alternarListaNumerada,
  inserirLink,
} from "../../editor/extensoes/comandosMarkdown";

interface Props {
  view: EditorView;
}

interface Acao {
  Icone: LucideIcon;
  titulo: string;
  executar: (view: EditorView) => boolean;
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
];

export default function BarraFlutuanteFormatacao({ view }: Props) {
  return (
    <Superficie
      flutuante
      role="toolbar"
      aria-label="Formatação do texto"
      className="pointer-events-auto flex items-center gap-1 p-1"
    >
      {GRUPOS.map((grupo, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="mx-1 h-6 w-px bg-regua" />}
          {grupo.map(({ Icone, titulo, executar }) => (
            <BotaoIcone
              key={titulo}
              Icone={Icone}
              titulo={titulo}
              // mousedown com preventDefault: sem isto, o clique tiraria o foco do editor e
              // colapsaria a seleção ANTES do comando rodar (mesmo truque de CampoLink.tsx).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                executar(view);
                view.focus();
              }}
            />
          ))}
        </div>
      ))}
    </Superficie>
  );
}
