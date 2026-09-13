// Gateiro (doc 11 §5.1): o modelo barato lê o começo da nota uma vez e decide se vale
// convidar o usuário. Parse defensivo: resposta malformada = não convida, nunca erro na
// tela por isso.

export interface VereditoGateiro {
  valeParticipar: boolean;
  tema: string;
  confianca: number;
}

/** Primeiro recorte da nota que vai ao gateiro (doc 11 §5.1). */
export const GATEIRO_CHARS = 2000;

export const SYSTEM_GATEIRO =
  "Você analisa notas do Excalisidian, um app de notas pessoais em markdown. " +
  "Leia a nota e responda SOMENTE com um objeto JSON, sem texto ao redor, no formato: " +
  '{"valeParticipar": boolean, "tema": string, "confianca": number}. ' +
  "valeParticipar: true apenas quando a nota tem um assunto concreto que rende ajuda " +
  "(relacionar com outras notas, apontar lacunas, sugerir perguntas) — não para listas " +
  "de tarefas soltas, diários de uma linha ou rascunhos sem conteúdo. " +
  "tema: o assunto em duas a seis palavras, em português do Brasil, minúsculo. " +
  "confianca: número entre 0 e 1.";

export function promptGateiro(textoNota: string): string {
  return textoNota.slice(0, GATEIRO_CHARS);
}

/** Extrai o primeiro objeto JSON da resposta (tolera cercas e texto sobrando). */
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

export function interpretarGateiro(resposta: string): VereditoGateiro | null {
  const obj = primeiroObjeto(resposta);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.valeParticipar !== "boolean") return null;
  const tema = typeof o.tema === "string" ? o.tema.trim() : "";
  const confianca =
    typeof o.confianca === "number" && Number.isFinite(o.confianca)
      ? Math.max(0, Math.min(1, o.confianca))
      : 0;
  if (tema === "") return null;
  return { valeParticipar: o.valeParticipar, tema, confianca };
}

/** Regra de corte do doc 11 §5.1: só convida com confiança mínima. */
export const CONFIANCA_MINIMA = 0.5;

export function deveConvidar(v: VereditoGateiro | null): v is VereditoGateiro {
  return !!v && v.valeParticipar && v.confianca >= CONFIANCA_MINIMA;
}
