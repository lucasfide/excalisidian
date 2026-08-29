// Reidrata o mapa `files` do Excalidraw a partir de `## Embedded Files`, lendo cada arquivo
// do vault e convertendo para data URL. Compartilhado entre o editor de desenho e o
// renderizador de SVG do embed — os dois precisam da mesma imagem em memória.

import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { useVaultStore } from "../estado/vaultStore";
import type { DadosDesenho } from "./formatoDesenho";

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

export function mimeDe(caminho: string): string {
  return MIME[caminho.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";
}

export function alvoDoLink(link: string): string {
  return link.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
}

export function bytesParaDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function reidratarFiles(dados: DadosDesenho): Promise<BinaryFiles> {
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
