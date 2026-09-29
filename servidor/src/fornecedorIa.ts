// servidor/src/fornecedorIa.ts
// A chamada ao fornecedor de IA (doc 18 §5.1, passo 9). O app pede um modelo LÓGICO
// (`leitura-rapida` ou `acompanhamento`); o modelo real sai daqui — hoje os dois apontam para
// `config.ia.modelo`. O fornecedor é o OpenRouter (ADR-44). Raciocínio sempre desligado com
// `reasoning` (vem ligado por padrão e gasta créditos à toa; também cortaria a resposta curta da
// leitura rápida — doc 09, Parte 2). Só provedores que não guardam dados, com teto de preço.
//
// Nunca repassa ao fornecedor nada além de `messages` normalizadas e do teto de saída, e nunca
// coloca a chave nem o corpo da resposta do fornecedor numa mensagem de erro (que poderia
// acabar num log).

import type { ConfigIa } from "./config";
import type { UsoFornecedor } from "./creditosIa";

export const MODELOS_LOGICOS = ["leitura-rapida", "acompanhamento"] as const;
export type ModeloLogico = (typeof MODELOS_LOGICOS)[number];

export function ehModeloLogico(m: string): m is ModeloLogico {
  return (MODELOS_LOGICOS as readonly string[]).includes(m);
}

/** Teto de preço em US$ por milhão de tokens. Tem de bater com `TETO_NANO_USD` de creditosIa.ts. */
const TETO_PRECO = { prompt: 0.3, completion: 1.2 } as const;

const SAIDA_PADRAO = 2048;
const TETO_SAIDA = 4096;
const TEMPO_MAXIMO_MS = 90_000;

export function tetoDeSaida(pedido: number | undefined): number {
  if (pedido === undefined) return SAIDA_PADRAO;
  return Math.min(pedido, TETO_SAIDA);
}

export interface MensagemIa {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RespostaFornecedor {
  texto: string;
  motivoFim: string;
  /** O que se cobra (doc 18 §5.2). */
  uso: UsoFornecedor;
  /** O que se devolve ao app em `usage`. */
  tokensEntrada: number;
  tokensSaida: number;
  /** `usage.cost` do OpenRouter (US$ cobrados), se veio válido. Sem ele, cobra-se pelo teto. */
  custoUsd?: number;
}

export class FalhaFornecedor extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "FalhaFornecedor";
  }
}

function inteiroNaoNegativo(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** Lê o `usage` do fornecedor. Sem `usage`, estima PARA CIMA (1 token ≤ 1 caractere; saída =
 * teto pedido) — um pedido nunca sai de graça. Sem detalhe de cache, toda a entrada conta
 * como sem cache. O detalhe de cache é procurado nos lugares conhecidos (doc 09, Parte 3,
 * item 33). */
function lerUso(
  usage: unknown,
  estimativa: { entrada: number; saida: number },
): Pick<RespostaFornecedor, "uso" | "tokensEntrada" | "tokensSaida"> {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  const detalhes = (u.prompt_tokens_details && typeof u.prompt_tokens_details === "object"
    ? u.prompt_tokens_details
    : {}) as Record<string, unknown>;
  const entrada = inteiroNaoNegativo(u.prompt_tokens);
  const saida = inteiroNaoNegativo(u.completion_tokens);
  if (entrada === undefined || saida === undefined) {
    return {
      uso: { entradaComCache: 0, entradaSemCache: estimativa.entrada, saida: estimativa.saida },
      tokensEntrada: estimativa.entrada,
      tokensSaida: estimativa.saida,
    };
  }
  const comCache =
    inteiroNaoNegativo(u.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(detalhes.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(detalhes.cached_tokens) ??
    inteiroNaoNegativo(u.cached_tokens) ??
    0;
  const comCacheLimitado = Math.min(comCache, entrada);
  return {
    uso: { entradaComCache: comCacheLimitado, entradaSemCache: entrada - comCacheLimitado, saida },
    tokensEntrada: entrada,
    tokensSaida: saida,
  };
}

export async function chamarFornecedor(args: {
  ia: ConfigIa;
  fetchImpl: typeof fetch;
  mensagens: MensagemIa[];
  maxTokens: number;
  tempoMaximoMs?: number;
}): Promise<RespostaFornecedor> {
  const corpo = {
    model: args.ia.modelo,
    messages: args.mensagens,
    max_tokens: args.maxTokens,
    stream: false,
    reasoning: { enabled: false },
    provider: { data_collection: "deny", max_price: TETO_PRECO },
  };

  let json: unknown;
  try {
    const res = await args.fetchImpl(`${args.ia.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.ia.chave}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(args.tempoMaximoMs ?? TEMPO_MAXIMO_MS),
    });
    if (!res.ok) throw new FalhaFornecedor(`fornecedor respondeu ${res.status}`);
    json = await res.json();
  } catch (erro) {
    if (erro instanceof FalhaFornecedor) throw erro;
    throw new FalhaFornecedor("sem resposta do fornecedor (rede, tempo esgotado ou corpo inválido)");
  }

  const escolha = (json as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] })
    ?.choices?.[0];
  const texto = escolha?.message?.content;
  if (typeof texto !== "string" || texto.length === 0) {
    throw new FalhaFornecedor("resposta do fornecedor sem texto");
  }
  const usage = (json as { usage?: unknown }).usage;
  const custo = (usage as { cost?: unknown } | null | undefined)?.cost;
  const custoUsd = typeof custo === "number" && Number.isFinite(custo) && custo >= 0 ? custo : undefined;
  const caracteres = args.mensagens.reduce((soma, m) => soma + m.content.length, 0);
  return {
    texto,
    motivoFim: typeof escolha?.finish_reason === "string" ? escolha.finish_reason : "stop",
    custoUsd,
    ...lerUso(usage, { entrada: caracteres, saida: args.maxTokens }),
  };
}
