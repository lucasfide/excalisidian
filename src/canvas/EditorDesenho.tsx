// Excalidraw embutido (doc 05 §5). Carrega a cena de um .draw.md, aplica tema, paleta e
// fundo pontilhado, toolbar/propriedades próprios, post-it, atalhos e colar imagem, e salva
// de volta com o mesmo contrato de autosave das notas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-excalisidian.css";

import { useVaultStore } from "../estado/vaultStore";
import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
  type DadosDesenho,
} from "./formatoDesenho";
import { lerPaletaCanvas, temaEscuroAtivo } from "./paletaCanvas";
import { inserirPostit } from "./postit";
import { useAtalhosCanvas } from "./atalhosCanvas";
import ToolbarCanvas from "../ui/excalisidian/ToolbarCanvas";
import PropriedadesCanvas from "../ui/excalisidian/PropriedadesCanvas";

const DEBOUNCE_MS = 800;
const PASSO_GRADE = 20;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
};

function mimeDe(caminho: string): string {
  return MIME[caminho.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";
}

function alvoDoLink(link: string): string {
  return link.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
}

function carimbo(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function bytesParaDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:${mime};base64,${btoa(bin)}`;
}

async function reidratarFiles(dados: DadosDesenho): Promise<BinaryFiles> {
  const adapter = useVaultStore.getState().adapter;
  const files: BinaryFiles = {};
  if (!adapter) return files;
  for (const [fileId, link] of dados.embeddedFiles) {
    try {
      const caminho = alvoDoLink(link);
      const bytes = await adapter.lerBinario(caminho);
      files[fileId] = {
        id: fileId as never,
        mimeType: mimeDe(caminho) as never,
        dataURL: bytesParaDataUrl(bytes, mimeDe(caminho)) as never,
        created: Date.now(),
      };
    } catch {
      // imagem faltante: o Excalidraw mostra o placeholder dele
    }
  }
  return files;
}

interface Props {
  caminho: string;
  conteudoInicial: string;
  versao: number;
  onEditar: (md: string) => void;
}

export default function EditorDesenho({ conteudoInicial, onEditar }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [ferramentaAtiva, setFerramentaAtiva] = useState("selection");
  const [tick, setTick] = useState(0);

  useAtalhosCanvas(raizRef);

  const base = useMemo(() => parseDesenho(conteudoInicial), [conteudoInicial]);
  const paleta = useMemo(() => lerPaletaCanvas(), []);
  const escuro = temaEscuroAtivo();
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
      setFerramentaAtiva(appState.activeTool?.type ?? "selection");
      setTick((t) => (t + 1) % 1_000_000);

      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const vivos = elements.filter(
          (e) => !(e as { isDeleted?: boolean }).isDeleted,
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
            // element.link é a fonte da verdade: nunca herda de `base`, senão o link fica
            // congelado no que foi lido do disco e um rename externo é desfeito no próximo
            // autosave (era o bug: `base.elementLinks` nunca mudava depois da montagem).
            // Chave é o id BRUTO do elemento (não o blockId) — ver DadosDesenho.elementLinks.
            elementLinks.set(e.id, e.link);
          }
        }
        const md = serializarDesenho({
          frontmatter: base.frontmatter,
          verso: base.verso,
          textElements,
          elementLinks,
          embeddedFiles: embedsRef.current,
          cena: {
            elements: vivos as never,
            appState: {
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
              zoom: appState.zoom,
            },
          },
        });
        onEditar(md);
      }, DEBOUNCE_MS);
    },
    [base, onEditar, pintarGrade],
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

  const corGrade = paleta.grade || "#DCD5C8";

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
          backgroundImage: `radial-gradient(circle, ${corGrade} 1px, transparent 1px)`,
          backgroundSize: `${PASSO_GRADE}px ${PASSO_GRADE}px`,
          opacity: escuro ? 0.8 : 0.6,
        }}
      />
      <div className="absolute inset-0">
        <Excalidraw
          theme={escuro ? "dark" : "light"}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              saveAsImage: false,
              toggleTheme: false,
            },
          }}
          initialData={{
            elements: base.cena.elements as never,
            appState: {
              ...(base.cena.appState as Partial<AppState>),
              viewBackgroundColor: "transparent",
            },
            scrollToContent: true,
          }}
          excalidrawAPI={(api) => {
            apiRef.current = api;
            pintarGrade(api.getAppState());
          }}
          onChange={aoMudar}
        />
      </div>

      <ToolbarCanvas
        api={apiRef.current}
        ferramentaAtiva={ferramentaAtiva}
        onPostit={() => {
          if (apiRef.current) {
            inserirPostit(apiRef.current, paleta.postits[0].hex, paleta.textoPostit);
          }
        }}
      />
      <PropriedadesCanvas api={apiRef.current} tick={tick} paleta={paleta} />
    </div>
  );
}
