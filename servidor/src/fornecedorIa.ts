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
/** Só se tenta de novo se a primeira falha veio antes disto (doc 18 §5.1). */
const LIMITE_PARA_NOVA_TENTATIVA_MS = 15_000;

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
  /** O que só serve ao registro (doc 18 §3). */
  detalhe: DetalheFornecedor;
}

/** Campos da resposta do fornecedor que vão para o registro de IA. Todos passam por conferência
 * de formato (`nomeCurto`, `idGeracaoValido`, ...): se vier texto solto, o campo é omitido. */
export interface DetalheFornecedor {
  /** `id` da geração no OpenRouter ("gen-…"). */
  idGeracao?: string;
  /** Nome do provedor que o OpenRouter escolheu. */
  provedorEscolhido?: string;
  /** `finish_reason` como veio do fornecedor. */
  motivoFim?: string;
  tokensCache?: number;
}

export type MotivoFalha = "http" | "tempo" | "rede" | "json" | "sem_texto";

/** Campos de diagnóstico de uma falha. Nunca contém texto do fornecedor além de códigos e nomes
 * conferidos: `error.message` e `metadata.raw` do OpenRouter podem ecoar o prompt. */
export interface DetalheFalha extends DetalheFornecedor {
  statusFornecedor?: number;
  codigoErroFornecedor?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
}

export class FalhaFornecedor extends Error {
  readonly motivo: MotivoFalha;
  readonly statusFornecedor?: number;
  readonly codigoErroFornecedor?: number;
  readonly provedorEscolhido?: string;
  readonly idGeracao?: string;
  readonly motivoFim?: string;
  readonly tokensEntrada?: number;
  readonly tokensSaida?: number;
  readonly tokensCache?: number;
  /** Preenchidos por `chamarComTentativa`. */
  tentativas?: number;
  duracaoMs?: number;

  constructor(mensagem: string, motivo: MotivoFalha, detalhe: DetalheFalha = {}) {
    super(mensagem);
    this.name = "FalhaFornecedor";
    this.motivo = motivo;
    this.statusFornecedor = detalhe.statusFornecedor;
    this.codigoErroFornecedor = detalhe.codigoErroFornecedor;
    this.provedorEscolhido = detalhe.provedorEscolhido;
    this.idGeracao = detalhe.idGeracao;
    this.motivoFim = detalhe.motivoFim;
    this.tokensEntrada = detalhe.tokensEntrada;
    this.tokensSaida = detalhe.tokensSaida;
    this.tokensCache = detalhe.tokensCache;
  }
}

/** Nome de provedor: curto e sem nada além de letras, dígitos e pontuação de nome. */
function nomeCurto(v: unknown): string | undefined {
  return typeof v === "string" && /^[\p{L}\p{N} ._:()/-]{1,40}$/u.test(v) ? v : undefined;
}

