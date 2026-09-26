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

  // `ServicoContaHttp.renovar` manda `content-type: application/json` sem corpo (não há
  // nada para enviar) — o parser padrão do Fastify recusa JSON vazio com
  // FST_ERR_CTP_EMPTY_JSON_BODY (400). Corpo vazio aqui significa "nenhum campo", não erro.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_requisicao, corpo, concluido) => {
      if (typeof corpo !== "string" || corpo.length === 0) {
        concluido(null, {});
        return;
      }
      try {
        concluido(null, JSON.parse(corpo));
      } catch (erro) {
        concluido(erro as Error, undefined);
      }
    },
  );

  app.register(rotasApi, { prefix: "/v1" });

  return app;
}
