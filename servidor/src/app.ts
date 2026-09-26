// servidor/src/app.ts
// Fábrica do Fastify: monta a instância com banco, log e rotas, mas NUNCA chama `listen` —
// isso é responsabilidade de src/principal.ts. Os testes usam `app.inject`, que não precisa
// de porta nenhuma.

import Fastify, { type FastifyInstance } from "fastify";
import { abrirBanco, type BancoSqlite } from "./banco";
import type { Config } from "./config";
import { registrarLog } from "./log";
import { rotasApi } from "./rotas";

declare module "fastify" {
  interface FastifyInstance {
    banco: BancoSqlite;
  }
}

export function criarApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: false });

  const banco = abrirBanco(config.pastaDados);
  app.decorate("banco", banco);
  app.addHook("onClose", (_instancia, concluido) => {
    banco.close();
    concluido();
  });

  registrarLog(app);

  app.register(rotasApi, { prefix: "/v1" });

  return app;
}
