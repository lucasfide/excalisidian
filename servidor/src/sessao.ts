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

/** Janela de graça de `renovar` (plano "sincronização mais simples", Task 1): várias janelas
 * do app chamam `renovar` com o mesmo token ao reabrir (uma delas ganha, as outras chegam
 * depois). Um token já substituído dentro desses 120 s ainda devolve 200 com a MESMA sessão
 * nova — idempotente; depois disso, ou se a sessão nova já foi ela mesma substituída
 * (encerrada), 401. */
const JANELA_RENOVACAO_MS = 120 * 1000;

/** Cache em memória, por banco, do token novo em texto durante a janela de graça — NUNCA vai
 * para o SQLite (só o hash de sempre). Chave: id da sessão nova. `WeakMap` por instância de
 * `BancoSqlite` evita vazar entre testes, que abrem um banco novo a cada caso. */
const CACHE_TOKEN_NOVO = new WeakMap<BancoSqlite, Map<number, { token: string; expiraEm: number }>>();

function cacheDoBanco(banco: BancoSqlite): Map<number, { token: string; expiraEm: number }> {
  let cache = CACHE_TOKEN_NOVO.get(banco);
  if (!cache) {
    cache = new Map();
    CACHE_TOKEN_NOVO.set(banco, cache);
  }
  return cache;
}

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

/** Igual a `SessaoCriada`, com o `id` interno da linha — usado só por `renovarSessao` para
 * marcar a sessão antiga como substituída por esta e indexar o cache do token novo; nunca
 * exposto na resposta HTTP (que usa `SessaoCriada`/`SessaoResposta`, sem `id`). */
interface SessaoCriadaComId extends SessaoCriada {
  id: number;
}

function criarSessaoComId(banco: BancoSqlite, contaId: number, agora: number): SessaoCriadaComId {
  // Barato e sem cron: toda vez que a conta entra ou renova, aproveita para apagar as
  // sessões já vencidas dela mesma — nunca seriam usadas de novo (`resolverSessao` já as
  // ignora), então não há motivo para deixá-las na tabela para sempre. Também apaga sessões
  // substituídas há mais de 120 s (a janela de graça de `renovar` já passou — ver
  // `renovarSessao`), mesmo que `expira_em` ainda esteja longe no futuro.
  banco
    .prepare(
      `delete from sessoes where conta_id = ? and (expira_em < ? or (substituida_em is not null and substituida_em < ?))`,
    )
    .run(contaId, agora, agora - JANELA_RENOVACAO_MS);

  const token = gerarToken();
  const expiraEm = agora + DURACAO_SESSAO_MS;
  const resultado = banco
    .prepare(`insert into sessoes (conta_id, token_hash, expira_em) values (?, ?, ?)`)
    .run(contaId, hashToken(token), expiraEm);
  return { token, expiraEm, id: Number(resultado.lastInsertRowid) };
}

export function criarSessao(banco: BancoSqlite, contaId: number, agora: number = Date.now()): SessaoCriada {
  const { token, expiraEm } = criarSessaoComId(banco, contaId, agora);
  return { token, expiraEm };
}

/** Apaga a sessão do token e as que ela substituiu (`sair` encerra a cadeia inteira — doc 18,
 * Task 1) — nunca só a ponta mais recente, senão um token antigo ainda dentro da janela de
 * graça continuaria autenticando `renovar`. Limpa também o cache do token novo em memória. */
export function revogarSessaoPorToken(banco: BancoSqlite, token: string): void {
  const linha = banco.prepare(`select id from sessoes where token_hash = ?`).get(hashToken(token)) as
    | { id: number }
    | undefined;
  if (!linha) return;

  const cadeia = banco
    .prepare(
      `with recursive cadeia(id) as (
         select id from sessoes where id = ?
         union all
         select s.id from sessoes s join cadeia c on s.substituida_por = c.id
       )
       select id from cadeia`,
    )
    .all(linha.id) as { id: number }[];
  const ids = cadeia.map((l) => l.id);

  const cache = cacheDoBanco(banco);
  for (const id of ids) cache.delete(id);

  const marcadores = ids.map(() => "?").join(",");
  banco.prepare(`delete from sessoes where id in (${marcadores})`).run(...ids);
}

interface LinhaSessaoResolvida {
  contaId: number;
  email: string;
  plano: PlanoAssinatura;
}

