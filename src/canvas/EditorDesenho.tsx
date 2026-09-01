// Excalidraw embutido (doc 05 §5). Carrega a cena de um .draw.md, aplica tema e fundo
// pontilhado, atalhos e colar imagem, e salva de volta com o mesmo contrato de autosave das
// notas. A UI nativa do Excalidraw (toolbar, painel de propriedades, menu) está LIGADA — ver
// doc 09, ADR de migração para a UI nativa: a versão própria (ToolbarCanvas/PropriedadesCanvas)
// foi apagada, tinha menos recursos e um bug real (alinhar/distribuir deixava texto vinculado
// pra trás).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  AppState,
} from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-excalisidian.css";

import { useVaultStore } from "../estado/vaultStore";
import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
} from "./formatoDesenho";
import { reidratarFiles, bytesParaDataUrl } from "./reidratarFiles";
import {
  lerPaletaCanvas,
  temaEscuroAtivo,
  useTemaEscuro,
  converterElementosParaTema,
} from "./paletaCanvas";
import { useAtalhosCanvas } from "./atalhosCanvas";
import { abrirOuCriarPorLink } from "../vault/navegacao";
import { alvoDeLinkWiki } from "./linkElemento";
import { buscarSugestoesLink, type SugestaoLink } from "../indice/sugestoesLink";
import IconeArquivo from "../ui/IconeArquivo";
import { acharFormaVaziaNoPonto } from "./selecaoFormaVazia";

const DEBOUNCE_MS = 800;
const PASSO_GRADE = 20;

// Referência fixa: o `App` interno do Excalidraw é um componente de classe cujo
// `componentDidUpdate` reage a mudança de identidade das props, não só de valor. Um objeto
// literal recriado a cada render (o que era o caso antes desta correção) faz esse
// componentDidUpdate se ressincronizar, disparar onChange, o pai reagir recriando a mesma
// prop instável de novo — loop síncrono até o React abortar com "Maximum update depth
// exceeded". Constante de módulo porque não depende de nada do componente.
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
} as const;

