// servidor/src/rotasSessaoAtual.ts
// GET /v1/sessoes/atual (doc 18 §1, §4): consulta a sessão do Bearer SEM trocar o token.
// Serve para uma janela do app adotar o token que outra janela gravou no cofre — `renovar`
// não serve para isso, porque troca o token e derruba as outras janelas. Nunca devolve token.

import type { FastifyInstance } from "fastify";
import type { BancoSqlite } from "./banco";
import { exigirSessao, hashToken } from "./sessao";

export function registrarRotasSessaoAtual(app: FastifyInstance, banco: BancoSqlite): void {
  app.get("/sessoes/atual", { preHandler: exigirSessao }, async (request, reply) => {
    // `exigirSessao` já validou o token; a leitura repete a consulta só para pegar `expira_em`.
    const linha = banco
      .prepare(`select expira_em as expiraEm from sessoes where token_hash = ?`)
      .get(hashToken(request.tokenSessao!)) as { expiraEm: number } | undefined;
    // Saída concorrente: a linha sumiu entre o preHandler e esta leitura.
    if (!linha) return reply.code(401).send();
    const conta = request.conta!;
    return { email: conta.email, plano: conta.plano, expiraEm: linha.expiraEm };
  });
}