function idGeracaoValido(v: unknown): string | undefined {
  return typeof v === "string" && /^gen-[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined;
}

function motivoFimValido(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Za-z_]{1,32}$/.test(v) ? v : undefined;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Do corpo de erro do OpenRouter, SÓ `error.code` (inteiro) e `error.metadata.provider_name`.
 * Nunca `error.message` nem `metadata.raw`. */
function lerErroDoCorpo(corpo: unknown): Pick<DetalheFalha, "codigoErroFornecedor" | "provedorEscolhido"> {
  const erro = objeto(objeto(corpo).error);
  const code = erro.code;
  return {
    codigoErroFornecedor:
      typeof code === "number" && Number.isInteger(code) && code >= 0 && code <= 999 ? code : undefined,
    provedorEscolhido: nomeCurto(objeto(erro.metadata).provider_name),
  };
}

function ehTempo(erro: unknown): boolean {
  const nome = (erro as { name?: unknown } | null)?.name;
  return nome === "TimeoutError" || nome === "AbortError";
}

function tokensCacheDe(usage: unknown): number | undefined {
  const u = objeto(usage);
  const d = objeto(u.prompt_tokens_details);
  return (
    inteiroNaoNegativo(u.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(d.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(d.cached_tokens) ??
    inteiroNaoNegativo(u.cached_tokens)
  );
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
  let res: Response;
  try {
    res = await args.fetchImpl(`${args.ia.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.ia.chave}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(args.tempoMaximoMs ?? TEMPO_MAXIMO_MS),
    });
  } catch (erro) {
    if (ehTempo(erro)) throw new FalhaFornecedor("tempo esgotado no fornecedor", "tempo");
    throw new FalhaFornecedor("sem resposta do fornecedor (rede)", "rede");
  }
  if (!res.ok) {
    let detalhe: DetalheFalha = { statusFornecedor: res.status };
    try {
      detalhe = { ...detalhe, ...lerErroDoCorpo(await res.json()) };
    } catch {
      // Corpo de erro ilegível: fica só o status.
    }
    throw new FalhaFornecedor(`fornecedor respondeu ${res.status}`, "http", detalhe);
  }
  try {
    json = await res.json();
  } catch (erro) {
    if (ehTempo(erro)) throw new FalhaFornecedor("tempo esgotado no fornecedor", "tempo");
    throw new FalhaFornecedor("corpo inválido do fornecedor", "json");
  }

  const topo = objeto(json);
  const escolha = (topo.choices as { message?: { content?: unknown }; finish_reason?: unknown }[] | undefined)?.[0];
  const texto = escolha?.message?.content;
  const detalhe: DetalheFornecedor = {
    idGeracao: idGeracaoValido(topo.id),
    provedorEscolhido: nomeCurto(topo.provider),
    motivoFim: motivoFimValido(escolha?.finish_reason),
    tokensCache: tokensCacheDe(topo.usage),
  };
  if (typeof texto !== "string" || texto.length === 0) {
    const u = objeto(topo.usage);
    throw new FalhaFornecedor("resposta do fornecedor sem texto", "sem_texto", {
      ...detalhe,
      tokensEntrada: inteiroNaoNegativo(u.prompt_tokens),
      tokensSaida: inteiroNaoNegativo(u.completion_tokens),
    });
  }
  const usage = topo.usage;
  const custo = (usage as { cost?: unknown } | null | undefined)?.cost;
  const custoUsd = typeof custo === "number" && Number.isFinite(custo) && custo >= 0 ? custo : undefined;
  const caracteres = args.mensagens.reduce((soma, m) => soma + m.content.length, 0);
  return {
    texto,
    motivoFim: typeof escolha?.finish_reason === "string" ? escolha.finish_reason : "stop",
    custoUsd,
    detalhe,
    ...lerUso(usage, { entrada: caracteres, saida: args.maxTokens }),
  };
}

export interface ResultadoComTentativa {
  resposta: RespostaFornecedor;
  /** 1 ou 2. */
  tentativas: number;
  /** Do início da primeira tentativa ao fim da última, em ms. */
  duracaoMs: number;
}

/** Falhas que uma segunda chamada pode resolver: 429, 5xx, rede e tempo. 4xx (chave, pedido
 * inválido), JSON ilegível e resposta sem texto seriam repetidos. */
function ehTransitoria(f: FalhaFornecedor): boolean {
  if (f.motivo === "rede" || f.motivo === "tempo") return true;
  if (f.motivo !== "http") return false;
  const s = f.statusFornecedor ?? 0;
  return s === 429 || s >= 500;
}

/** `chamarFornecedor` com UMA nova tentativa se a primeira falhar de forma transitória em menos
 * de 15 s. O tempo máximo total continua o de uma chamada só (90 s): a segunda usa o que sobrou.
 * Só a resposta boa volta; quem debita é a rota, uma vez. A falha final leva `tentativas` e
 * `duracaoMs`. `relogio` (ms, monotônico) é injetável para teste. */
export async function chamarComTentativa(
  args: Parameters<typeof chamarFornecedor>[0] & { relogio?: () => number },
): Promise<ResultadoComTentativa> {
  const { relogio = () => performance.now(), ...resto } = args;
  const total = resto.tempoMaximoMs ?? TEMPO_MAXIMO_MS;
  const inicio = relogio();
  let tentativas = 0;
  for (;;) {
    tentativas++;
    try {
      const resposta = await chamarFornecedor({ ...resto, tempoMaximoMs: Math.max(1, Math.floor(total - (relogio() - inicio))) });
      return { resposta, tentativas, duracaoMs: Math.round(relogio() - inicio) };
    } catch (erro) {
      if (!(erro instanceof FalhaFornecedor)) throw erro;
      const decorrido = relogio() - inicio;
      erro.tentativas = tentativas;
      erro.duracaoMs = Math.round(decorrido);
      if (tentativas >= 2 || !ehTransitoria(erro) || decorrido >= LIMITE_PARA_NOVA_TENTATIVA_MS || decorrido >= total) {
        throw erro;
      }
    }
  }
}
