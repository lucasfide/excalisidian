// servidor/src/rotasSessaoAtual.test.ts
// GET /v1/sessoes/atual: consulta a sessão do Bearer sem trocar o token (doc 18 §1, §4).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import { criarSessao, renovarSessao } from "./sessao";

let pasta: string;
let app: FastifyInstance;

function criarConta(email: string, plano: "premium" | "gratis" = "premium") {
  const r = app.banco
    .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, x'00', x'00', ?, 0)`)
    .run(email, plano);
  const id = Number(r.lastInsertRowid);
  return { id, ...criarSessao(app.banco, id) };
}

function consultar(token?: string) {
  return app.inject({
    method: "GET",
    url: "/v1/sessoes/atual",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-sessao-atual-"));
  app = criarApp({ porta: 0, pastaDados: pasta });
});

afterEach(async () => {
  await app.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("GET /v1/sessoes/atual", () => {
  it("401 sem Bearer", async () => {
    expect((await consultar()).statusCode).toBe(401);
  });

  it("200 com email, plano e expiraEm, sem token", async () => {
    const { token, expiraEm } = criarConta("a@exemplo.com", "gratis");
    const r = await consultar(token);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ email: "a@exemplo.com", plano: "gratis", expiraEm });
  });

  it("não troca o token: a segunda chamada com o mesmo token continua 200", async () => {
    const { token } = criarConta("a@exemplo.com");
    expect((await consultar(token)).statusCode).toBe(200);
    expect((await consultar(token)).statusCode).toBe(200);
  });

  it("token substituído por renovar dá 401", async () => {
    const { token } = criarConta("a@exemplo.com");
    const nova = renovarSessao(app.banco, token)!;
    expect((await consultar(token)).statusCode).toBe(401);
    expect((await consultar(nova.token)).statusCode).toBe(200);
  });
});
