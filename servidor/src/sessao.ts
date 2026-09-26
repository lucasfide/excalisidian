// servidor/src/sessao.ts
// Criação, renovação e revogação de sessões, e o preHandler "sessão obrigatória" que as
// rotas de conta usam e que a Task 5 (sincronização) reutiliza para exigir Bearer válido.
// O banco nunca guarda o token — só o SHA-256 dele (doc 18 §2).

import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { BancoSqlite } from "./banco";
import type { PlanoAssinatura } from "./tipos";

/** 30 dias, em milissegundos — mesma unidade de `Sessao.expiraEm` (epoch em ms) do app. */
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

export interface ContaAutenticada {
  id: number;
  email: string;
  plano: PlanoAssinatura;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido por `exigirSessao` quando o Bearer é válido. */
    conta?: ContaAutenticada;
    /** O token bruto do cabeçalho Authorization, preenchido junto com `conta`, para quem
     * precisa revogá-lo (ex.: `renovar`). */
    tokenSessao?: string;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function gerarToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface SessaoCriada {
  token: string;
  expiraEm: number;
}

export function criarSessao(banco: BancoSqlite, contaId: number): SessaoCriada {
  // Barato e sem cron: toda vez que a conta entra ou renova, aproveita para apagar as
  // sessões já vencidas dela mesma — nunca seriam usadas de novo (`resolverSessao` já as
  // ignora), então não há motivo para deixá-las na tabela para sempre.
  banco.prepare(`delete from sessoes where conta_id = ? and expira_em < ?`).run(contaId, Date.now());

  const token = gerarToken();
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  banco
    .prepare(`insert into sessoes (conta_id, token_hash, expira_em) values (?, ?, ?)`)
    .run(contaId, hashToken(token), expiraEm);
  return { token, expiraEm };
}

export function revogarSessaoPorToken(banco: BancoSqlite, token: string): void {
  banco.prepare(`delete from sessoes where token_hash = ?`).run(hashToken(token));
}

interface LinhaSessaoResolvida {
  contaId: number;
  email: string;
  plano: PlanoAssinatura;
}

/** Devolve a conta dono do token, ou `undefined` se o token não existe ou expirou.
 * Não apaga sessões expiradas aqui — não é responsabilidade desta consulta. */
export function resolverSessao(banco: BancoSqlite, token: string): LinhaSessaoResolvida | undefined {
  const linha = banco
    .prepare(
      `select s.conta_id as contaId, s.expira_em as expiraEm, c.email as email, c.plano as plano
       from sessoes s join contas c on c.id = s.conta_id
       where s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { contaId: number; expiraEm: number; email: string; plano: PlanoAssinatura }
    | undefined;
  if (!linha) return undefined;
  if (linha.expiraEm < Date.now()) return undefined;
  return { contaId: linha.contaId, email: linha.email, plano: linha.plano };
}

export function extrairBearer(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith("Bearer ")) return undefined;
  const token = cabecalho.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * PreHandler "sessão obrigatória": resolve a conta pelo Bearer, decora `request.conta` e
 * `request.tokenSessao`, ou responde 401 sem sessão válida. Reutilizado pela Task 5.
 */
export async function exigirSessao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extrairBearer(request);
  if (!token) {
    await reply.code(401).send();
    return;
  }
  const banco = request.server.banco;
  const linha = resolverSessao(banco, token);
  if (!linha) {
    await reply.code(401).send();
    return;
  }
  request.conta = { id: linha.contaId, email: linha.email, plano: linha.plano };
  request.tokenSessao = token;
}

/**
 * PreHandler "plano premium obrigatório" (doc 18 §3, Task 5): roda depois de `exigirSessao`
 * (precisa de `request.conta` já preenchido) e responde 403 se a conta não é premium. As
 * rotas de sincronização usam `preHandler: [exigirSessao, exigirPremium]`, nessa ordem — sem
 * sessão é 401, com sessão mas sem o plano é 403 (doc 17 §9.1).
 */
export async function exigirPremium(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.conta!.plano !== "premium") {
    await reply.code(403).send();
  }
}
