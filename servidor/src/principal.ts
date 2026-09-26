// servidor/src/principal.ts
// Ponto de entrada de produção: sobe o Fastify de verdade em 127.0.0.1, na porta da
// configuração. Nunca importado pelos testes (que usam criarApp + inject).

import { criarApp } from "./app";
import { carregarConfig } from "./config";

const config = carregarConfig();
const app = criarApp(config);

app.listen({ port: config.porta, host: "127.0.0.1" }, (erro, endereco) => {
  if (erro) {
    app.log.error(erro);
    console.error(erro);
    process.exit(1);
  }
  console.log(`servidor escutando em ${endereco}`);
});
