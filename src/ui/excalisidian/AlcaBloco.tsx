// Alça de arrastar bloco (doc 06, Ícones: grip-vertical), montada dentro do editor de nota por
// moverBloco.ts via createRoot — mesmo padrão de BarraFlutuanteFormatacao.tsx dentro de
// barraFlutuante.ts. Sem estado próprio: só repassa o pointerdown pra quem controla o arraste.

import type { PointerEvent } from "react";
import { GripVertical } from "lucide-react";

import { BotaoIcone } from "../index";

interface Props {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}

export default function AlcaBloco({ onPointerDown }: Props) {
  return (
    <BotaoIcone
      Icone={GripVertical}
      titulo="Mover bloco"
      tamanho={16}
      className="cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
    />
  );
}
