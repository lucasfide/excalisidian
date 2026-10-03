// servidor/src/principal.ts
// Ponto de entrada de produção: sobe o Fastify de verdade em 127.0.0.1, na porta da
// configuração. Nunca importado pelos testes (que usam criarApp + inject).

import { criarApp } from "./app";
import { carregarConfig } from "./config";
import { agendarLimpezaDeRegistrosAcesso } from "./registrosAcesso";

const config = carregarConfig();
const app = criarApp(config);

// Registros de acesso (Marco Civil, ADR-46): apaga os de mais de 183 dias ao subir e a cada 24 h.
agendarLimpezaDeRegistrosAcesso(app.banco);

app.listen({ port: config.porta, host: "127.0.0.1" }, (erro, endereco) => {
  if (erro) {
    app.log.error(erro);
    console.error(erro);
    process.exit(1);
  }
  console.log(`servidor escutando em ${endereco}`);
});
