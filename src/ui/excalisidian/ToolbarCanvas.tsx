// Toolbar flutuante do canvas (doc 06). Barra no topo, centralizada; substitui a toolbar
// nativa do Excalidraw (escondida por CSS). Três grupos separados por hairline.

import {
  MousePointer2,
  Hand,
  Square,
  Diamond,
  Circle,
  MoveRight,
  Minus,
  Pencil,
  Type,
  StickyNote,
  Image as ImageIcon,
  Eraser,
  type LucideIcon,
} from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type Ferramenta =
  | "selection"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "postit"
  | "image"
  | "eraser";

interface ItemFerramenta {
  ferramenta: Ferramenta;
  rotulo: string;
  tecla: string;
  Icone: LucideIcon;
}

const GRUPOS: ItemFerramenta[][] = [
  [
    { ferramenta: "selection", rotulo: "Seleção", tecla: "V", Icone: MousePointer2 },
    { ferramenta: "hand", rotulo: "Mão", tecla: "H", Icone: Hand },
  ],
  [
    { ferramenta: "rectangle", rotulo: "Retângulo", tecla: "R", Icone: Square },
    { ferramenta: "diamond", rotulo: "Losango", tecla: "D", Icone: Diamond },
    { ferramenta: "ellipse", rotulo: "Elipse", tecla: "O", Icone: Circle },
    { ferramenta: "arrow", rotulo: "Seta", tecla: "A", Icone: MoveRight },
    { ferramenta: "line", rotulo: "Linha", tecla: "L", Icone: Minus },
    { ferramenta: "freedraw", rotulo: "Mão livre", tecla: "P", Icone: Pencil },
  ],
  [
    { ferramenta: "text", rotulo: "Texto", tecla: "T", Icone: Type },
    { ferramenta: "postit", rotulo: "Post-it", tecla: "S", Icone: StickyNote },
    { ferramenta: "image", rotulo: "Imagem", tecla: "9", Icone: ImageIcon },
    { ferramenta: "eraser", rotulo: "Borracha", tecla: "E", Icone: Eraser },
  ],
];

interface Props {
  api: ExcalidrawImperativeAPI | null;
  ferramentaAtiva: string;
  onPostit: () => void;
}

export default function ToolbarCanvas({ api, ferramentaAtiva, onPostit }: Props) {
  const acionar = (f: Ferramenta) => {
    if (!api) return;
    if (f === "postit") {
      onPostit();
      return;
    }
    api.setActiveTool({ type: f });
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-ficha border border-regua bg-superficie p-1 shadow-[var(--shadow-sobreposicao)]">
      {GRUPOS.map((grupo, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span className="mx-1 h-6 w-px bg-regua" />}
          {grupo.map(({ ferramenta, rotulo, tecla, Icone }) => {
            const ativa = ferramentaAtiva === ferramenta;
            return (
              <button
                key={ferramenta}
                title={`${rotulo} (${tecla})`}
                onClick={() => acionar(ferramenta)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-controle ${
                  ativa ? "bg-musgo text-superficie" : "text-tinta-media hover:bg-lavagem"
                }`}
              >
                <Icone size={18} strokeWidth={1.5} />
                <span
                  className={`absolute bottom-[1px] right-[2px] text-[9px] font-medium leading-none tracking-[0.06em] ${
                    ativa ? "text-superficie/70" : "text-tinta-suave"
                  }`}
                >
                  {tecla}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
