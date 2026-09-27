// Teclas de um atalho do glossário (doc 06, inventário: `TeclasAtalho`). Cada tecla é uma
// "tecla de máquina" num <kbd>: `meta`, hairline `regua`, `raio-controle`, fundo `superficie`.
// Combinações alternativas (refazer = Ctrl Y ou Ctrl Shift Z) vêm separadas por "ou"; um gesto
// de mouse ("Clique triplo") vira um <kbd> com o texto do gesto.

import { Fragment } from "react";

import { cn } from "../cn";
import { ehMac, rotulosDoCombo } from "../../app/glossario/teclas";
import type { ComboTeclas } from "../../app/glossario/tipos";

interface Props {
  teclas: readonly ComboTeclas[];
  gesto?: string;
  className?: string;
}

const CLASSE_TECLA =
  "meta rounded-controle border border-regua bg-superficie px-1.5 py-0.5 text-tinta-media";

export default function TeclasAtalho({ teclas, gesto, className }: Props) {
  // Plataforma lida uma vez por render: não muda com o app aberto.
  const mac = ehMac();
  const grupos = teclas.map((combo) => rotulosDoCombo(combo, mac));

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {grupos.map((rotulos, i) => (
        <Fragment key={teclas[i]}>
          {i > 0 && <Ou />}
          {/* <kbd> aninhado é a marcação do HTML para "aperte estas teclas juntas". */}
          <kbd className="inline-flex items-center gap-1">
            {rotulos.map((rotulo, j) => (
              <kbd key={j} className={CLASSE_TECLA}>
                {rotulo}
              </kbd>
            ))}
          </kbd>
        </Fragment>
      ))}
      {gesto && (
        <>
          {grupos.length > 0 && <Ou />}
          <kbd className={CLASSE_TECLA}>{gesto}</kbd>
        </>
      )}
    </span>
  );
}

function Ou() {
  return <span className="text-pequeno text-tinta-suave">ou</span>;
}
