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