/** Devolve a conta dono do token, ou `undefined` se o token não existe, expirou, ou já foi
 * substituído por uma renovação (só `renovarSessao` trata um token substituído como ainda
 * válido, e só dentro da janela de graça — para todo o resto da API, substituído já não
 * autentica). Não apaga sessões expiradas aqui — não é responsabilidade desta consulta. */
export function resolverSessao(
  banco: BancoSqlite,
  token: string,
  agora: number = Date.now(),
): LinhaSessaoResolvida | undefined {
  const linha = banco
    .prepare(
      `select s.conta_id as contaId, s.expira_em as expiraEm, s.substituida_por as substituidaPor,
              c.email as email, c.plano as plano
       from sessoes s join contas c on c.id = s.conta_id
       where s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { contaId: number; expiraEm: number; substituidaPor: number | null; email: string; plano: PlanoAssinatura }
    | undefined;
  if (!linha) return undefined;
  if (linha.substituidaPor != null) return undefined;
  if (linha.expiraEm < agora) return undefined;
  return { contaId: linha.contaId, email: linha.email, plano: linha.plano };
}

export interface ResultadoRenovar {
  token: string;
  email: string;
  plano: PlanoAssinatura;
  expiraEm: number;
}

interface LinhaSessaoParaRenovar {
  id: number;
  contaId: number;
  expiraEm: number;
  substituidaPor: number | null;
  substituidaEm: number | null;
  email: string;
  plano: PlanoAssinatura;
}

/**
 * `renovar` tolerante a chamadas simultâneas com o mesmo token (plano "sincronização mais
 * simples", Task 1 — várias janelas/efeitos do app renovam ao reabrir; a primeira ganha, as
 * outras não podem cair em 401). Função síncrona de propósito, sem `await` no meio: dentro de
 * um processo Node, isso garante que duas chamadas concorrentes (`Promise.all`) nunca
 * intercalam entre ler e escrever o estado da sessão — a primeira a rodar processa a
 * renovação inteira antes da próxima começar.
 *
 * - Token normal (não substituído, não vencido): cria a sessão nova, marca a antiga como
 *   substituída por ela, guarda o token novo em memória (nunca no banco) para servir repetições
 *   dentro da janela, e devolve a sessão nova.
 * - Token já substituído, dentro de 120 s, e a sessão nova ainda não foi ela mesma substituída
 *   (encerrada): devolve de novo a MESMA sessão nova.
 * - Qualquer outro caso (token inexistente, vencido, substituído há mais de 120 s, ou cuja
 *   sessão nova já foi encerrada) — `undefined`, que a rota traduz em 401.
 */
export function renovarSessao(banco: BancoSqlite, tokenAntigo: string, agora: number = Date.now()): ResultadoRenovar | undefined {
  const linha = banco
    .prepare(
      `select s.id as id, s.conta_id as contaId, s.expira_em as expiraEm,
              s.substituida_por as substituidaPor, s.substituida_em as substituidaEm,
              c.email as email, c.plano as plano
       from sessoes s join contas c on c.id = s.conta_id
       where s.token_hash = ?`,
    )
    .get(hashToken(tokenAntigo)) as LinhaSessaoParaRenovar | undefined;
  if (!linha) return undefined;

  if (linha.substituidaPor != null) {
    if (linha.substituidaEm == null || agora - linha.substituidaEm > JANELA_RENOVACAO_MS) return undefined;

    const nova = banco
      .prepare(`select id, substituida_por as substituidaPor from sessoes where id = ?`)
      .get(linha.substituidaPor) as { id: number; substituidaPor: number | null } | undefined;
    if (!nova) return undefined; // sessão nova já não existe (limpeza já passou por aqui)
    if (nova.substituidaPor != null) return undefined; // sessão nova já foi ela mesma encerrada

    const emCache = cacheDoBanco(banco).get(nova.id);
    if (!emCache) return undefined; // defensivo: dentro da janela isto sempre deveria existir

    return { token: emCache.token, email: linha.email, plano: linha.plano, expiraEm: emCache.expiraEm };
  }

  if (linha.expiraEm < agora) return undefined;

  const sessaoNova = criarSessaoComId(banco, linha.contaId, agora);
  banco.prepare(`update sessoes set substituida_por = ?, substituida_em = ? where id = ?`).run(sessaoNova.id, agora, linha.id);
  cacheDoBanco(banco).set(sessaoNova.id, { token: sessaoNova.token, expiraEm: sessaoNova.expiraEm });

  return { token: sessaoNova.token, email: linha.email, plano: linha.plano, expiraEm: sessaoNova.expiraEm };
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
