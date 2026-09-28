// servidor/src/rotasIa.ts
// As duas rotas da IA do Excalisidian (doc 18 §5.1), registradas em app.ts sob /v1, como
// plugin próprio. A ordem das verificações é a do doc: tamanho e formato do corpo
// (Fastify, antes do código da rota), sessão, plano, modelo, limite por minuto, créditos,
// chave do fornecedor, fornecedor. Só se debita depois de uma resposta boa do fornecedor.
//
// O texto das mensagens atravessa esta rota e vai ao fornecedor; nunca é guardado nem logado
// (o log de log.ts só vê método, rota, status e duração).

import type { FastifyInstance } from "fastify";

import type { BancoSqlite } from "./banco";
import type { ConfigIa } from "./config";
import { debitar, saldoDaConta } from "./creditosIa";
import { chamarFornecedor, ehModeloLogico, FalhaFornecedor, tetoDeSaida, type MensagemIa } from "./fornecedorIa";
import { LimiteDeTentativas } from "./limiteDeTentativas";
import { exigirPremium, exigirSessao } from "./sessao";

const LIMITE_CORPO_BYTES = 256 * 1024;
const PEDIDOS_POR_MINUTO = 30;

interface CorpoChat {
  model: string;
  messages: MensagemIa[];
  max_completion_tokens?: number;
  stream?: boolean;
}

// Sem `additionalProperties: false` no topo: campos extras do dialeto OpenAI são aceitos e
// simplesmente ignorados — nunca repassados ao fornecedor.
const SCHEMA_CHAT = {
  type: "object",
  required: ["model", "messages"],
  properties: {
    model: { type: "string", minLength: 1 },
    messages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: { type: "string", enum: ["system", "user", "assistant"] },
          content: { type: "string" },
        },
      },
    },
    max_completion_tokens: { type: "integer", minimum: 1 },
    stream: { type: "boolean", const: false },
  },
} as const;

export function registrarRotasIa(
  app: FastifyInstance,
  banco: BancoSqlite,
  opcoes: { ia?: ConfigIa; fetchFornecedor: typeof fetch; agora: () => number },
): void {
  const limite = new LimiteDeTentativas(PEDIDOS_POR_MINUTO);

  app.post<{ Body: CorpoChat }>(
    "/chat/completions",
    {
      bodyLimit: LIMITE_CORPO_BYTES,
      schema: { body: SCHEMA_CHAT },
      preHandler: [exigirSessao, exigirPremium],
    },
    async (request, reply) => {
      const conta = request.conta!;
      const { model, messages, max_completion_tokens } = request.body;

      if (!ehModeloLogico(model)) return reply.code(404).send();
      if (!limite.registrar(`conta:${conta.id}`)) return reply.code(429).send({ codigo: "limite" });

      const saldo = saldoDaConta(banco, conta.id, opcoes.agora());
      if (saldo.usados >= saldo.total) return reply.code(429).send({ codigo: "creditos" });

      if (!opcoes.ia?.chave) return reply.code(503).send();

      let resposta;
      try {
        resposta = await chamarFornecedor({
          ia: opcoes.ia,
          fetchImpl: opcoes.fetchFornecedor,
          mensagens: messages.map((m) => ({ role: m.role, content: m.content })),
          maxTokens: tetoDeSaida(max_completion_tokens),
        });
      } catch (erro) {
        if (erro instanceof FalhaFornecedor) return reply.code(502).send();
        throw erro;
      }

      debitar(banco, conta.id, opcoes.agora(), resposta.uso);

      return reply.code(200).send({
        object: "chat.completion",
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: resposta.texto }, finish_reason: resposta.motivoFim },
        ],
        usage: {
          prompt_tokens: resposta.tokensEntrada,
          completion_tokens: resposta.tokensSaida,
          total_tokens: resposta.tokensEntrada + resposta.tokensSaida,
        },
      });
    },
  );

  app.get("/creditos", { preHandler: [exigirSessao, exigirPremium] }, async (request) =>
    saldoDaConta(banco, request.conta!.id, opcoes.agora()),
  );
}
