// "Adotar" uma imagem = pegar o binário que o Excalidraw guarda só em memória (mapa `files`,
// data URL base64) e transformar num arquivo de verdade no vault + uma linha em `## Embedded
// Files` (doc 02 §"Imagens"). Roda no `onChange` do canvas, então cobre TODA origem de imagem
// — colar, arrastar e soltar, ferramenta de imagem da toolbar — e não só o `Ctrl+V`.
//
// Antes existia um handler próprio de `paste` (EditorDesenho.colarImagem). Ele foi removido:
// não conseguia calar o paste nativo do Excalidraw (que escuta em `document` e não checa
// `defaultPrevented`), então toda imagem colada entrava duas vezes — a nativa, com proporção
// certa, e a nossa, quadrada (sem `width`/`height`). E a nativa nunca virava embed, então
// sumia ao reabrir. Ver doc 09.
//
// Puro: recebe elementos + o mapa `files` já lido da API, nunca `EditorView`/`ExcalidrawAPI`.

export interface ImagemParaAdotar {
  fileId: string;
  bytes: Uint8Array;
  /** Extensão sem ponto, derivada do mime (`image/svg+xml` → `svg`). */
  ext: string;
}

const EXT_POR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

function extDe(mime: string): string {
  return (
    EXT_POR_MIME[mime] ??
    ((mime.split("/")[1] ?? "png").replace("+xml", "") || "png")
  );
}

/** Inverso de `bytesParaDataUrl` (reidratarFiles.ts). Aceita data URL base64 e, por segurança,
 * a forma sem base64 (SVG às vezes vem url-encoded). Devolve bytes vazios se não parsear. */
export function dataUrlParaBytes(dataURL: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataURL);
  if (!m) return { bytes: new Uint8Array(), mime: "" };
  const mime = m[1] || "application/octet-stream";
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
}

interface ElementoLeve {
  type: string;
  fileId?: string | null;
  isDeleted?: boolean;
}

/**
 * Imagens vivas da cena cujo `fileId` ainda não tem embed registrado mas cujo binário está no
 * mapa `files`. Deduplicado por `fileId` (o id de arquivo do Excalidraw é hash do conteúdo:
 * colar a mesma imagem duas vezes reaproveita).
 */
export function imagensParaAdotar(
  elements: readonly ElementoLeve[],
  files: Record<string, { dataURL?: string } | undefined>,
  jaEmbedados: ReadonlySet<string>,
): ImagemParaAdotar[] {
  const vistos = new Set<string>();
  const saida: ImagemParaAdotar[] = [];
  for (const el of elements) {
    if (el.type !== "image" || el.isDeleted) continue;
    const fileId = el.fileId;
    if (!fileId || jaEmbedados.has(fileId) || vistos.has(fileId)) continue;
    const dataURL = files[fileId]?.dataURL;
    if (!dataURL) continue;
    vistos.add(fileId);
    const { bytes, mime } = dataUrlParaBytes(dataURL);
    if (bytes.length === 0) continue;
    saida.push({ fileId, bytes, ext: extDe(mime) });
  }
  return saida;
}
