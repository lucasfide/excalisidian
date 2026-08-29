// Excalidraw embutido (doc 05 §5). Carrega a cena de um .draw.md, aplica tema e fundo
// pontilhado, e salva de volta com o mesmo contrato de autosave das notas. A toolbar própria,
// o post-it, colar imagem e os atalhos entram no commit 3/3.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { useVaultStore } from "../estado/vaultStore";
import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
  type DadosDesenho,
} from "./formatoDesenho";
import { lerPaletaCanvas, temaEscuroAtivo } from "./paletaCanvas";

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

async function reidratarFiles(dados: DadosDesenho): Promise<BinaryFiles> {
  const adapter = useVaultStore.getState().adapter;
  const files: BinaryFiles = {};
  if (!adapter) return files;
  for (const [fileId, link] of dados.embeddedFiles) {
    try {
      const bytes = await adapter.lerBinario(alvoDoLink(link));
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const caminho = alvoDoLink(link);
      files[fileId] = {
        id: fileId as never,
        mimeType: mimeDe(caminho) as never,
        dataURL: `data:${mimeDe(caminho)};base64,${btoa(bin)}` as never,
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
  /** Muda a cada recarga externa: força remontar o Excalidraw. */
  versao: number;
  onEditar: (md: string) => void;
}

export default function EditorDesenho({ conteudoInicial, onEditar }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // O parse do conteúdo inicial é a base preservada (frontmatter, verso, links, embeds);
  // só os elementos de texto são recalculados da cena viva ao salvar.
  const base = useMemo(() => parseDesenho(conteudoInicial), [conteudoInicial]);

  const paleta = useMemo(() => lerPaletaCanvas(), []);
  const escuro = temaEscuroAtivo();

  useEffect(() => {
    let vivo = true;
    void reidratarFiles(base).then((files) => {
      if (vivo && apiRef.current) apiRef.current.addFiles(Object.values(files));
    });
    return () => {
      vivo = false;
    };
  }, [base]);

  const pintarGrade = useCallback(
    (appState: Readonly<AppState>) => {
      const el = gradeRef.current;
      if (!el) return;
      const passo = PASSO_GRADE * appState.zoom.value;
      el.style.backgroundSize = `${passo}px ${passo}px`;
      el.style.backgroundPosition = `${appState.scrollX * appState.zoom.value}px ${appState.scrollY * appState.zoom.value}px`;
    },
    [],
  );

  const aoMudar = useCallback(
    (
      elements: readonly unknown[],
      appState: Readonly<AppState>,
    ) => {
      pintarGrade(appState);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const vivos = elements.filter(
          (e) => !(e as { isDeleted?: boolean }).isDeleted,
        ) as never[];
        const idPorEl = blockIdsDaCena(
          vivos as unknown as { id: string; type: string }[],
        );
        const textElements = new Map<string, string>();
        for (const e of vivos as unknown as { id: string; type: string; text?: string }[]) {
          if (e.type === "text") textElements.set(idPorEl.get(e.id)!, e.text ?? "");
        }
        const md = serializarDesenho({
          frontmatter: base.frontmatter,
          verso: base.verso,
          textElements,
          elementLinks: base.elementLinks,
          embeddedFiles: base.embeddedFiles,
          cena: {
            elements: vivos as never,
            appState: { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom },
          },
        });
        onEditar(md);
      }, DEBOUNCE_MS);
    },
    [base, onEditar, pintarGrade],
  );

  const corGrade = paleta.grade || "#DCD5C8";

  return (
    <div className="relative h-full w-full">
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
    </div>
  );
}
