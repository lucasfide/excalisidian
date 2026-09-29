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

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LimiteDeTentativas } from "./limiteDeTentativas";
import { gastarTempoDeEmailInexistente, gerarSal, provaConfere, derivarHashDaProva } from "./prova";
import { criarSessao, exigirPremium, exigirSessao, extrairBearer, renovarSessao, revogarSessaoPorToken } from "./sessao";
import type { SessaoResposta } from "./tipos";
import { ArmazenamentoSqlite, bytesUsadosPelaConta, COTA_BYTES_POR_CONTA, TAMANHO_MAXIMO_PACOTE } from "./armazenamentoSync";

// `NucleoServidorSync`/`FalhaSync` vêm do app por caminho relativo (mesmo padrão de
// `ETIQUETA_KDF`/`normalizarEmail` acima): as regras do diário (sequência, "fora-de-ordem", a
// regra do retrato, "ja-existe") moram num lugar só (src/sync/nucleoServidorSync.ts) e o
// servidor real reaproveita — não reimplementa nada disso, só o armazenamento (SQLite +
// arquivo) e a fronteira HTTP (doc 17 §9.1).
import { NucleoServidorSync } from "../../src/sync/nucleoServidorSync";
import { FalhaSync } from "../../src/sync/tiposServidor";

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

export async function rotasApi(
  app: FastifyInstance,
  opcoes: { pastaDados: string; agora?: () => number },
): Promise<void> {
  app.get("/saude", async () => ({ ok: true }));

  const banco = app.banco;
  const { pastaDados } = opcoes;
  // Injetável só pelos testes (Task 1, janela de graça de `renovar` de 120 s) — em produção
  // é sempre o relógio de verdade.
  const agora = opcoes.agora ?? (() => Date.now());
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
      const criadaEm = agora();

      let contaId: number;
      try {
        const resultado = banco
          .prepare(
            `insert into contas (email, sal, hash, plano, criada_em) values (?, ?, ?, 'gratis', ?)`,
          )
          .run(emailNormalizado, sal, hash, criadaEm);
        contaId = Number(resultado.lastInsertRowid);
      } catch (erro) {
        // `better-sqlite3` expõe o código da violação em `.code` (confirmado localmente:
        // "SQLITE_CONSTRAINT_UNIQUE") — mais confiável do que checar a mensagem, que é
        // texto livre e pode mudar entre versões da lib do SQLite.
        if ((erro as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
          return reply.code(409).send();
        }
        throw erro;
      }

      const sessao = criarSessao(banco, contaId, agora());
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

      const sessao = criarSessao(banco, conta.id, agora());
      return reply.code(200).send(sessaoResposta(conta.email, conta.plano, sessao.token, sessao.expiraEm));
    },
  );

  app.post("/sessoes/renovar", async (request, reply) => {
    // Sem `exigirSessao` aqui de propósito: um token já substituído por uma renovação
    // anterior (dentro da janela de graça de 120 s) não é mais uma sessão "válida" para o
    // resto da API, mas ainda deve poder repetir `renovar` e receber a MESMA sessão nova —
    // `renovarSessao` sabe distinguir os dois casos; `exigirSessao` não.
    const token = extrairBearer(request);
    if (!token) return reply.code(401).send();

    const resultado = renovarSessao(banco, token, agora());
    if (!resultado) return reply.code(401).send();

    return reply.code(200).send(sessaoResposta(resultado.email, resultado.plano, resultado.token, resultado.expiraEm));
  });

  app.delete("/sessoes", async (request, reply) => {
    // Sair é idempotente (doc 18 §2): sem Bearer, ou com um token que já não existe (já
    // saiu antes), a resposta é a mesma — nunca um erro pelo fato de já estar fora.
    const token = extrairBearer(request);
    if (token) revogarSessaoPorToken(banco, token);
    return reply.code(204).send();
  });

  // --- Sincronização (doc 17 §9.1, Task 5) --------------------------------------------------
  //
  // Toda rota exige sessão (401 sem Bearer válido) E plano premium (403 numa conta grátis —
  // doc 18 §3). O armazenamento (`ArmazenamentoSqlite`) é criado por chamada, sempre escopado
  // à conta autenticada — é isso que faz um vault de outra conta simplesmente não existir para
  // quem pergunta (404, via FalhaSync("nao-encontrado") do núcleo). As regras do diário
  // (sequência, "fora-de-ordem", a regra do retrato, "ja-existe") nunca são reimplementadas
  // aqui — vêm todas de NucleoServidorSync.

  registrarRotasSync(app, banco, pastaDados);
}

