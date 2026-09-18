// Modos de ordenação da sidebar e a lógica pura pra aplicá-los (doc: ordenacao-arvore
// design). Customizada e alfabética reordenam a árvore existente (arvore.ts, normativo,
// fica intocado); data ignora hierarquia e devolve uma lista achatada.

import type { NoArvore } from "./arvore";

export type ModoOrdenacao = "custom" | "alphabetical" | "dateDesc" | "dateAsc";

/** Ordem fixa em que os modos aparecem no dropdown do botão de ordenar. */
export const ORDEM_MODOS: ModoOrdenacao[] = ["custom", "alphabetical", "dateDesc", "dateAsc"];

export const ROTULO_MODO: Record<ModoOrdenacao, string> = {
  custom: "Customizada",
  alphabetical: "Alfabética",
  dateDesc: "Data (mais recente)",
  dateAsc: "Data (mais antiga)",
};

/** `sep-xxxxxx`: entrada sintética de separador dentro de customOrder[""] — nunca corresponde
 * a um NoArvore de verdade. */
function ehSeparador(entrada: string): boolean {
  return entrada.startsWith("sep-");
}

function compararAlfabetico(a: NoArvore, b: NoArvore): number {
  const pastaA = a.tipo === "folder" ? 0 : 1;
  const pastaB = b.tipo === "folder" ? 0 : 1;
  if (pastaA !== pastaB) return pastaA - pastaB;
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
}

function ordenarNivel(
  filhos: NoArvore[],
  ordem: string[] | undefined,
): NoArvore[] {
  if (!ordem || ordem.length === 0) {
    return [...filhos].sort(compararAlfabetico);
  }
  const nomes = ordem.filter((e) => !ehSeparador(e));
  const posicao = new Map(nomes.map((nome, i) => [nome, i]));
  const conhecidos = filhos.filter((n) => posicao.has(n.nome));
  const desconhecidos = filhos
    .filter((n) => !posicao.has(n.nome))
    .sort(compararAlfabetico);
  conhecidos.sort((a, b) => posicao.get(a.nome)! - posicao.get(b.nome)!);
  return [...conhecidos, ...desconhecidos];
}

/** Reordena `filhos` em cada nível da árvore, recursivamente. Não muda a raiz (path "") em
 * si, só a ordem de `raiz.filhos` e de cada pasta dentro dela. */
export function ordenarArvore(
  raiz: NoArvore,
  modo: "custom" | "alphabetical",
  customOrder: Record<string, string[]>,
): NoArvore {
  function visitar(no: NoArvore): NoArvore {
    const ordem = modo === "custom" ? customOrder[no.path] : undefined;
    const filhosOrdenados = ordenarNivel(no.filhos, ordem);
    return { ...no, filhos: filhosOrdenados.map(visitar) };
  }
  return visitar(raiz);
}

export interface ItemData {
  no: NoArvore;
  /** Caminho da pasta que contém o arquivo, "" para a raiz do vault. */
  pastaExibicao: string;
  mtimeMs: number;
}

function pastaDoPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Achata a árvore em notas e desenhos (ignora pastas e a pasta "anexos", mesmo filtro que
 * a árvore normal já aplica), ordenados por mtimeMs. */
export function listaPorData(
  raiz: NoArvore,
  modo: "dateDesc" | "dateAsc",
  metaPorPath: Map<string, { mtimeMs: number }>,
): ItemData[] {
  const itens: ItemData[] = [];
  function visitar(no: NoArvore) {
    for (const filho of no.filhos) {
      if (filho.path === "anexos") continue;
      if (filho.tipo === "folder") {
        visitar(filho);
        continue;
      }
      if (filho.tipo !== "note" && filho.tipo !== "drawing") continue;
      itens.push({
        no: filho,
        pastaExibicao: pastaDoPath(filho.path),
        mtimeMs: metaPorPath.get(filho.path)?.mtimeMs ?? 0,
      });
    }
  }
  visitar(raiz);
  itens.sort((a, b) => (modo === "dateDesc" ? b.mtimeMs - a.mtimeMs : a.mtimeMs - b.mtimeMs));
  return itens;
}
