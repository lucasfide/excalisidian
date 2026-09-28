// servidor/src/contas.test.ts
// A prova da verdade é o cliente do app: estes testes rodam o `ServicoContaHttp` de
// verdade (src/conta/ServicoContaHttp.ts, na raiz) contra o servidor em processo, via
// `fetchPorInject` (app.inject por baixo). Se o cliente e o servidor discordarem sobre o
// formato da resposta ou o significado de um código HTTP, o teste pega.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import type { Config } from "./config";
import { fetchPorInject } from "./apoioTestes/fetchPorInject";

import { derivarDaSenha } from "../../src/conta/derivacaoSenha";
import { ServicoContaHttp } from "../../src/conta/ServicoContaHttp";

const BASE = "http://localhost/v1";

// Argon2id real é lento (~0,3 s por chamada) — derivamos poucas vezes e reusamos o
// resultado para o mesmo par (email, senha) em toda a suíte, em vez de rodar isso em
// cada `criar`/`entrar`. `derivarDaSenha` é determinístico (o sal vem do e-mail).
const cache = new Map<string, ReturnType<typeof derivarDaSenha>>();
function derivarComCache(email: string, senha: string): ReturnType<typeof derivarDaSenha> {
  const chave = `${email}::${senha}`;
  let promessa = cache.get(chave);
  if (!promessa) {
    promessa = derivarDaSenha(email, senha);
    cache.set(chave, promessa);
  }
  return promessa;
}

let pastaTemporaria: string;
let app: FastifyInstance;
let servico: ServicoContaHttp;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-contas-"));
  const config: Config = { porta: 0, pastaDados: pastaTemporaria };
  app = criarApp(config);
  servico = new ServicoContaHttp(BASE, fetchPorInject(app), derivarComCache);
});

