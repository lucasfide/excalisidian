// Painel de propriedades do canvas (doc 06): ancorado à esquerda, 216px, só visível quando
// há seleção ou uma ferramenta de desenho ativa. Escreve nos `currentItem*` do appState e
// aplica aos elementos selecionados.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { PaletaCanvas } from "../../canvas/paletaCanvas";

interface Props {
  api: ExcalidrawImperativeAPI | null;
  /** Bump a cada onChange do Excalidraw para reler o appState. */
  tick: number;
  paleta: PaletaCanvas;
}

const ESPESSURAS = [
  { rotulo: "Fina", valor: 1 },
  { rotulo: "Média", valor: 2 },
  { rotulo: "Grossa", valor: 4 },
];
const ESTILOS = [
  { rotulo: "Contínua", valor: "solid" },
  { rotulo: "Tracejada", valor: "dashed" },
  { rotulo: "Pontilhada", valor: "dotted" },
];
const IMPERFEICOES = [
  { rotulo: "Reta", valor: 0 },
  { rotulo: "À mão", valor: 1 },
];
const OPACIDADES = [30, 60, 100];
const TAMANHOS = [
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

export default function PropriedadesCanvas({ api, tick, paleta }: Props) {
  void tick;
  if (!api) return null;
  const st = api.getAppState();
  const temSelecao = Object.keys(st.selectedElementIds ?? {}).length > 0;
  const ferramentaDesenho = FERRAMENTAS_DESENHO.has(st.activeTool?.type ?? "");
  if (!temSelecao && !ferramentaDesenho) return null;

  const aplicar = (mud: Record<string, unknown>) => {
    const selec = st.selectedElementIds ?? {};
    const elementos = api.getSceneElements().map((el) =>
      selec[el.id] ? { ...el, ...mapearParaElemento(mud) } : el,
    );
    api.updateScene({
      elements: elementos as never,
      appState: mud as never,
    });
  };

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-20 w-[216px] rounded-ficha border border-regua bg-superficie p-3">
      <Secao titulo="Traço">
        <GradeCores
          cores={paleta.tracos}
          atual={st.currentItemStrokeColor}
          onEscolher={(hex) => aplicar({ currentItemStrokeColor: hex })}
        />
      </Secao>
      <Secao titulo="Preenchimento">
        <GradeCores
          cores={paleta.fundos}
          atual={st.currentItemBackgroundColor}
          onEscolher={(hex) => aplicar({ currentItemBackgroundColor: hex })}
        />
      </Secao>
      <Secao titulo="Espessura">
        <Botoes
          itens={ESPESSURAS}
          atual={st.currentItemStrokeWidth}
          onEscolher={(v) => aplicar({ currentItemStrokeWidth: v })}
        />
      </Secao>
      <Secao titulo="Estilo de linha">
        <Botoes
          itens={ESTILOS}
          atual={st.currentItemStrokeStyle}
          onEscolher={(v) => aplicar({ currentItemStrokeStyle: v })}
        />
      </Secao>
      <Secao titulo="Imperfeição">
        <Botoes
          itens={IMPERFEICOES}
          atual={st.currentItemRoughness}
          onEscolher={(v) => aplicar({ currentItemRoughness: v })}
        />
      </Secao>
      <Secao titulo="Opacidade">
        <Botoes
          itens={OPACIDADES.map((o) => ({ rotulo: String(o), valor: o }))}
          atual={st.currentItemOpacity}
          onEscolher={(v) => aplicar({ currentItemOpacity: v })}
        />
      </Secao>
      <Secao titulo="Tamanho do texto">
        <Botoes
          itens={TAMANHOS}
          atual={st.currentItemFontSize}
          onEscolher={(v) => aplicar({ currentItemFontSize: v })}
        />
      </Secao>
    </div>
  );
}

function mapearParaElemento(mud: Record<string, unknown>): Record<string, unknown> {
  const mapa: Record<string, string> = {
    currentItemStrokeColor: "strokeColor",
    currentItemBackgroundColor: "backgroundColor",
    currentItemStrokeWidth: "strokeWidth",
    currentItemStrokeStyle: "strokeStyle",
    currentItemRoughness: "roughness",
    currentItemOpacity: "opacity",
    currentItemFontSize: "fontSize",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mud)) {
    if (mapa[k]) out[mapa[k]] = v;
  }
  return out;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="meta mb-1 text-tinta-suave">{titulo}</div>
      {children}
    </div>
  );
}

function GradeCores({
  cores,
  atual,
  onEscolher,
}: {
  cores: { nome: string; hex: string }[];
  atual: string;
  onEscolher: (hex: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {cores.map((c) => (
        <button
          key={c.nome}
          title={c.nome}
          onClick={() => onEscolher(c.hex)}
          className={`h-6 w-6 rounded-controle border ${
            atual === c.hex ? "border-musgo" : "border-regua"
          }`}
          style={{
            backgroundColor: c.hex === "transparent" ? "var(--color-papel)" : c.hex,
            backgroundImage:
              c.hex === "transparent"
                ? "linear-gradient(45deg, var(--color-regua) 25%, transparent 25%, transparent 75%, var(--color-regua) 75%)"
                : undefined,
          }}
        />
      ))}
    </div>
  );
}

function Botoes<T extends string | number>({
  itens,
  atual,
  onEscolher,
}: {
  itens: { rotulo: string; valor: T }[];
  atual: unknown;
  onEscolher: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map((it) => (
        <button
          key={String(it.valor)}
          onClick={() => onEscolher(it.valor)}
          className={`rounded-controle border px-2 py-1 text-[11px] ${
            atual === it.valor
              ? "border-musgo bg-musgo text-superficie"
              : "border-regua-forte text-tinta"
          }`}
        >
          {it.rotulo}
        </button>
      ))}
    </div>
  );
}