function decodificarBase64(valor: string): Uint8Array {
  return new Uint8Array(Buffer.from(valor, "base64"));
}

/** Traduz uma `FalhaSync` do núcleo para a resposta HTTP do doc 17 §9.1. Qualquer outro erro
 * (não deveria acontecer — o núcleo só lança estes três códigos) sobe e vira 500, sem mascarar
 * um defeito real. */
function tratarFalhaSync(erro: unknown, reply: FastifyReply): FastifyReply {
  if (erro instanceof FalhaSync) {
    if (erro.codigo === "nao-encontrado") return reply.code(404).send();
    if (erro.codigo === "fora-de-ordem") return reply.code(409).send({ codigo: "fora-de-ordem" });
    if (erro.codigo === "ja-existe") return reply.code(409).send({ codigo: "ja-existe" });
    if (erro.codigo === "espaco") return reply.code(507).send();
  }
  throw erro;
}

const PADRAO_ID_VAULT = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const SCHEMA_CRIAR_VAULT = {
  type: "object",
  additionalProperties: false,
  required: ["id", "nomeCifrado", "envelope"],
  properties: {
    id: { type: "string", pattern: PADRAO_ID_VAULT },
    nomeCifrado: { type: "string", minLength: 1 },
    envelope: { type: "string", minLength: 1 },
  },
} as const;

const SCHEMA_PARAMETROS_VAULT = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", pattern: PADRAO_ID_VAULT },
  },
} as const;

const SCHEMA_ENVIAR_LOTE = {
  type: "object",
  additionalProperties: false,
  required: ["esperoUltima", "bytes"],
  properties: {
    esperoUltima: { type: "integer", minimum: 0 },
    bytes: { type: "string", minLength: 1 },
  },
} as const;

const SCHEMA_ENVIAR_RETRATO = {
  type: "object",
  additionalProperties: false,
  required: ["ateSequencia", "partes"],
  properties: {
    ateSequencia: { type: "integer", minimum: 1 },
    partes: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
  },
} as const;

/** `base64Len(n)` = tamanho de `n` bytes crus codificados em base64. `TAMANHO_MAXIMO_PACOTE`
 * já inclui a folga de 28 bytes do envelope — aqui só se soma a folga do JSON em volta (chaves,
 * aspas, o número de `esperoUltima`). */
function tamanhoBase64(bytesCrus: number): number {
  return Math.ceil(bytesCrus / 3) * 4;
}

const FOLGA_CORPO_JSON = 4096;
/** `bodyLimit` da rota de lote: generoso o bastante pra qualquer lote dentro do limite
 * declarado (doc 18 §3) passar pelo parser; o handler ainda confere o tamanho exato do
 * conteúdo DECODIFICADO contra `TAMANHO_MAXIMO_PACOTE` — é essa checagem, não o `bodyLimit`
 * do Fastify, que decide o 413 na fronteira exata. */
const BODY_LIMIT_LOTE = tamanhoBase64(TAMANHO_MAXIMO_PACOTE) + FOLGA_CORPO_JSON;
/** Retrato pode ter várias partes num corpo só — `bodyLimit` proporcionalmente maior (mesma
 * lógica: só limita abuso grosseiro, o 413 exato vem da checagem por parte no handler). */
const BODY_LIMIT_RETRATO = BODY_LIMIT_LOTE * 16;

