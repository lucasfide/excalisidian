// Painel de propriedades do canvas (doc 06): ancorado à esquerda, 216px, só visível quando há
// seleção ou uma ferramenta de desenho ativa. Escreve nos `currentItem*` do appState e aplica
// aos elementos selecionados.

import { useState, type ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { Campo, GrupoBotoes, SeletorCor, Superficie, type OpcaoGrupo } from "../index";
import type { PaletaCanvas } from "../../canvas/paletaCanvas";

interface Props {
  api: ExcalidrawImperativeAPI | null;
  /** Bump a cada onChange do Excalidraw para reler o appState. */
  tick: number;
  paleta: PaletaCanvas;
}

const ESPESSURAS: OpcaoGrupo<number>[] = [
  { rotulo: "Fina", valor: 1 },
  { rotulo: "Média", valor: 2 },
  { rotulo: "Grossa", valor: 4 },
];
const ESTILOS: OpcaoGrupo<string>[] = [
  { rotulo: "Contínua", valor: "solid" },
  { rotulo: "Tracejada", valor: "dashed" },
  { rotulo: "Pontilhada", valor: "dotted" },
];
const IMPERFEICOES: OpcaoGrupo<number>[] = [
  { rotulo: "Reta", valor: 0 },
  { rotulo: "À mão", valor: 1 },
];
const OPACIDADES: OpcaoGrupo<number>[] = [30, 60, 100].map((o) => ({
  rotulo: String(o),
  valor: o,
}));
const TAMANHOS: OpcaoGrupo<number>[] = [
  { rotulo: "P", valor: 16 },
  { rotulo: "M", valor: 20 },
  { rotulo: "G", valor: 28 },
  { rotulo: "GG", valor: 36 },
];

const FERRAMENTAS_DESENHO = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
]);

/** appState -> campo equivalente no elemento selecionado. */
const CAMPO_DO_ELEMENTO: Record<string, string> = {
  currentItemStrokeColor: "strokeColor",
  currentItemBackgroundColor: "backgroundColor",
  currentItemStrokeWidth: "strokeWidth",
  currentItemStrokeStyle: "strokeStyle",
  currentItemRoughness: "roughness",
  currentItemOpacity: "opacity",
  currentItemFontSize: "fontSize",
};

export default function PropriedadesCanvas({ api, tick, paleta }: Props) {
  void tick;
  if (!api) return null;

  const st = api.getAppState();
  const idsSelecionados = Object.keys(st.selectedElementIds ?? {});
  const temSelecao = idsSelecionados.length > 0;
  const ferramentaDesenho = FERRAMENTAS_DESENHO.has(st.activeTool?.type ?? "");
  if (!temSelecao && !ferramentaDesenho) return null;

  // Link é por elemento (doc 02 §"Element Links"), não uma preferência de ferramenta — só
  // faz sentido com exatamente um elemento selecionado.
  const elementoUnico =
    idsSelecionados.length === 1
      ? api.getSceneElements().find((el) => el.id === idsSelecionados[0])
      : undefined;

  const aplicar = (mudanca: Record<string, unknown>) => {
    const selecionados = st.selectedElementIds ?? {};
    const doElemento: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(mudanca)) {
      const campo = CAMPO_DO_ELEMENTO[chave];
      if (campo) doElemento[campo] = valor;
    }
    const elementos = api
      .getSceneElements()
      .map((el) => (selecionados[el.id] ? { ...el, ...doElemento } : el));
    api.updateScene({
      elements: elementos as never,
      appState: mudanca as never,
    });
  };

  return (
    <Superficie
      aria-label="Propriedades do desenho"
      className="pointer-events-auto absolute left-3 top-3 z-20 w-[216px] p-3"
    >
      <Secao titulo="Traço">
        <SeletorCor
          rotuloGrupo="Cor do traço"
          cores={paleta.tracos}
          valor={st.currentItemStrokeColor}
          onEscolher={(hex) => aplicar({ currentItemStrokeColor: hex })}
        />
      </Secao>
      <Secao titulo="Preenchimento">
        <SeletorCor
          rotuloGrupo="Cor de preenchimento"
          cores={paleta.fundos}
          valor={st.currentItemBackgroundColor}
          onEscolher={(hex) => aplicar({ currentItemBackgroundColor: hex })}
        />
      </Secao>
      <Secao titulo="Espessura">
        <GrupoBotoes
          rotuloGrupo="Espessura"
          opcoes={ESPESSURAS}
          valor={st.currentItemStrokeWidth}
          onEscolher={(v) => aplicar({ currentItemStrokeWidth: v })}
        />
      </Secao>
      <Secao titulo="Estilo de linha">
        <GrupoBotoes
          rotuloGrupo="Estilo de linha"
          opcoes={ESTILOS}
          valor={st.currentItemStrokeStyle}
          onEscolher={(v) => aplicar({ currentItemStrokeStyle: v })}
        />
      </Secao>
      <Secao titulo="Imperfeição">
        <GrupoBotoes
          rotuloGrupo="Imperfeição"
          opcoes={IMPERFEICOES}
          valor={st.currentItemRoughness}
          onEscolher={(v) => aplicar({ currentItemRoughness: v })}
        />
      </Secao>
      <Secao titulo="Opacidade">
        <GrupoBotoes
          rotuloGrupo="Opacidade"
          opcoes={OPACIDADES}
          valor={st.currentItemOpacity}
          onEscolher={(v) => aplicar({ currentItemOpacity: v })}
        />
      </Secao>
      <Secao titulo="Tamanho do texto">
        <GrupoBotoes
          rotuloGrupo="Tamanho do texto"
          opcoes={TAMANHOS}
          valor={st.currentItemFontSize}
          onEscolher={(v) => aplicar({ currentItemFontSize: v })}
        />
      </Secao>
      {elementoUnico && (
        <Secao titulo="Link">
          <CampoLink key={elementoUnico.id} api={api} elemento={elementoUnico} />
        </Secao>
      )}
    </Superficie>
  );
}

/** Chave por `elemento.id`: reinicia o valor local ao trocar de seleção, sem disputar com
 * os re-renders do painel a cada `tick` (o Excalidraw dispara onChange a cada tecla). */
function CampoLink({
  api,
  elemento,
}: {
  api: ExcalidrawImperativeAPI;
  elemento: ExcalidrawElement;
}) {
  const [valor, setValor] = useState((elemento as { link?: string | null }).link ?? "");

  const aplicar = () => {
    const limpo = valor.trim();
    const elementos = api
      .getSceneElements()
      .map((el) => (el.id === elemento.id ? { ...el, link: limpo || null } : el));
    api.updateScene({ elements: elementos as never });
  };

  return (
    <Campo
      rotulo="Link"
      placeholder="[[Nota]] ou URL"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="meta mb-1 text-tinta-suave">{titulo}</div>
      {children}
    </div>
  );
}
