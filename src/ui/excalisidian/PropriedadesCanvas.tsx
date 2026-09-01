// Painel de propriedades do canvas (doc 06): ancorado à esquerda, 216px, só visível quando há
// seleção ou uma ferramenta de desenho ativa. Escreve nos `currentItem*` do appState e aplica
// aos elementos selecionados e seus textos vinculados.

import { useState, useRef, useMemo, useEffect, type ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";

import { BotaoIcone, Campo, GrupoBotoes, SeletorCor, Superficie, type OpcaoGrupo } from "../index";
import IconeArquivo from "../IconeArquivo";
import type { PaletaCanvas } from "../../canvas/paletaCanvas";
import { buscarSugestoesLink, type SugestaoLink } from "../../indice/sugestoesLink";
import {
  aplicarPropriedadesNaCena,
  type MudancaPropriedades,
} from "../../canvas/aplicarPropriedades";
import {
  alinhar,
  distribuir,
  type ModoAlinhamento,
  type EixoDistribuicao,
} from "../../canvas/alinharDistribuir";

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

const ESTILOS: OpcaoGrupo<"solid" | "dashed" | "dotted">[] = [
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

const ALINHAMENTOS: OpcaoGrupo<"left" | "center" | "right">[] = [
  { rotulo: "Esq", valor: "left" },
  { rotulo: "Centro", valor: "center" },
  { rotulo: "Dir", valor: "right" },
];

const FONTES: OpcaoGrupo<number>[] = [
  { rotulo: "À mão", valor: 1 },
  { rotulo: "Sans", valor: 2 },
  { rotulo: "Mono", valor: 3 },
];

const FERRAMENTAS_FORMA = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
]);

