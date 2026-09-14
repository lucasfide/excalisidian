// Camada 0 do pipeline (doc 11 §5.0): tudo local, custo zero. Decide QUANDO o agente
// pode falar com a rede — nunca por linha digitada. Funções puras: os timers e a
// assinatura dos stores vivem no agenteStore.

export const INATIVIDADE_CICLO_MS = 10_000;
export const INATIVIDADE_GATEIRO_MS = 5_000;
export const DIFUS_MINIMO_CHARS = 200;
export const GATEIRO_NOTA_MINIMA_CHARS = 140;

/**
 * Quantos caracteres a nota ganhou desde o último ciclo. Multiconjunto de linhas: linhas
 * repetidas contam quantas vezes aparecem; o que excede o anterior conta como novo.
 * Uma edição que só reordena linhas não conta como conteúdo novo — é de propósito.
 */
export function caracteresNovos(ultimo: string | null, atual: string): number {
  if (ultimo === null) return atual.length;
  if (ultimo === atual) return 0;
  const sobra = new Map<string, number>();
  for (const linha of ultimo.split("\n")) {
    sobra.set(linha, (sobra.get(linha) ?? 0) + 1);
  }
  let novos = 0;
  for (const linha of atual.split("\n")) {
    const n = sobra.get(linha);
    if (n && n > 0) sobra.set(linha, n - 1);
    else novos += linha.length + 1;
  }
  return novos;
}

/** O diff em si, legível para o modelo: linhas novas com `+`, removidas com `-`. */
export function textoNovo(ultimo: string | null, atual: string): string {
  if (ultimo === null) return atual;
  if (ultimo === atual) return "";
  const sobraAnterior = new Map<string, number>();
  for (const linha of ultimo.split("\n")) {
    sobraAnterior.set(linha, (sobraAnterior.get(linha) ?? 0) + 1);
  }
  const novas: string[] = [];
  for (const linha of atual.split("\n")) {
    const n = sobraAnterior.get(linha);
    if (n && n > 0) {
      sobraAnterior.set(linha, n - 1);
      continue;
    }
    if (linha.trim() !== "") novas.push(linha);
  }
  const sobraAtual = new Map<string, number>();
  for (const linha of atual.split("\n")) {
    sobraAtual.set(linha, (sobraAtual.get(linha) ?? 0) + 1);
  }
  const removidas: string[] = [];
  for (const linha of ultimo.split("\n")) {
    const n = sobraAtual.get(linha);
    if (n && n > 0) {
      sobraAtual.set(linha, n - 1);
      continue;
    }
    if (linha.trim() !== "") removidas.push(linha);
  }
  const partes: string[] = [];
  if (novas.length > 0) partes.push(novas.map((l) => `+ ${l}`).join("\n"));
  // removidas entram truncadas: o modelo precisa saber o que sumiu, não de cada linha.
  if (removidas.length > 0)
    partes.push(removidas.slice(0, 20).map((l) => `- ${l}`).join("\n"));
  return partes.join("\n");
}

export interface CondicaoCiclo {
  habilitado: boolean;
  pausado: boolean;
  participacao: string | undefined;
  caracteresNovos: number;
  emVoo: boolean;
}

/** Ciclo do assistente: só com aceite, sem voo, sem pausa e com volume novo real. */
export function deveRodarCiclo(c: CondicaoCiclo): boolean {
  return (
    c.habilitado &&
    !c.pausado &&
    c.participacao === "aceito" &&
    !c.emVoo &&
    c.caracteresNovos >= DIFUS_MINIMO_CHARS
  );
}

export interface CondicaoGateiro {
  habilitado: boolean;
  pausado: boolean;
  /** Nota ainda sem convite respondido ou recusado. */
  semParticipacao: boolean;
  /** Nunca tentou nesta sessão, ou cresceu >50% desde a última tentativa (doc 11 §5.1). */
  elegivel: boolean;
  notaSuficiente: boolean;
  emVoo: boolean;
}

export function deveRodarGateiro(c: CondicaoGateiro): boolean {
  return (
    c.habilitado &&
    !c.pausado &&
    c.semParticipacao &&
    c.elegivel &&
    c.notaSuficiente &&
    !c.emVoo
  );
}

/** "cresceu mais de 50% desde a tentativa anterior" — reabre o convite em nota longa. */
export function cresceuDemais(charsTentativa: number, charsAtual: number): boolean {
  return charsAtual >= charsTentativa * 1.5 && charsAtual - charsTentativa >= DIFUS_MINIMO_CHARS;
}
