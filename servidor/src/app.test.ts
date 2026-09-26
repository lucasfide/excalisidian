// servidor/src/app.test.ts
// Testes de fumaça do esqueleto do servidor: /saude responde, o log de uma requisição não
// contém corpo/query, e as migrações são idempotentes (ver banco.test.ts para o teste
// dedicado a isso).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApp } from "./app";
import type { Config } from "./config";
import type { FastifyInstance } from "fastify";

let pastaTemporaria: string;
let config: Config;
let app: FastifyInstance;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-servidor-"));
  config = { porta: 0, pastaDados: pastaTemporaria };
  app = criarApp(config);
});

afterEach(async () => {
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

describe("GET /v1/saude", () => {
  it("responde { ok: true }", async () => {
    const resposta = await app.inject({ method: "GET", url: "/v1/saude" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true });
  });
});

describe("log por requisição", () => {
  it("não contém corpo nem query — só método, rota, status e duração", async () => {
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});

    await app.inject({
      method: "GET",
      url: "/v1/saude?segredo=nao-deveria-aparecer",
      payload: { email: "alguem@example.com", provaDeIdentidade: "nao-deveria-aparecer" },
    });

    expect(espiao).toHaveBeenCalledTimes(1);
    const linha = JSON.parse(espiao.mock.calls[0][0] as string);

    expect(linha).toMatchObject({ metodo: "GET", rota: "/v1/saude", status: 200 });
    expect(typeof linha.duracaoMs).toBe("number");

    const textoDaLinha = JSON.stringify(linha);
    expect(textoDaLinha).not.toContain("segredo");
    expect(textoDaLinha).not.toContain("nao-deveria-aparecer");
    expect(textoDaLinha).not.toContain("alguem@example.com");

    espiao.mockRestore();
  });
});