function registrarRotasSync(app: FastifyInstance, banco: FastifyInstance["banco"], pastaDados: string): void {
  const preHandlerSync = [exigirSessao, exigirPremium];

  app.get("/sync/vaults", { preHandler: preHandlerSync }, async (request, reply) => {
    const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, request.conta!.id));
    const vaults = await nucleo.listarVaults();
    return reply.code(200).send(
      vaults.map((v) => ({
        id: v.id,
        nomeCifrado: Buffer.from(v.nomeCifrado).toString("base64"),
        envelope: Buffer.from(v.envelope).toString("base64"),
      })),
    );
  });

  app.post<{ Body: { id: string; nomeCifrado: string; envelope: string } }>(
    "/sync/vaults",
    { preHandler: preHandlerSync, schema: { body: SCHEMA_CRIAR_VAULT } },
    async (request, reply) => {
      const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, request.conta!.id));
      try {
        await nucleo.criarVault(
          request.body.id,
          decodificarBase64(request.body.nomeCifrado),
          decodificarBase64(request.body.envelope),
        );
      } catch (erro) {
        return tratarFalhaSync(erro, reply);
      }
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string }; Querystring: { apos?: string } }>(
    "/sync/vaults/:id/pacotes",
    { preHandler: preHandlerSync, schema: { params: SCHEMA_PARAMETROS_VAULT } },
    async (request, reply) => {
      const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, request.conta!.id));
      const apos = Number(request.query.apos ?? 0);
      try {
        const resultado = await nucleo.baixar(request.params.id, Number.isFinite(apos) ? apos : 0);
        return reply.code(200).send({
          retrato: resultado.retrato
            ? {
                ateSequencia: resultado.retrato.ateSequencia,
                partes: resultado.retrato.partes.map((p) => Buffer.from(p).toString("base64")),
              }
            : undefined,
          lotes: resultado.lotes.map((l) => ({
            sequencia: l.sequencia,
            bytes: Buffer.from(l.bytes).toString("base64"),
          })),
          ultimoRetrato: resultado.ultimoRetrato,
        });
      } catch (erro) {
        return tratarFalhaSync(erro, reply);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { esperoUltima: number; bytes: string } }>(
    "/sync/vaults/:id/lotes",
    { preHandler: preHandlerSync, schema: { params: SCHEMA_PARAMETROS_VAULT, body: SCHEMA_ENVIAR_LOTE }, bodyLimit: BODY_LIMIT_LOTE },
    async (request, reply) => {
      const contaId = request.conta!.id;
      const bytes = decodificarBase64(request.body.bytes);
      if (bytes.length > TAMANHO_MAXIMO_PACOTE) return reply.code(413).send();

      const usados = bytesUsadosPelaConta(banco, contaId);
      if (usados + bytes.length > COTA_BYTES_POR_CONTA) return reply.code(507).send();

      const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, contaId));
      try {
        const sequencia = await nucleo.enviarLote(request.params.id, request.body.esperoUltima, bytes);
        return reply.code(200).send({ sequencia });
      } catch (erro) {
        return tratarFalhaSync(erro, reply);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { ateSequencia: number; partes: string[] } }>(
    "/sync/vaults/:id/retratos",
    { preHandler: preHandlerSync, schema: { params: SCHEMA_PARAMETROS_VAULT, body: SCHEMA_ENVIAR_RETRATO }, bodyLimit: BODY_LIMIT_RETRATO },
    async (request, reply) => {
      const contaId = request.conta!.id;
      const partes = request.body.partes.map(decodificarBase64);
      if (partes.some((p) => p.length > TAMANHO_MAXIMO_PACOTE)) return reply.code(413).send();

      const totalNovo = partes.reduce((soma, p) => soma + p.length, 0);
      const usados = bytesUsadosPelaConta(banco, contaId);
      // Conservador: confere contra o total ATUAL, antes de descontar os lotes que este
      // retrato vai cobrir (o núcleo só os descarta depois de aceitar) — no pior caso recusa
      // um retrato que na prática liberaria espaço, mas nunca deixa a conta passar da cota
      // mesmo no instante em que o retrato novo e os lotes antigos ainda coexistem.
      if (usados + totalNovo > COTA_BYTES_POR_CONTA) return reply.code(507).send();

      const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, contaId));
      try {
        await nucleo.enviarRetrato(request.params.id, request.body.ateSequencia, partes);
      } catch (erro) {
        return tratarFalhaSync(erro, reply);
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/sync/vaults/:id",
    { preHandler: preHandlerSync, schema: { params: SCHEMA_PARAMETROS_VAULT } },
    async (request, reply) => {
      const nucleo = new NucleoServidorSync(new ArmazenamentoSqlite(banco, pastaDados, request.conta!.id));
      await nucleo.apagarVault(request.params.id);
      return reply.code(204).send();
    },
  );
}
