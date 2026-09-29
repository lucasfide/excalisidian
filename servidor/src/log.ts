// servidor/src/log.ts
// Log por requisição (doc 18 §3): método, rota SEM parâmetros, status e duração. Nunca
// corpo, cabeçalho ou query — por isso a rota vem de `routeOptions.url` (o padrão
// registrado, ex.: "/vaults/:id") e não da URL real da requisição, que poderia trazer
// parâmetros, query string ou (por engano de quem lê o log) dados sensíveis.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const CHAVE_INICIO = Symbol("inicioEm");

interface RequisicaoComInicio extends FastifyRequest {
  [CHAVE_INICIO]?: bigint;
}

export interface LinhaDeLog {
  metodo: string;
  rota: string;
  status: number;
  duracaoMs: number;
}

export function registrarLog(app: FastifyInstance): void {
  app.addHook("onRequest", async (requisicao: RequisicaoComInicio) => {
    requisicao[CHAVE_INICIO] = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (requisicao: RequisicaoComInicio, resposta: FastifyReply) => {
    const inicioEm = requisicao[CHAVE_INICIO];
    const duracaoMs = inicioEm ? Number(process.hrtime.bigint() - inicioEm) / 1_000_000 : 0;
    const rota = requisicao.routeOptions?.url ?? requisicao.raw.url?.split("?")[0] ?? "desconhecida";

    const linha: LinhaDeLog = {
      metodo: requisicao.method,
      rota,
      status: resposta.statusCode,
      duracaoMs: Math.round(duracaoMs * 100) / 100,
    };

    // eslint-disable-next-line no-console -- este é o próprio mecanismo de log do servidor.
    console.log(JSON.stringify(linha));
  });
}

/** Registro de um pedido de IA (doc 18 §3): uma linha JSON a mais, além da linha da requisição.
 * Só números, nomes de modelo lógico/provedor e códigos — nunca e-mail, id de conta, token,
 * chave nem texto de mensagem ou de erro do fornecedor. */
export interface RegistroIa {
  evento: "ia";
  modelo: string;
  resultado: "ok" | "falha";
  motivo?: "http" | "tempo" | "rede" | "json" | "sem_texto";
  statusFornecedor?: number;
  codigoErroFornecedor?: number;
  provedorEscolhido?: string;
  idGeracao?: string;
  motivoFim?: string;
  tokensEntrada?: number;
  tokensSaida?: number;
  tokensCache?: number;
  custoMicroUsd?: number;
  duracaoFornecedorMs: number;
  tentativas: number;
}

const CAMPOS_REGISTRO_IA: ReadonlyArray<keyof RegistroIa> = [
  "evento", "modelo", "resultado", "motivo", "statusFornecedor", "codigoErroFornecedor",
  "provedorEscolhido", "idGeracao", "motivoFim", "tokensEntrada", "tokensSaida", "tokensCache",
  "custoMicroUsd", "duracaoFornecedorMs", "tentativas",
];

export function registrarEventoIa(registro: RegistroIa): void {
  // Lista fechada de campos: o que não estiver aqui nunca sai, mesmo que alguém passe a mais.
  const linha: Record<string, unknown> = {};
  for (const campo of CAMPOS_REGISTRO_IA) {
    if (registro[campo] !== undefined) linha[campo] = registro[campo];
  }
  // eslint-disable-next-line no-console -- este é o próprio mecanismo de log do servidor.
  console.log(JSON.stringify(linha));
}
