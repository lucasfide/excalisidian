import { PASTA_ANEXOS, ehImagem, mimeDaImagem } from "./anexos";
import type { EntradaArquivo } from "./VaultAdapter";

export interface ImagemAnexo {
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
  atualizadaEm: number;
}

export interface UrlBlobRevogavel {
  url: string;
  revogar: () => void;
}

/** Retorna apenas imagens de arquivos dentro da pasta fixa de anexos. */
export function filtrarImagensAnexos(entradas: EntradaArquivo[]): ImagemAnexo[] {
  return entradas
    .filter(
      (entrada) =>
        !entrada.isDir &&
        entrada.path.startsWith(`${PASTA_ANEXOS}/`) &&
        ehImagem(entrada.path),
    )
    .map((entrada) => ({
      path: entrada.path,
      nome: entrada.path.slice(entrada.path.lastIndexOf("/") + 1),
      mime: mimeDaImagem(entrada.path),
      tamanho: entrada.size,
      atualizadaEm: entrada.mtimeMs,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Cria uma URL temporária para uma imagem e expõe sua revogação explícita. */
export function criarUrlBlobImagem(bytes: Uint8Array, mime: string): UrlBlobRevogavel {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  let revogada = false;
  return {
    url,
    revogar: () => {
      if (revogada) return;
      revogada = true;
      URL.revokeObjectURL(url);
    },
  };
}

export function embedMarkdownDoAnexo(path: string): string {
  return `![[${path}]]`;
}