afterEach(async () => {
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

const SENHA_VALIDA = "senha-de-teste-123456";
const SENHA_ERRADA = "outra-senha-bem-diferente";

describe("POST /v1/contas (criar)", () => {
  it("cria a conta e devolve uma sessão no plano grátis", async () => {
    const { sessao } = await servico.criar("ana@teste.com", SENHA_VALIDA);

    expect(sessao.email).toBe("ana@teste.com");
    expect(sessao.plano).toBe("gratis");
    expect(sessao.token.length).toBeGreaterThan(0);
    expect(sessao.expiraEm).toBeGreaterThan(Date.now());
  });

  it("criar com e-mail já cadastrado dá emailEmUso", async () => {
    await servico.criar("bruno@teste.com", SENHA_VALIDA);

    await expect(servico.criar("bruno@teste.com", SENHA_VALIDA)).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });
});

describe("POST /v1/sessoes (entrar)", () => {
  it("entrar com a senha certa devolve uma sessão", async () => {
    await servico.criar("carla@teste.com", SENHA_VALIDA);

    const { sessao } = await servico.entrar("carla@teste.com", SENHA_VALIDA);

    expect(sessao.email).toBe("carla@teste.com");
    expect(sessao.plano).toBe("gratis");
  });

  it("entrar com a senha errada dá credenciais", async () => {
    await servico.criar("davi@teste.com", SENHA_VALIDA);

    await expect(servico.entrar("davi@teste.com", SENHA_ERRADA)).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("entrar com e-mail inexistente dá o MESMO erro (credenciais) que senha errada", async () => {
    await expect(servico.entrar("nao-existe@teste.com", SENHA_VALIDA)).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("a resposta bruta é idêntica para prova errada e e-mail inexistente", async () => {
    await servico.criar("erika@teste.com", SENHA_VALIDA);
    const { provaDeIdentidade, kdf } = await derivarComCache("erika@teste.com", SENHA_ERRADA);

    const respostaProvaErrada = await app.inject({
      method: "POST",
      url: "/v1/sessoes",
      payload: { email: "erika@teste.com", provaDeIdentidade, kdf },
    });
    const respostaEmailInexistente = await app.inject({
      method: "POST",
      url: "/v1/sessoes",
      payload: { email: "fantasma@teste.com", provaDeIdentidade, kdf },
    });

    expect(respostaProvaErrada.statusCode).toBe(401);
    expect(respostaEmailInexistente.statusCode).toBe(401);
    expect(respostaProvaErrada.body).toBe(respostaEmailInexistente.body);
  });
});

describe("kdf desconhecido", () => {
  it("kdf diferente de ETIQUETA_KDF dá 400 (o cliente devolve servidor)", async () => {
    const respostaInject = await app.inject({
      method: "POST",
      url: "/v1/contas",
      payload: { email: "kdf@teste.com", provaDeIdentidade: "a".repeat(44), kdf: "kdf-antigo-v0" },
    });
    expect(respostaInject.statusCode).toBe(400);
  });
});

describe("POST /v1/sessoes/renovar", () => {
  it("renovar troca o token; o antigo deixa de valer", async () => {
    const { sessao: primeira } = await servico.criar("fabio@teste.com", SENHA_VALIDA);

    const segunda = await servico.renovar(primeira.token);
    expect(segunda.token).not.toBe(primeira.token);
    expect(segunda.email).toBe("fabio@teste.com");

    await expect(servico.renovar(primeira.token)).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );

    // O novo token continua bom.
    const terceira = await servico.renovar(segunda.token);
    expect(terceira.token).not.toBe(segunda.token);
  });
});

describe("DELETE /v1/sessoes (sair)", () => {
  it("sair invalida o token — renovar depois falha", async () => {
    const { sessao } = await servico.criar("gustavo@teste.com", SENHA_VALIDA);

    await servico.sair(sessao.token);

    await expect(servico.renovar(sessao.token)).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair é idempotente: chamar duas vezes com o mesmo token não dá erro", async () => {
    const { sessao } = await servico.criar("helena@teste.com", SENHA_VALIDA);

    const primeira = await app.inject({
      method: "DELETE",
      url: "/v1/sessoes",
      headers: { authorization: `Bearer ${sessao.token}` },
    });
    const segunda = await app.inject({
      method: "DELETE",
      url: "/v1/sessoes",
      headers: { authorization: `Bearer ${sessao.token}` },
    });

    expect(primeira.statusCode).toBe(204);
    expect(segunda.statusCode).toBe(204);
  });

  it("sair sem Bearer também não dá erro", async () => {
    const resposta = await app.inject({ method: "DELETE", url: "/v1/sessoes" });
    expect(resposta.statusCode).toBe(204);
  });
});

describe("limite de tentativas", () => {
  it("mais de 10 tentativas de entrar por minuto (mesmo e-mail) dá 429 — o cliente devolve servidor", async () => {
    await servico.criar("izabel@teste.com", SENHA_VALIDA);

    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 11; tentativa++) {
      try {
        await servico.entrar("izabel@teste.com", SENHA_ERRADA);
      } catch (erro) {
        ultimoErro = erro;
      }
    }

    expect(ultimoErro).toEqual(expect.objectContaining({ codigo: "servidor" }));
  });

  it("mais de 10 tentativas de criar conta por minuto (mesmo e-mail) dá 429", async () => {
    let ultimaResposta: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let tentativa = 0; tentativa < 11; tentativa++) {
      ultimaResposta = await app.inject({
        method: "POST",
        url: "/v1/contas",
        payload: {
          email: "joao@teste.com",
          provaDeIdentidade: Buffer.alloc(32, tentativa).toString("base64"),
          kdf: "argon2id-m65536-t3-p4-v1",
        },
      });
    }

    expect(ultimaResposta?.statusCode).toBe(429);
  });
});

describe("o banco nunca guarda a prova nem o token em texto", () => {
  it("a linha de `contas` não contém a prova de identidade original, e a de `sessoes` não contém o token", async () => {
    const { provaDeIdentidade } = await derivarComCache("karina@teste.com", SENHA_VALIDA);
    const { sessao } = await servico.criar("karina@teste.com", SENHA_VALIDA);

    const linhaConta = app.banco
      .prepare("select * from contas where email = ?")
      .get("karina@teste.com") as Record<string, unknown>;
    const linhaSessao = app.banco.prepare("select * from sessoes").get() as Record<string, unknown>;

    const textoConta = JSON.stringify(linhaConta, (_chave, valor) =>
      Buffer.isBuffer(valor) ? valor.toString("base64") : valor,
    );
    const textoSessao = JSON.stringify(linhaSessao);

    expect(textoConta).not.toContain(provaDeIdentidade);
    expect(textoSessao).not.toContain(sessao.token);
  });
});