export default function PropriedadesCanvas({ api, tick, paleta }: Props) {
  void tick;
  if (!api) return null;

  const st = api.getAppState();
  const idsSelecionados = Object.keys(st.selectedElementIds ?? {});
  const temSelecao = idsSelecionados.length > 0;
  const ferramentaTipo = st.activeTool?.type ?? "";
  const ehFerramentaTexto = ferramentaTipo === "text";
  const ehFerramentaForma = FERRAMENTAS_FORMA.has(ferramentaTipo);

  if (!temSelecao && !ehFerramentaForma && !ehFerramentaTexto) return null;

  const todosElementos = api.getSceneElements();
  const selecionados = st.selectedElementIds ?? {};
  const elementosSelecionados = todosElementos.filter((el) => selecionados[el.id]);

  // Link e desambiguações com exatamente um elemento selecionado
  const elementoUnico =
    idsSelecionados.length === 1
      ? todosElementos.find((el) => el.id === idsSelecionados[0])
      : undefined;

  // Texto vinculado a elemento único (ex: retângulo com texto)
  const textoVinculado = elementoUnico
    ? todosElementos.find(
        (el) =>
          el.type === "text" &&
          (el as unknown as { containerId?: string | null }).containerId ===
            elementoUnico.id,
      )
    : undefined;

  // Textos vinculados a qualquer elemento selecionado
  const textosVinculadosSelecionados = todosElementos.filter(
    (el) =>
      el.type === "text" &&
      (el as unknown as { containerId?: string | null }).containerId &&
      selecionados[(el as unknown as { containerId: string }).containerId],
  );

  const temFormaSelecionada = elementosSelecionados.some((el) => el.type !== "text");
  const temTextoSelecionado =
    elementosSelecionados.some((el) => el.type === "text") ||
    textosVinculadosSelecionados.length > 0;

  const mostrarSecaoForma = temFormaSelecionada || (!temSelecao && ehFerramentaForma);
  const mostrarSecaoTexto = temTextoSelecionado || (!temSelecao && ehFerramentaTexto);

  const aplicar = (mudanca: MudancaPropriedades) => {
    const novosElementos = aplicarPropriedadesNaCena(
      api.getSceneElements(),
      st.selectedElementIds ?? {},
      mudanca,
    );

    // Mapeia para o appState do Excalidraw (omite propriedades auxiliares)
    const { corTexto: _, ...appStateMudanca } = mudanca;

    api.updateScene({
      elements: novosElementos as never,
      appState: appStateMudanca as never,
    });
  };

  // Alinhar/distribuir mexem só em `elements` (x/y), nunca em appState — handler à parte de
  // `aplicar`, que é específico de MudancaPropriedades (estilo/appState). Um updateScene por
  // clique, um passo de desfazer, mesmo padrão que CampoLink já usa pra mudar `link` direto.
  const alinharOuDistribuir = (modo: ModoAlinhamento) => {
    api.updateScene({
      elements: alinhar(api.getSceneElements(), selecionados, modo) as never,
    });
  };
  const distribuirEixo = (eixo: EixoDistribuicao) => {
    api.updateScene({
      elements: distribuir(api.getSceneElements(), selecionados, eixo) as never,
    });
  };

  // Obtém o valor atual para exibir nos seletores com elemento único
  function valorExibido<T>(campo: string, doAppState: T): T {
    if (!elementoUnico) return doAppState;

    if (campo === "fontSize") {
      if (elementoUnico.type === "text") {
        return (elementoUnico as unknown as { fontSize?: T }).fontSize ?? doAppState;
      }
      if (textoVinculado) {
        return (textoVinculado as unknown as { fontSize?: T }).fontSize ?? doAppState;
      }
      return doAppState;
    }

    if (campo === "corTexto") {
      if (textoVinculado) {
        return (textoVinculado as unknown as { strokeColor: T }).strokeColor;
      }
      if (elementoUnico.type === "text") {
        return (elementoUnico as unknown as { strokeColor: T }).strokeColor;
      }
      return doAppState;
    }

    if (campo === "textAlign") {
      if (elementoUnico.type === "text") {
        return (elementoUnico as unknown as { textAlign?: T }).textAlign ?? doAppState;
      }
      if (textoVinculado) {
        return (textoVinculado as unknown as { textAlign?: T }).textAlign ?? doAppState;
      }
      return doAppState;
    }

    if (campo === "fontFamily") {
      if (elementoUnico.type === "text") {
        return (elementoUnico as unknown as { fontFamily?: T }).fontFamily ?? doAppState;
      }
      if (textoVinculado) {
        return (textoVinculado as unknown as { fontFamily?: T }).fontFamily ?? doAppState;
      }
      return doAppState;
    }

    const valor = (elementoUnico as unknown as Record<string, unknown>)[campo];
    return valor === undefined ? doAppState : (valor as T);
  }

  return (
    <Superficie
      aria-label="Propriedades do desenho"
      className="pointer-events-auto absolute left-3 top-3 z-20 w-[216px] p-3"
    >
      {mostrarSecaoForma && (
        <>
          <Secao titulo="Traço">
            <SeletorCor
              rotuloGrupo="Cor do traço"
              cores={paleta.tracos}
              valor={valorExibido("strokeColor", st.currentItemStrokeColor)}
              onEscolher={(hex) => aplicar({ currentItemStrokeColor: hex })}
            />
          </Secao>
          <Secao titulo="Preenchimento">
            <SeletorCor
              rotuloGrupo="Cor de preenchimento"
              cores={paleta.fundos}
              valor={valorExibido("backgroundColor", st.currentItemBackgroundColor)}
              onEscolher={(hex) => aplicar({ currentItemBackgroundColor: hex })}
            />
          </Secao>
          <Secao titulo="Espessura">
            <GrupoBotoes
              rotuloGrupo="Espessura"
              opcoes={ESPESSURAS}
              valor={valorExibido("strokeWidth", st.currentItemStrokeWidth)}
              onEscolher={(v) => aplicar({ currentItemStrokeWidth: v })}
            />
          </Secao>
          <Secao titulo="Estilo de linha">
            <GrupoBotoes
              rotuloGrupo="Estilo de linha"
              opcoes={ESTILOS}
              valor={valorExibido("strokeStyle", st.currentItemStrokeStyle as "solid" | "dashed" | "dotted")}
              onEscolher={(v) => aplicar({ currentItemStrokeStyle: v })}
            />
          </Secao>
          <Secao titulo="Imperfeição">
            <GrupoBotoes
              rotuloGrupo="Imperfeição"
              opcoes={IMPERFEICOES}
              valor={valorExibido("roughness", st.currentItemRoughness)}
              onEscolher={(v) => aplicar({ currentItemRoughness: v })}
            />
          </Secao>
        </>
      )}

      {mostrarSecaoTexto && (
        <>
          <Secao titulo="Tamanho do texto">
            <GrupoBotoes
              rotuloGrupo="Tamanho do texto"
              opcoes={TAMANHOS}
              valor={valorExibido("fontSize", st.currentItemFontSize)}
              onEscolher={(v) => aplicar({ currentItemFontSize: v })}
            />
          </Secao>
          <Secao titulo="Cor do texto">
            <SeletorCor
              rotuloGrupo="Cor do texto"
              cores={paleta.tracos}
              valor={valorExibido("corTexto", st.currentItemStrokeColor)}
              onEscolher={(hex) => {
                if (elementoUnico?.type === "text") {
                  aplicar({ currentItemStrokeColor: hex });
                } else {
                  aplicar({ corTexto: hex });
                }
              }}
            />
          </Secao>
          <Secao titulo="Alinhamento">
            <GrupoBotoes
              rotuloGrupo="Alinhamento do texto"
              opcoes={ALINHAMENTOS}
              valor={valorExibido(
                "textAlign",
                (st as unknown as { currentItemTextAlign?: "left" | "center" | "right" })
                  .currentItemTextAlign ?? "center",
              )}
              onEscolher={(v) => aplicar({ currentItemTextAlign: v })}
            />
          </Secao>
          <Secao titulo="Fonte">
            <GrupoBotoes
              rotuloGrupo="Família da fonte"
              opcoes={FONTES}
              valor={valorExibido("fontFamily", st.currentItemFontFamily ?? 1)}
              onEscolher={(v) => aplicar({ currentItemFontFamily: v })}
            />
          </Secao>
        </>
      )}

      {idsSelecionados.length >= 2 && (
        <Secao titulo="Alinhar e distribuir">
          <div className="grid grid-cols-3 gap-1">
            <BotaoIcone
              Icone={AlignHorizontalJustifyStart}
              titulo="Alinhar à esquerda"
              onClick={() => alinharOuDistribuir("esquerda")}
            />
            <BotaoIcone
              Icone={AlignHorizontalJustifyCenter}
              titulo="Centralizar horizontal"
              onClick={() => alinharOuDistribuir("centroH")}
            />
            <BotaoIcone
              Icone={AlignHorizontalJustifyEnd}
              titulo="Alinhar à direita"
              onClick={() => alinharOuDistribuir("direita")}
            />
            <BotaoIcone
              Icone={AlignVerticalJustifyStart}
              titulo="Alinhar ao topo"
              onClick={() => alinharOuDistribuir("topo")}
            />
            <BotaoIcone
              Icone={AlignVerticalJustifyCenter}
              titulo="Centralizar vertical"
              onClick={() => alinharOuDistribuir("centroV")}
            />
            <BotaoIcone
              Icone={AlignVerticalJustifyEnd}
              titulo="Alinhar à base"
              onClick={() => alinharOuDistribuir("base")}
            />
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <BotaoIcone
              Icone={AlignHorizontalDistributeCenter}
              titulo="Distribuir horizontalmente"
              disabled={idsSelecionados.length < 3}
              onClick={() => distribuirEixo("horizontal")}
            />
            <BotaoIcone
              Icone={AlignVerticalDistributeCenter}
              titulo="Distribuir verticalmente"
              disabled={idsSelecionados.length < 3}
              onClick={() => distribuirEixo("vertical")}
            />
          </div>
        </Secao>
      )}

      <Secao titulo="Opacidade">
        <GrupoBotoes
          rotuloGrupo="Opacidade"
          opcoes={OPACIDADES}
          valor={valorExibido("opacity", st.currentItemOpacity)}
          onEscolher={(v) => aplicar({ currentItemOpacity: v })}
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
  const [aberto, setAberto] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sugestoes = useMemo(() => {
    if (!aberto) return [];
    return buscarSugestoesLink(valor, 8);
  }, [valor, aberto]);

  const aplicar = (novoValor: string) => {
    const limpo = novoValor.trim();
    const elementos = api
      .getSceneElements()
      .map((el) => (el.id === elemento.id ? { ...el, link: limpo || null } : el));
    api.updateScene({ elements: elementos as never });
  };

  const selecionarSugestao = (sug: SugestaoLink) => {
    const formatado = `[[${sug.alvo}]]`;
    setValor(formatado);
    aplicar(formatado);
    setAberto(false);
  };

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (aberto && sugestoes.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceFoco((i) => (i + 1) % sugestoes.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceFoco((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selecionarSugestao(sugestoes[indiceFoco]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        return;
      }
    }

    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Campo
        rotulo="Link"
        placeholder="[[Nota]] ou URL"
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          setAberto(true);
          setIndiceFoco(0);
        }}
        onFocus={() => {
          setAberto(true);
          setIndiceFoco(0);
        }}
        onBlur={() => {
          setTimeout(() => {
            aplicar(valor);
          }, 150);
        }}
        onKeyDown={onKeyDown}
      />

      {aberto && sugestoes.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-ficha border border-regua bg-superficie p-1 shadow-sobreposicao">
          {sugestoes.map((s, idx) => {
            const tipoNo =
              s.tipo === "desenho"
                ? "drawing"
                : s.tipo === "anexo"
                ? "attachment"
                : "note";
            const ativo = idx === indiceFoco;
            return (
              <button
                key={`${s.alvo}-${s.rotulo}`}
                type="button"
                className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-xs transition-colors ${
                  ativo
                    ? "bg-lavagem text-tinta"
                    : "text-tinta-media hover:bg-lavagem hover:text-tinta"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionarSugestao(s);
                }}
                onMouseEnter={() => setIndiceFoco(idx)}
              >
                <IconeArquivo
                  tipo={tipoNo}
                  tamanho={14}
                  className="shrink-0 text-tinta-suave"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.rotulo}</div>
                  {s.detalhe && (
                    <div className="meta truncate text-[9px] text-tinta-suave">
                      {s.detalhe}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
