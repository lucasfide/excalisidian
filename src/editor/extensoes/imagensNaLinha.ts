// Lógica pura das imagens na nota (doc 04 §3.6): achar os `![[…]]` de uma linha, reescrever a
// largura de um deles e calcular as mudanças de texto para mover um embed para o lado de outro
// ou para uma linha própria. Nada aqui conhece DOM — `embedImagem.ts` traduz gesto em chamada.
//
// O formato em disco é o do Obsidian, para o arquivo continuar portátil: largura no alias
// (`![[foto.png|400]]`) e imagens lado a lado = embeds na mesma linha.

export interface EmbedNaLinha {
  /** Início e fim do `![[…]]`, relativos ao começo da linha. */
  de: number;
  ate: number;
  /** Tudo antes do primeiro `|` (o caminho do alvo). */
  alvo: string;
  /** Depois do `|`, se houver (largura, em imagem). */
  alias?: string;
}

const RE_EMBED = /!\[\[([^[\]\n]+?)\]\]/g;

export function embedsNaLinha(texto: string): EmbedNaLinha[] {
  const achados: EmbedNaLinha[] = [];
  RE_EMBED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_EMBED.exec(texto)) !== null) {
    const miolo = m[1];
    const barra = miolo.indexOf("|");
    achados.push({
      de: m.index,
      ate: m.index + m[0].length,
      alvo: (barra < 0 ? miolo : miolo.slice(0, barra)).trim(),
      alias: barra < 0 ? undefined : miolo.slice(barra + 1).trim(),
    });
  }
  return achados;
}

/** A linha não tem nada além de embeds (e espaço entre eles). */
export function linhaSoDeEmbeds(texto: string, embeds: EmbedNaLinha[]): boolean {
  if (embeds.length === 0) return false;
  let resto = texto;
  for (const e of [...embeds].reverse()) resto = resto.slice(0, e.de) + resto.slice(e.ate);
  return resto.trim() === "";
}

/** Largura em px pelo alias: `400` ou `400x300` (só o primeiro número). */
export function larguraDoAlias(alias: string | undefined): number | null {
  const m = alias ? /^(\d+)/.exec(alias) : null;
  return m ? Number(m[1]) : null;
}

/** `![[alvo|400]]`, ou `![[alvo]]` com `largura` nula (volta ao tamanho natural). */
export function embedComLargura(alvo: string, largura: number | null): string {
  return largura === null ? `![[${alvo}]]` : `![[${alvo}|${Math.round(largura)}]]`;
}

export interface LinhaDoc {
  from: number;
  to: number;
  text: string;
}

/** O mínimo do `Text` do CodeMirror que o cálculo precisa — permite testar sem editor. */
export interface DocLinhas {
  lines: number;
  line(n: number): LinhaDoc;
}

export interface Mudanca {
  from: number;
  to: number;
  insert: string;
}

export type DestinoImagem =
  /** Ao lado de outro embed (`indice` entre os embeds daquela linha). */
  | { tipo: "lado"; linha: number; indice: number; lado: "antes" | "depois" }
  /** Numa linha própria, antes ou depois da linha `linha`. */
  | { tipo: "linha"; linha: number; posicao: "antes" | "depois" };

/**
 * Mudanças (em posições do documento atual, sem sobreposição, em ordem) para mover o embed
 * `indice` da linha `linha` até `destino`. Devolve `null` quando o movimento não muda nada
 * (soltar a imagem no próprio lugar).
 */
export function mudancasParaMover(
  doc: DocLinhas,
  origem: { linha: number; indice: number },
  destino: DestinoImagem,
): Mudanca[] | null {
  const linhaO = doc.line(origem.linha);
  const embedsO = embedsNaLinha(linhaO.text);
  const e = embedsO[origem.indice];
  if (!e) return null;
  const textoEmbed = linhaO.text.slice(e.de, e.ate);
  const sozinho = embedsO.length === 1 && linhaSoDeEmbeds(linhaO.text, embedsO);

  // Soltar no próprio lugar.
  if (destino.tipo === "lado" && destino.linha === origem.linha) {
    if (destino.indice === origem.indice) return null;
    if (destino.lado === "antes" && destino.indice === origem.indice + 1) return null;
    if (destino.lado === "depois" && destino.indice === origem.indice - 1) return null;
  }
  if (destino.tipo === "linha" && sozinho) {
    if (destino.linha === origem.linha) return null;
    if (destino.posicao === "depois" && destino.linha === origem.linha - 1) return null;
    if (destino.posicao === "antes" && destino.linha === origem.linha + 1) return null;
  }

  // Remoção: a linha inteira, se o embed era tudo o que ela tinha; senão o embed e um espaço
  // vizinho (o de depois, ou o de antes no fim da linha), para não sobrar espaço duplo.
  let remocao: Mudanca;
  if (sozinho) {
    if (origem.linha < doc.lines) remocao = { from: linhaO.from, to: linhaO.to + 1, insert: "" };
    else if (origem.linha > 1) remocao = { from: linhaO.from - 1, to: linhaO.to, insert: "" };
    else remocao = { from: linhaO.from, to: linhaO.to, insert: "" };
  } else {
    let de = e.de;
    let ate = e.ate;
    if (linhaO.text[ate] === " ") ate += 1;
    else if (de > 0 && linhaO.text[de - 1] === " ") de -= 1;
    remocao = { from: linhaO.from + de, to: linhaO.from + ate, insert: "" };
  }

  let insercao: Mudanca;
  if (destino.tipo === "lado") {
    const linhaD = doc.line(destino.linha);
    const alvo = embedsNaLinha(linhaD.text)[destino.indice];
    if (!alvo) return null;
    insercao =
      destino.lado === "antes"
        ? { from: linhaD.from + alvo.de, to: linhaD.from + alvo.de, insert: `${textoEmbed} ` }
        : { from: linhaD.from + alvo.ate, to: linhaD.from + alvo.ate, insert: ` ${textoEmbed}` };
  } else {
    const linhaD = doc.line(destino.linha);
    insercao =
      destino.posicao === "antes"
        ? { from: linhaD.from, to: linhaD.from, insert: `${textoEmbed}\n` }
        : { from: linhaD.to, to: linhaD.to, insert: `\n${textoEmbed}` };
  }

  // Inserção dentro do trecho removido (só acontece na mesma linha, com o espaço vizinho):
  // encosta a inserção na borda da remoção para as duas não se sobreporem.
  if (insercao.from > remocao.from && insercao.from < remocao.to) {
    insercao = { ...insercao, from: remocao.to, to: remocao.to };
  }
  return [remocao, insercao].sort((a, b) => a.from - b.from || a.to - b.to);
}
