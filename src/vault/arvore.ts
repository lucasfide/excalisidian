// Monta a árvore de pastas a partir da lista plana do walk_vault. A UI da sidebar consome
// esta árvore; a virtualização (Fatia 1) achata só os nós visíveis.

import type { EntradaArquivo } from "./VaultAdapter";

export type TipoNo = "note" | "drawing" | "attachment" | "folder";

export interface NoArvore {
  /** Caminho relativo à raiz, com "/". "" é a raiz. */
  path: string;
  nome: string;
  tipo: TipoNo;
  filhos: NoArvore[];
}

export function tipoDoArquivo(nome: string): Exclude<TipoNo, "folder"> {
  const n = nome.toLowerCase();
  if (n.endsWith(".draw.md")) return "drawing";
  if (n.endsWith(".md")) return "note";
  return "attachment";
}

function nomeDe(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function ordenar(nos: NoArvore[]): NoArvore[] {
  return nos
    .sort((a, b) => {
      const pastaA = a.tipo === "folder" ? 0 : 1;
      const pastaB = b.tipo === "folder" ? 0 : 1;
      if (pastaA !== pastaB) return pastaA - pastaB;
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    })
    .map((n) => ({ ...n, filhos: ordenar(n.filhos) }));
}

/** Constrói a árvore. A raiz devolvida tem path "" e nome vazio. */
export function montarArvore(entradas: EntradaArquivo[]): NoArvore {
  const raiz: NoArvore = { path: "", nome: "", tipo: "folder", filhos: [] };
  const porPath = new Map<string, NoArvore>([["", raiz]]);

  /** Garante que a pasta `path` e todas as ancestrais existem, e devolve o nó. */
  function garantirPasta(path: string): NoArvore {
    const existente = porPath.get(path);
    if (existente) return existente;
    const pai = garantirPasta(path.slice(0, Math.max(0, path.lastIndexOf("/"))));
    const no: NoArvore = {
      path,
      nome: nomeDe(path),
      tipo: "folder",
      filhos: [],
    };
    pai.filhos.push(no);
    porPath.set(path, no);
    return no;
  }

  for (const e of entradas) {
    if (e.isDir) {
      garantirPasta(e.path);
      continue;
    }
    const paiPath = e.path.slice(0, Math.max(0, e.path.lastIndexOf("/")));
    const pai = garantirPasta(paiPath);
    const no: NoArvore = {
      path: e.path,
      nome: nomeDe(e.path),
      tipo: tipoDoArquivo(e.path),
      filhos: [],
    };
    pai.filhos.push(no);
    porPath.set(e.path, no);
  }

  raiz.filhos = ordenar(raiz.filhos);
  return raiz;
}
