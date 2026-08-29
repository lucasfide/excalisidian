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

/** Nome pra exibir na árvore/lista: pasta mostra como está; nota e desenho escondem a
 * extensão — o mesmo critério que a aba (`nomeCurto`, workspaceStore.ts) e o título
 * (`basenameSemExtensao`, indice/parser.ts) já usam, com o ícone do nó substituindo a
 * extensão como pista visual do tipo. Anexo mantém a extensão (".png" etc. segue relevante,
 * o ícone sozinho não diz qual formato de imagem é). */
export function nomeExibicao(no: NoArvore): string {
  if (no.tipo === "folder" || no.tipo === "attachment") return no.nome;
  return no.nome.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
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

/** Acha o nó de um caminho na árvore, ou `null` se não existir (arquivo apagado por fora,
 * por exemplo — quem chama trata como "pasta vazia"/"não achou"). */
export function encontrarNo(raiz: NoArvore, path: string): NoArvore | null {
  if (raiz.path === path) return raiz;
  for (const filho of raiz.filhos) {
    if (path === filho.path || path.startsWith(`${filho.path}/`)) {
      return encontrarNo(filho, path);
    }
  }
  return null;
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
