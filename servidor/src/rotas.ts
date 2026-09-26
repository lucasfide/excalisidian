// servidor/src/rotas.ts
// Plugin Fastify com todas as rotas da API, registrado em app.ts sob o prefixo "/v1" — o
// mesmo que `BASE_URL_SERVICO` (src/servico/base.ts, na raiz) já embute
// ("https://api.excalisidian.com/v1"). As rotas de conta (Task 4) ficam aqui; as de
// sincronização (Task 5) entram no mesmo plugin, para ficarem sob o prefixo automaticamente.
//
// `ETIQUETA_KDF` e `normalizarEmail` vêm do app por caminho relativo (não há Tauri nem DOM
// nesse arquivo — só Argon2id via hash-wasm e HKDF/SHA-256 via @noble/hashes, que rodam em
// Node puro); mudar a etiqueta aqui sem mudar lá quebraria o contrato de todas as contas.
import { ETIQUETA_KDF, normalizarEmail } from "../../src/conta/derivacaoSenha";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { LimiteDeTentativas } from "./limiteDeTentativas";
import { gastarTempoDeEmailInexistente, gerarSal, provaConfere, derivarHashDaProva } from "./prova";
import { criarSessao, exigirSessao, extrairBearer, revogarSessaoPorToken } from "./sessao";
import type { SessaoResposta } from "./tipos";

interface CorpoContaOuSessao {
  email: string;
  provaDeIdentidade: string;
  kdf: string;
}

const SCHEMA_CORPO_CONTA_OU_SESSAO = {
  type: "object",
  additionalProperties: false,
  required: ["email", "provaDeIdentidade", "kdf"],
  properties: {
    email: { type: "string", minLength: 3, pattern: "^[^\\s@]+@[^\\s@]+$" },
    provaDeIdentidade: { type: "string", minLength: 1 },
    kdf: { type: "string", minLength: 1 },
  },
} as const;

interface LinhaConta {
  id: number;
  email: string;
  sal: Buffer;
  hash: Buffer;
  plano: "gratis" | "premium";
}

function sessaoResposta(email: string, plano: "gratis" | "premium", token: string, expiraEm: number): SessaoResposta {
  return { token, email, plano, expiraEm };
}

/** Decodifica a prova em base64; `undefined` se não são exatamente 32 bytes (contrato de
 * `derivacaoSenha.ts`: HKDF-SHA256 de 32 bytes). */
function decodificarProva(provaBase64: string): Buffer | undefined {
  const bytes = Buffer.from(provaBase64, "base64");
  return bytes.length === 32 ? bytes : undefined;
}

export async function rotasApi(app: FastifyInstance): Promise<void> {
  app.get("/saude", async () => ({ ok: true }));

  const banco = app.banco;
  const limiteEntrada = new LimiteDeTentativas();
  const limiteCriacao = new LimiteDeTentativas();

  function dentroDoLimite(limite: LimiteDeTentativas, request: FastifyRequest, email: string): boolean {
    const okIp = limite.registrar(`ip:${request.ip}`);
    const okEmail = limite.registrar(`email:${email}`);
    return okIp && okEmail;
  }

  app.post<{ Body: CorpoContaOuSessao }>(
    "/contas",
    { schema: { body: SCHEMA_CORPO_CONTA_OU_SESSAO } },
    async (request, reply) => {
      const { email, provaDeIdentidade, kdf } = request.body;
      if (kdf !== ETIQUETA_KDF) return reply.code(400).send();

      const provaBytes = decodificarProva(provaDeIdentidade);
      if (!provaBytes) return reply.code(400).send();

      const emailNormalizado = normalizarEmail(email);

      if (!dentroDoLimite(limiteCriacao, request, emailNormalizado)) return reply.code(429).send();

      const sal = gerarSal();
      const hash = await derivarHashDaProva(provaBytes, sal);
      const criadaEm = Date.now();

      let contaId: number;
      try {
        const resultado = banco
          .prepare(
            `insert into contas (email, sal, hash, plano, criada_em) values (?, ?, ?, 'gratis', ?)`,
          )
          .run(emailNormalizado, sal, hash, criadaEm);
        contaId = Number(resultado.lastInsertRowid);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        if (mensagem.includes("UNIQUE")) return reply.code(409).send();
        throw erro;
      }

      const sessao = criarSessao(banco, contaId);
      return reply.code(200).send(sessaoResposta(emailNormalizado, "gratis", sessao.token, sessao.expiraEm));
    },
  );

  app.post<{ Body: CorpoContaOuSessao }>(
    "/sessoes",
    { schema: { body: SCHEMA_CORPO_CONTA_OU_SESSAO } },
    async (request, reply) => {
      const { email, provaDeIdentidade, kdf } = request.body;
      if (kdf !== ETIQUETA_KDF) return reply.code(400).send();

      const provaBytes = decodificarProva(provaDeIdentidade);
      if (!provaBytes) return reply.code(400).send();

      const emailNormalizado = normalizarEmail(email);

      if (!dentroDoLimite(limiteEntrada, request, emailNormalizado)) return reply.code(429).send();

      const conta = banco
        .prepare(`select id, email, sal, hash, plano from contas where email = ?`)
        .get(emailNormalizado) as LinhaConta | undefined;

      if (!conta) {
        // Mesmo 401 de credenciais erradas, gastando um tempo parecido — doc 18 §3: não
        // revela por resposta (nem por tempo) se o e-mail tem conta.
        await gastarTempoDeEmailInexistente(provaBytes);
        return reply.code(401).send();
      }

      const confere = await provaConfere(provaBytes, conta.sal, conta.hash);
      if (!confere) return reply.code(401).send();

      const sessao = criarSessao(banco, conta.id);
      return reply.code(200).send(sessaoResposta(conta.email, conta.plano, sessao.token, sessao.expiraEm));
    },
  );

  app.post(
    "/sessoes/renovar",
    { preHandler: exigirSessao },
    async (request, reply) => {
      // `exigirSessao` já respondeu 401 e retornou se o Bearer não é válido — aqui
      // `request.conta`/`request.tokenSessao` sempre existem.
      const conta = request.conta!;
      const tokenAntigo = request.tokenSessao!;

      revogarSessaoPorToken(banco, tokenAntigo);
      const sessao = criarSessao(banco, conta.id);
      return reply.code(200).send(sessaoResposta(conta.email, conta.plano, sessao.token, sessao.expiraEm));
    },
  );

  app.delete("/sessoes", async (request, reply) => {
    // Sair é idempotente (doc 18 §2): sem Bearer, ou com um token que já não existe (já
    // saiu antes), a resposta é a mesma — nunca um erro pelo fato de já estar fora.
    const token = extrairBearer(request);
    if (token) revogarSessaoPorToken(banco, token);
    return reply.code(204).send();
  });
}
