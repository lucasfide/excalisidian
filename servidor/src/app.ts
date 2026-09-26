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
  // Na VPS o servidor escuta só em 127.0.0.1 (doc 18 §2) e toda requisição chega pelo
  // Caddy — sem isto, `request.ip` seria sempre 127.0.0.1 e o limite de tentativas por IP
  // (doc 18 §3) contaria todo mundo junto. `trustProxy: "127.0.0.1"` confia SÓ em quem
  // conecta desse endereço para ler `X-Forwarded-For`; uma conexão de qualquer outro
  // endereço (alguém que não passou pelo Caddy) não consegue forjar o próprio IP por esse
  // cabeçalho — `request.ip` continua sendo o endereço real de quem conectou.
  const app = Fastify({ logger: false, trustProxy: "127.0.0.1" });

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
