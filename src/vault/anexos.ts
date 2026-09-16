// Anexos colados (doc 02 §3 "Imagens" e §8): nome, pasta e gravação de uma imagem que veio da
// área de transferência. Mesma regra do canvas e da nota — um lugar só, pra os dois nunca
// divergirem no nome do arquivo.
//
// Pasta fixa `anexos`: é o padrão do doc 02 (`attachmentMode: fixed`). O `vault.json` com a
// preferência ainda não existe (RF8.2); quando existir, `pastaDeAnexo(nota)` entra aqui.

import { useVaultStore } from "../estado/vaultStore";
import { caminhoLivre } from "./criar";

export const PASTA_ANEXOS = "anexos";

const EXTENSOES_IMAGEM = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

const MIME_POR_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
};

function extensaoDe(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

/** Anexo que renderiza como imagem (doc 02 §8). */
export function ehImagem(path: string): boolean {
  return EXTENSOES_IMAGEM.includes(extensaoDe(path));
}

export function mimeDaImagem(path: string): string {
  return MIME_POR_EXT[extensaoDe(path)] ?? "application/octet-stream";
}

/** `YYYYMMDD-HHmmss` na hora local (doc 02: "Imagem colada YYYYMMDD-HHmmss.<ext>"). */
export function carimboImagemColada(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Grava a imagem em `anexos/Imagem colada <carimbo>.<ext>` (numerando se o carimbo repetir,
 * como ao colar duas no mesmo segundo) e devolve o caminho relativo ao vault. Lança se não
 * conseguir gravar — quem chama decide a mensagem. */
export async function salvarImagemColada(bytes: Uint8Array, ext: string): Promise<string> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) throw new Error("Nenhum vault aberto.");
  const caminho = await caminhoLivre(`${PASTA_ANEXOS}/Imagem colada ${carimboImagemColada()}`, `.${ext}`);
  await vault.adapter.criarPasta(PASTA_ANEXOS);
  await vault.adapter.escreverBinario(caminho, bytes);
  await vault.recarregarArvore();
  // Anexo não tem metadados, mas precisa entrar na resolução de links — senão o `![[…]]`
  // recém-inserido não acharia o arquivo até o próximo boot.
  await vault.reindexarArquivo(caminho);
  return caminho;
}