function carimbo(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

interface Props {
  caminho: string;
  conteudoInicial: string;
  versao: number;
  onEditar: (md: string) => void;
  /** Segunda vista do mesmo arquivo aberta via split (doc 09): sem sincronização em tempo
   * real entre vistas, editar dos dois lados sobrescreve em silêncio — trava a edição aqui. */
  somenteLeitura?: boolean;
}

export default function EditorDesenho({
  caminho,
  conteudoInicial,
  onEditar,
  somenteLeitura = false,
}: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const primeiroRenderTema = useRef(true);

  // Estado para autocompleção flutuante na ferramenta de texto do canvas
  const [sugestaoTexto, setSugestaoTexto] = useState<{
    visivel: boolean;
    query: string;
    pos: { x: number; y: number };
    textarea: HTMLTextAreaElement;
    cursorInicio: number;
  } | null>(null);
  const [indiceFocoTexto, setIndiceFocoTexto] = useState(0);

  const sugestaoTextoRef = useRef(sugestaoTexto);
  sugestaoTextoRef.current = sugestaoTexto;

  const sugestoesTextoList = useMemo(() => {
    if (!sugestaoTexto?.visivel) return [];
    return buscarSugestoesLink(sugestaoTexto.query, 8);
  }, [sugestaoTexto?.visivel, sugestaoTexto?.query]);

  const sugestoesAtuaisRef = useRef(sugestoesTextoList);
  sugestoesAtuaisRef.current = sugestoesTextoList;

  const indiceFocoTextoRef = useRef(indiceFocoTexto);
  indiceFocoTextoRef.current = indiceFocoTexto;

  useAtalhosCanvas(raizRef);

  const escuro = useTemaEscuro();
  const paleta = useMemo(() => lerPaletaCanvas(), [escuro]);
  const base = useMemo(() => parseDesenho(conteudoInicial), [conteudoInicial]);

  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  }, [base]);

  const ultimoMdRef = useRef(conteudoInicial);

  // embeddedFiles cresce ao colar imagem; mantido mutável fora do parse base.
  const embedsRef = useRef(new Map(base.embeddedFiles));
  useEffect(() => {
    embedsRef.current = new Map(base.embeddedFiles);
  }, [base]);

  useEffect(() => {
    let vivo = true;
    void reidratarFiles(base).then((files) => {
      if (vivo && apiRef.current) apiRef.current.addFiles(Object.values(files));
    });
    return () => {
      vivo = false;
    };
  }, [base]);

  // Sincroniza cores dos elementos existentes e padrões de novas ferramentas ao alternar tema em tempo real
  useEffect(() => {
    if (primeiroRenderTema.current) {
      primeiroRenderTema.current = false;
      return;
    }
    const api = apiRef.current;
    if (!api) return;

    const elementosAtuais = api.getSceneElements();
    const elementosConvertidos = converterElementosParaTema(
      elementosAtuais,
      escuro ? "escuro" : "claro",
    );

    api.updateScene({
      elements: elementosConvertidos as never,
      appState: {
        currentItemStrokeColor: paleta.tracos[0].hex,
        currentItemBackgroundColor: "transparent",
      },
    });
  }, [escuro, paleta]);

  const inserirSugestaoTexto = useCallback((sug: SugestaoLink) => {
    const estado = sugestaoTextoRef.current;
    if (!estado) return;
    const { textarea, cursorInicio } = estado;
    const val = textarea.value;
    const cursorFim = textarea.selectionStart;

    const prefixo = val.slice(0, cursorInicio);
    const sufixo = val.slice(cursorFim);
    const insercao = `[[${sug.alvo}]]`;

    textarea.value = `${prefixo}${insercao}${sufixo}`;
    const novoCursor = prefixo.length + insercao.length;
    textarea.selectionStart = novoCursor;
    textarea.selectionEnd = novoCursor;

    // Dispara evento input para o Excalidraw atualizar o elemento de texto
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    setSugestaoTexto(null);
  }, []);

  // Escuta digitação na ferramenta de texto nativa do Excalidraw (.excalidraw-wysiwyg)
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;

    const aoDigitar = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.classList.contains("excalidraw-wysiwyg")) return;
      const ta = target as HTMLTextAreaElement;
      const val = ta.value;
      const cursor = ta.selectionStart;
      const textoAntes = val.slice(0, cursor);

      // Detecta [[ seguido de caracteres até o cursor sem fechar com ]]
      const match = /(?:^|[\s\n])\[\[([^\]\n]*)$/.exec(textoAntes);
      if (match) {
        const query = match[1];
        const rect = ta.getBoundingClientRect();
        const raizRect = raiz.getBoundingClientRect();
        const matchStr = match[0];
        const offset = matchStr.startsWith("[[") ? 0 : 1;
        setSugestaoTexto({
          visivel: true,
          query,
          pos: {
            x: Math.max(12, rect.left - raizRect.left),
            y: rect.bottom - raizRect.top + 6,
          },
          textarea: ta,
          cursorInicio: cursor - matchStr.length + offset,
        });
        setIndiceFocoTexto(0);
      } else {
        setSugestaoTexto(null);
      }
    };

    const aoTeclar = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.classList.contains("excalidraw-wysiwyg")) return;
      if (!sugestaoTextoRef.current?.visivel) return;

      const sugs = sugestoesAtuaisRef.current;
      if (sugs.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setIndiceFocoTexto((i) => (i + 1) % sugs.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setIndiceFocoTexto((i) => (i - 1 + sugs.length) % sugs.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const escolhida = sugs[indiceFocoTextoRef.current];
        if (escolhida) {
          inserirSugestaoTexto(escolhida);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSugestaoTexto(null);
        return;
      }
    };

    const aoPerderFoco = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.classList.contains("excalidraw-wysiwyg")) {
        setTimeout(() => {
          setSugestaoTexto(null);
        }, 200);
      }
    };

    raiz.addEventListener("input", aoDigitar, true);
    raiz.addEventListener("keydown", aoTeclar, true);
    raiz.addEventListener("blur", aoPerderFoco, true);

    return () => {
      raiz.removeEventListener("input", aoDigitar, true);
      raiz.removeEventListener("keydown", aoTeclar, true);
      raiz.removeEventListener("blur", aoPerderFoco, true);
    };
  }, [inserirSugestaoTexto]);

  // Clicar DENTRO de uma forma sem preenchimento não seleciona ela no Excalidraw — só clicar
  // na borda seleciona (é hardcoded por dentro dele, sem prop nem appState pra mudar, ver
  // selecaoFormaVazia.ts). Plano B: se o clique não selecionou nada, testa geometricamente se
  // caiu dentro de alguma forma vazia e seleciona por conta própria.
  useEffect(() => {
    if (somenteLeitura) return;
    const raiz = raizRef.current;
    if (!raiz) return;

    const inicioRef = { x: 0, y: 0 };

    const aoPressionar = (e: PointerEvent) => {
      inicioRef.x = e.clientX;
      inicioRef.y = e.clientY;
    };

    const aoSoltar = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const api = apiRef.current;
      if (!api) return;
      // Só clique de verdade — um arraste (mover a tela, selecionar por retângulo) não deve
      // "roubar" uma forma vazia que passou por perto do caminho do arraste.
      const distancia = Math.hypot(e.clientX - inicioRef.x, e.clientY - inicioRef.y);
      if (distancia > 4) return;
      // Só o <canvas> de verdade interessa aqui — com a UI nativa ligada, toolbar, painel de
      // propriedades e popovers do Excalidraw ficam TODOS dentro de `.excalidraw`, então
      // `closest(".excalidraw")` (a guarda antiga, de quando a UI própria era irmã do
      // Excalidraw na árvore) passaria a aceitar clique na UI nativa e podia selecionar uma
      // forma vazia escondida atrás do painel.
      if (!(e.target instanceof HTMLCanvasElement)) return;

      // Um frame pra deixar o próprio Excalidraw terminar de processar o clique antes da
      // gente checar se ele selecionou algo.
      requestAnimationFrame(() => {
        const st = api.getAppState();
        if (st.activeTool?.type !== "selection") return;
        if (Object.keys(st.selectedElementIds ?? {}).length > 0) return; // já selecionou algo

        const { x, y } = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, st);
        const alvo = acharFormaVaziaNoPonto(api.getSceneElements(), x, y);
        if (alvo) {
          api.updateScene({ appState: { selectedElementIds: { [alvo.id]: true } } as never });
        }
      });
    };

    raiz.addEventListener("pointerdown", aoPressionar, true);
    raiz.addEventListener("pointerup", aoSoltar, true);
    return () => {
      raiz.removeEventListener("pointerdown", aoPressionar, true);
      raiz.removeEventListener("pointerup", aoSoltar, true);
    };
  }, [somenteLeitura]);

  const pintarGrade = useCallback((appState: Readonly<AppState>) => {
    const el = gradeRef.current;
    if (!el) return;
    const passo = PASSO_GRADE * appState.zoom.value;
    el.style.backgroundSize = `${passo}px ${passo}px`;
    el.style.backgroundPosition = `${appState.scrollX * appState.zoom.value}px ${appState.scrollY * appState.zoom.value}px`;
  }, []);

  const aoMudar = useCallback(
    (elements: readonly unknown[], appState: Readonly<AppState>) => {
      pintarGrade(appState);

      // Vista só-leitura (segunda vista do mesmo arquivo via split, doc 09): o Excalidraw
      // ainda dispara onChange ao arrastar/dar zoom mesmo com viewModeEnabled. Sem esta
      // guarda, isso agendaria uma gravação com a cena desta vista — que fica congelada
      // desde o mount — sobrescrevendo qualquer edição feita na vista editável.
      if (somenteLeitura) return;

      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const vivos = elements.filter(
          (e) => !(e as { isDeleted?: boolean }).isDeleted,
        );
        // Gravação canônica: no disco (.draw.md), as cores são sempre convertidas
        // para a paleta do tema claro (Bug C). Isso garante diffs limpos e portabilidade total.
        const elementosParaSalvar = converterElementosParaTema(
          vivos as never,
          "claro",
        );
        const idPorEl = blockIdsDaCena(
          vivos as unknown as { id: string; type: string }[],
        );
        const textElements = new Map<string, string>();
        const elementLinks = new Map<string, string>();
        for (const e of vivos as unknown as {
          id: string;
          type: string;
          text?: string;
          link?: string | null;
        }[]) {
          if (e.type === "text") {
            textElements.set(idPorEl.get(e.id)!, e.text ?? "");
          } else if (e.link) {
            elementLinks.set(e.id, e.link);
          }
        }
        const b = baseRef.current;
        const md = serializarDesenho({
          frontmatter: b.frontmatter,
          verso: b.verso,
          textElements,
          elementLinks,
          embeddedFiles: embedsRef.current,
          cena: {
            elements: elementosParaSalvar as never,
            appState: {
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
              zoom: appState.zoom,
            },
          },
        });
        if (md !== ultimoMdRef.current) {
          ultimoMdRef.current = md;
          onEditar(md);
        }
      }, DEBOUNCE_MS);
    },
    [onEditar, pintarGrade, somenteLeitura],
  );

  // initialData é usado APENAS na montagem do Excalidraw. A identidade deste objeto
  // DEVE ser estritamente estável durante toda a vida do componente (só remonta quando a
  // key muda em PainelDesenho via doc.versao). Se mudar de referência durante a sessão, o
  // componentDidUpdate interno do Excalidraw dispara onChange em loop contínuo (salvo <-> editando).
  const initialData = useMemo(() => {
    const baseInicial = parseDesenho(conteudoInicial);
    const elems = temaEscuroAtivo()
      ? converterElementosParaTema(baseInicial.cena.elements as never, "escuro")
      : baseInicial.cena.elements;
    const paletaInicial = lerPaletaCanvas();
    return {
      elements: elems as never,
      appState: {
        ...(baseInicial.cena.appState as Partial<AppState>),
        viewBackgroundColor: "transparent",
        currentItemStrokeColor: paletaInicial.tracos[0].hex,
        currentItemBackgroundColor: "transparent",
      },
      scrollToContent: true,
    };
  }, []);

  const aoObterApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      pintarGrade(api.getAppState());
    },
    [pintarGrade],
  );

  const aoAbrirLink = useCallback(
    (elemento: NonDeletedExcalidrawElement, evento: CustomEvent) => {
      let link = (elemento as { link?: string | null }).link;
      // Se o elemento for de texto e não tiver link direto, mas tiver [[...]] no texto:
      if (!link && elemento.type === "text") {
        const texto = (elemento as unknown as { text?: string }).text ?? "";
        const m = /\[\[([^\][]+)\]\]/.exec(texto);
        if (m) link = m[0];
      }
      const alvo = link ? alvoDeLinkWiki(link) : null;
      if (alvo === null) return; // URL externa: comportamento nativo do Excalidraw
      evento.preventDefault();
      void abrirOuCriarPorLink(alvo, caminho);
    },
    [caminho],
  );

  const colarImagem = useCallback(async (e: React.ClipboardEvent) => {
    const api = apiRef.current;
    const adapter = useVaultStore.getState().adapter;
    if (!api || !adapter) return;
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const blob = item.getAsFile();
    if (!blob) return;
    const ext = (blob.type.split("/")[1] ?? "png").replace("+xml", "");
    const rel = `anexos/Imagem colada ${carimbo()}.${ext}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      await adapter.criarPasta("anexos");
      await adapter.escreverBinario(rel, bytes);
    } catch {
      return;
    }
    const fileId = `img-${crypto.randomUUID().slice(0, 12)}`;
    api.addFiles([
      {
        id: fileId as never,
        mimeType: blob.type as never,
        dataURL: bytesParaDataUrl(bytes, blob.type) as never,
        created: Date.now(),
      },
    ]);
    embedsRef.current.set(fileId, `[[${rel}]]`);
    const st = api.getAppState();
    const [novo] = convertToExcalidrawElements([
      {
        type: "image",
        x: -st.scrollX + st.width / 2 / st.zoom.value - 100,
        y: -st.scrollY + st.height / 2 / st.zoom.value - 100,
        fileId: fileId as never,
      },
    ]);
    api.updateScene({ elements: [...api.getSceneElements(), novo] });
  }, []);

  return (
    <div
      ref={raizRef}
      className="excalisidian-canvas relative h-full w-full"
      onPaste={colarImagem}
    >
      <div
        ref={gradeRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: "var(--color-papel)",
          backgroundImage: `radial-gradient(circle, ${paleta.grade} 1px, transparent 1px)`,
          backgroundSize: `${PASSO_GRADE}px ${PASSO_GRADE}px`,
          opacity: escuro ? 0.8 : 0.6,
        }}
      />
      <div className="absolute inset-0">
        <Excalidraw
          theme={escuro ? "dark" : "light"}
          UIOptions={UI_OPTIONS}
          initialData={initialData}
          excalidrawAPI={aoObterApi}
          onChange={aoMudar}
          onLinkOpen={aoAbrirLink}
          viewModeEnabled={somenteLeitura}
          aiEnabled={false}
        />
      </div>

      {sugestaoTexto && sugestoesTextoList.length > 0 && (
        <div
          className="pointer-events-auto absolute z-40 max-h-56 w-64 overflow-y-auto rounded-ficha border border-regua bg-superficie p-1 shadow-sobreposicao"
          style={{
            left: `${sugestaoTexto.pos.x}px`,
            top: `${sugestaoTexto.pos.y}px`,
          }}
        >
          {sugestoesTextoList.map((s, idx) => {
            const tipoNo =
              s.tipo === "desenho"
                ? "drawing"
                : s.tipo === "anexo"
                ? "attachment"
                : "note";
            const ativo = idx === indiceFocoTexto;
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
                  inserirSugestaoTexto(s);
                }}
                onMouseEnter={() => setIndiceFocoTexto(idx)}
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
