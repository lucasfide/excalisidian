// servidor/src/rotas.ts
// Plugin Fastify com todas as rotas da API, registrado em app.ts sob o prefixo "/v1" — o
// mesmo que `BASE_URL_SERVICO` (src/servico/base.ts, na raiz) já embute
// ("https://api.excalisidian.com/v1"). As rotas de conta (Task 4) e sincronização (Task 5)
// entram aqui, dentro deste mesmo plugin, para ficarem sob o prefixo automaticamente.

import type { FastifyInstance } from "fastify";

export async function rotasApi(app: FastifyInstance): Promise<void> {
  app.get("/saude", async () => ({ ok: true }));
}
