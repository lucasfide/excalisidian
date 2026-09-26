// servidor/src/apoioTestes/fetchPorInject.ts
// Adaptador que implementa a assinatura de `fetch` usando `app.inject` — a prova da
// verdade dos testes de conta é rodar o `ServicoContaHttp` de verdade (o mesmo do app)
// contra o servidor em processo, sem porta nem rede real. Repassa método, cabeçalhos e
// corpo, e devolve um `Response` de verdade (do runtime, não um dublê).

import type { FastifyInstance } from "fastify";

function cabecalhosParaObjeto(init: RequestInit | undefined): Record<string, string> {
  const objeto: Record<string, string> = {};
  if (!init?.headers) return objeto;
  const cabecalhos = new Headers(init.headers as ConstructorParameters<typeof Headers>[0]);
  cabecalhos.forEach((valor, chave) => {
    objeto[chave] = valor;
  });
  return objeto;
}

export function fetchPorInject(app: FastifyInstance): typeof fetch {
  return (async (entrada: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `inject` tipa `method`
    // com o union de HTTPMethods do Fastify; aqui ele vem de `RequestInit`, string comum.
    const resposta = await app.inject({
      method: metodo as any,
      url: url.pathname + url.search,
      headers: cabecalhosParaObjeto(init),
      payload: init?.body as string | undefined,
    });

    const cabecalhosResposta = new Headers();
    for (const [chave, valor] of Object.entries(resposta.headers)) {
      if (valor === undefined) continue;
      if (Array.isArray(valor)) {
        for (const item of valor) cabecalhosResposta.append(chave, String(item));
      } else {
        cabecalhosResposta.set(chave, String(valor));
      }
    }

    // Respostas 204/205/304 não podem ter corpo no construtor de `Response`.
    const semCorpo = [204, 205, 304].includes(resposta.statusCode);

    return new Response(semCorpo ? null : resposta.rawPayload, {
      status: resposta.statusCode,
      headers: cabecalhosResposta,
    });
  }) as typeof fetch;
}
