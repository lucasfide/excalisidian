// Ciclo do assistente (doc 11 §5.3): monta o prompt com tetos fixos, pede saída
// estruturada, e interpreta com desconfiança. O agente NÃO escreve em nada: sugestão é
// texto no painel, e o usuário decide o que fazer com ela (doc 11 §10.6).

export type TipoSugestao =
  | "pergunta"
  | "conteudo"
  | "gap"
  | "notaRelacionada"
  | "achadoWeb";

export interface SugestaoAgente {
  id: string;
  tipo: TipoSugestao;
  texto: string;
  /** Obrigatória em `notaRelacionada`; já resolvida contra o índice. */
  caminhoNota?: string;
}

export const NOTA_TETO_CHARS = 6000;
export const DIFF_TETO_CHARS = 1200;
export const RESUMO_TETO_CHARS = 400;

const TIPOS_VALIDOS = new Set<TipoSugestao>([
  "pergunta",
  "conteudo",
  "gap",
  "notaRelacionada",
  "achadoWeb",
]);

export function systemAssistente(caminho: string): string {
  return (
    "Você é o assistente de escrita do Excalisidian, acompanhando a nota «" +
    caminho +
    "» a pedido do autor. " +
    "Você NÃO edita o arquivo de ninguém: suas sugestões aparecem num painel lateral. " +
    "Ao receber o material, responda SOMENTE com JSON no formato: " +
    '{"sugestoes":[{"tipo":"pergunta"|"conteudo"|"gap"|"notaRelacionada",' +
    '"texto":string,"caminhoNota":string|null}],' +
    '"novosFatos":[string]}. ' +
    "No máximo 4 sugestões, cada uma com uma ou duas frases em português do Brasil. " +
    "pergunta: algo que o autor ainda não respondeu na nota. " +
    "conteudo: um trecho pronto que ele pode querer aproveitar. " +
    "gap: lacuna ou contradição que você notou. " +
    "notaRelacionada: aponte uma nota do vault (use exatamente um dos caminhos fornecidos " +
    "em «notas relacionadas» e escreva por que ela se conecta ao texto). " +
    "novosFatos: no máximo 2 observações duráveis sobre o autor/vault aprendidas agora " +
    "(ex.: um termo que ele usa), ou lista vazia. " +
    "Se não houver nada útil a dizer, responda {\"sugestoes\":[],\"novosFatos\":[]}. " +
    "Nunca invente caminho de nota."
  );
}

export interface MaterialCiclo {
  caminho: string;
  /** Texto atual da nota (a cauda entra no prompt; o teto é aplicado aqui). */
  nota: string;
  /** Diff desde o último ciclo (texto das linhas novas/removidas). */
  diff: string;
  relacionadas: { path: string; titulo: string; texto: string }[];
  fatos: string[];
}

export function montarPrompt(m: MaterialCiclo): string {
  const partes: string[] = [];
  if (m.fatos.length > 0) {
    partes.push(
      "### O que você já sabe sobre o autor\n" +
        m.fatos.join("\n").slice(0, 4800),
    );
  }
  if (m.relacionadas.length > 0) {
    const bloco = m.relacionadas
      .map(
        (r) =>
          `- ${r.path} («${r.titulo}»): ${r.texto.slice(0, RESUMO_TETO_CHARS).replace(/\n+/g, " ")}`,
      )
      .join("\n");
    partes.push("### Notas relacionadas\n" + bloco);
  }
  partes.push(
    "### O que mudou na nota desde a última vez\n" +
      (m.diff.trim() === "" ? "(nada novo)" : m.diff.slice(0, DIFF_TETO_CHARS)),
  );
  partes.push(
    "### Nota atual (fim)\n" + m.nota.slice(-NOTA_TETO_CHARS),
  );
  return partes.join("\n\n");
}

function primeiroObjeto(texto: string): unknown | null {
  const bruto = texto.replace(/```(?:json)?/gi, "");
  const inicio = bruto.indexOf("{");
  if (inicio < 0) return null;
  for (let fim = bruto.length; fim > inicio; fim--) {
    if (bruto[fim - 1] !== "}") continue;
    try {
      return JSON.parse(bruto.slice(inicio, fim));
    } catch {
      // tenta o próximo fechamento
    }
  }
  return null;
}

let proximoId = 1;

export interface ResultadoCiclo {
  sugestoes: SugestaoAgente[];
  novosFatos: string[];
}

/**
 * `caminhoValido` decide o que é link real: nota relacionada com caminho que não está no
 * índice é descartada junto com a sugestão — nunca apontar pro vazio (doc 11 §5.3).
 */
export function interpretarCiclo(
  resposta: string,
  caminhoValido: (caminho: string) => boolean,
): ResultadoCiclo | null {
  const obj = primeiroObjeto(resposta);
  if (!obj || typeof obj !== "object") return null;
  const brutas = (obj as Record<string, unknown>).sugestoes;
  if (!Array.isArray(brutas)) return null;
  const sugestoes: SugestaoAgente[] = [];
  for (const b of brutas) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const tipo = String(o.tipo ?? "");
    const texto = typeof o.texto === "string" ? o.texto.trim() : "";
    if (!TIPOS_VALIDOS.has(tipo as TipoSugestao) || texto === "") continue;
    if (tipo === "achadoWeb") continue; // web search é P2 (doc 11 §5.4)
    const caminho =
      typeof o.caminhoNota === "string" && o.caminhoNota.trim() !== ""
        ? o.caminhoNota.trim()
        : undefined;
    if (tipo === "notaRelacionada") {
      if (!caminho || !caminhoValido(caminho)) continue;
    }
    sugestoes.push({
      id: `s-${Date.now()}-${proximoId++}`,
      tipo: tipo as TipoSugestao,
      texto,
      ...(caminho && tipo === "notaRelacionada" ? { caminhoNota: caminho } : {}),
    });
    if (sugestoes.length >= 4) break;
  }
  const fatos = Array.isArray((obj as Record<string, unknown>).novosFatos)
    ? (obj as { novosFatos: unknown[] }).novosFatos
        .filter((f): f is string => typeof f === "string" && f.trim() !== "")
        .map((f) => f.trim())
        .slice(0, 2)
    : [];
  return { sugestoes, novosFatos: fatos };
}
