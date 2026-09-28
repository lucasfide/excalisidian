// servidor/src/rotasIa.test.ts
// Rotas da IA (doc 18 §5.1): a ordem das verificações, o débito pelo uso real, nada cobrado
// em falha, formato da resposta que src/agente/cliente.ts lê, e o log sem texto.
//
// Contas e sessões são criadas direto no banco com `criarSessao` (relógio real): o `agora`
// injetado no app só controla preço e período, sem vencer a sessão.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import type { Config } from "./config";
import { criarSessao } from "./sessao";
import { fetchPorInject } from "./apoioTestes/fetchPorInject";
import { buscarSaldoCreditos } from "../../src/servico/saldoCreditos";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const SEGUNDA_12H_UTC = Date.UTC(2026, 8, 28, 12, 0, 0); // fora de pico
const IA = { chave: "sk-secreta-do-fornecedor", url: "https://fornecedor.exemplo", modelo: "modelo-real" };

let pasta: string;
let app: FastifyInstance;
let fornecedor: ReturnType<typeof vi.fn>;

function respostaFornecedor(usage: unknown = { prompt_tokens: 1000, completion_tokens: 100 }) {
  return new Response(
    JSON.stringify({
      id: "x",
      model: "modelo-real",
      choices: [{ message: { role: "assistant", content: "resposta", reasoning_content: "pensei" }, finish_reason: "stop" }],
      usage,
    }),
    { status: 200 },
  );
}

function montar(config: Partial<Config> = {}) {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-ia-"));
  fornecedor = vi.fn(async () => respostaFornecedor());
  app = criarApp(
    { porta: 0, pastaDados: pasta, ia: IA, ...config },
    { agora: () => SEGUNDA_12H_UTC, fetchFornecedor: fornecedor as unknown as typeof fetch },
  );
}

function criarConta(email: string, plano: "premium" | "gratis" = "premium"): { id: number; token: string } {
  const r = app.banco
    .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, x'00', x'00', ?, 0)`)
    .run(email, plano);
  const id = Number(r.lastInsertRowid);
  return { id, token: criarSessao(app.banco, id).token };
}

function pedir(token: string | undefined, corpo: unknown) {
  return app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload: JSON.stringify(corpo),
  });
}

const CORPO = { model: "leitura-rapida", messages: [{ role: "user", content: "texto secreto da nota" }] };

beforeEach(() => montar());

afterEach(async () => {
  await app.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("POST /v1/chat/completions — ordem das verificações", () => {
  it("corpo acima de 256 KiB → 413", async () => {
    const { token } = criarConta("a@x.com");
    const grande = { model: "leitura-rapida", messages: [{ role: "user", content: "a".repeat(300 * 1024) }] };
    expect((await pedir(token, grande)).statusCode).toBe(413);
  });

  it("corpo inválido → 400; stream true → 400", async () => {
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, { model: "leitura-rapida", messages: [] })).statusCode).toBe(400);
    expect((await pedir(token, { model: "leitura-rapida", messages: [{ role: "tool", content: "x" }] })).statusCode).toBe(400);
    expect((await pedir(token, { ...CORPO, stream: true })).statusCode).toBe(400);
  });

  it("sem sessão → 401; conta grátis → 403", async () => {
    expect((await pedir(undefined, CORPO)).statusCode).toBe(401);
    const { token } = criarConta("g@x.com", "gratis");
    expect((await pedir(token, CORPO)).statusCode).toBe(403);
  });

  it("modelo fora dos lógicos → 404, sem chamar o fornecedor", async () => {
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, { ...CORPO, model: "modelo-real" })).statusCode).toBe(404);
    expect(fornecedor).not.toHaveBeenCalled();
  });

  it("mais de 30 pedidos por minuto na conta → 429 limite", async () => {
    const { token } = criarConta("a@x.com");
    for (let i = 0; i < 30; i++) expect((await pedir(token, CORPO)).statusCode).toBe(200);
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ codigo: "limite" });
  });

  it("créditos no total → 429 creditos; um abaixo → passa", async () => {
    const { id, token } = criarConta("a@x.com");
    // 2.999 créditos = 2.999.000 micro-dólares usados no mês.
    app.banco
      .prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida) values (?, '2026-09', 2999000, 1, 0, 0)`)
      .run(id);
    expect((await pedir(token, CORPO)).statusCode).toBe(200);
    app.banco.prepare(`update uso_ia set custo_micro_usd = 3000000 where conta_id = ?`).run(id);
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ codigo: "creditos" });
  });

  it("sem chave do fornecedor → 503", async () => {
    await app.close();
    fs.rmSync(pasta, { recursive: true, force: true });
    montar({ ia: { ...IA, chave: "" } });
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, CORPO)).statusCode).toBe(503);
  });
});

describe("POST /v1/chat/completions — sucesso e falha do fornecedor", () => {
  it("200 no formato do dialeto OpenAI, com o modelo lógico e sem campos do fornecedor", async () => {
    const { token } = criarConta("a@x.com");
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      object: "chat.completion",
      model: "leitura-rapida",
      choices: [{ index: 0, message: { role: "assistant", content: "resposta" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
    });
    expect(r.body).not.toContain("modelo-real");
    expect(r.body).not.toContain("pensei");
  });

  it("repassa só role e content, com o teto de saída pedido", async () => {
    const { token } = criarConta("a@x.com");
    await pedir(token, { ...CORPO, max_completion_tokens: 500, temperature: 2, extra: "x" });
    const corpo = JSON.parse((fornecedor.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo.messages).toEqual([{ role: "user", content: "texto secreto da nota" }]);
    expect(corpo.max_tokens).toBe(500);
    expect(corpo.temperature).toBeUndefined();
    expect(corpo.extra).toBeUndefined();
  });

  it("debita pelo uso real: 1000 entrada + 100 saída fora de pico = 210 µ$ = 1 crédito", async () => {
    const { id, token } = criarConta("a@x.com");
    await pedir(token, CORPO);
    const linha = app.banco.prepare(`select custo_micro_usd as micro, pedidos from uso_ia where conta_id = ?`).get(id);
    expect(linha).toEqual({ micro: 210, pedidos: 1 });
  });

  it("fornecedor falha → 502 e nada é cobrado", async () => {
    const { id, token } = criarConta("a@x.com");
    fornecedor.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    expect((await pedir(token, CORPO)).statusCode).toBe(502);
    fornecedor.mockImplementationOnce(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await pedir(token, CORPO)).statusCode).toBe(502);
    expect(app.banco.prepare(`select count(*) as n from uso_ia where conta_id = ?`).get(id)).toEqual({ n: 0 });
  });

  it("o log da chamada não traz o texto, o token nem a chave", async () => {
    const { token } = criarConta("a@x.com");
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    await pedir(token, CORPO);
    const tudo = espiao.mock.calls.map((c) => String(c[0])).join("\n");
    espiao.mockRestore();
    expect(tudo).toContain("/v1/chat/completions");
    expect(tudo).not.toContain("texto secreto da nota");
    expect(tudo).not.toContain(token);
    expect(tudo).not.toContain("sk-secreta-do-fornecedor");
  });
});

describe("POST /v1/chat/completions — pedidos simultâneos por conta", () => {
  // Fornecedor dublê que só responde quando o teste libera.
  function fornecedorTravado() {
    const liberar: Array<(r: Response | Error) => void> = [];
    fornecedor.mockImplementation(
      () =>
        new Promise<Response>((resolve, reject) => {
          liberar.push((r) => (r instanceof Error ? reject(r) : resolve(r)));
        }),
    );
    return liberar;
  }

  it("4 pedidos ao mesmo tempo → um 429 limite; liberados, os 3 passam e a vaga volta", async () => {
    const { token } = criarConta("a@x.com");
    const liberar = fornecedorTravado();
    const pedidos = [1, 2, 3, 4].map(() => pedir(token, CORPO));
    await vi.waitFor(() => expect(liberar.length).toBe(3));
    liberar.forEach((l) => l(respostaFornecedor()));
    const respostas = await Promise.all(pedidos);
    const codigos = respostas.map((r) => r.statusCode).sort();
    expect(codigos).toEqual([200, 200, 200, 429]);
    expect(respostas.find((r) => r.statusCode === 429)!.json()).toEqual({ codigo: "limite" });
    expect(fornecedor).toHaveBeenCalledTimes(3);

    fornecedor.mockImplementation(async () => respostaFornecedor());
    expect((await pedir(token, CORPO)).statusCode).toBe(200);
  });

  it("falha do fornecedor (502) também libera a vaga", async () => {
    const { token } = criarConta("a@x.com");
    const liberar = fornecedorTravado();
    const pedidos = [1, 2, 3].map(() => pedir(token, CORPO));
    await vi.waitFor(() => expect(liberar.length).toBe(3));
    liberar.forEach((l) => l(new TypeError("fetch failed")));
    expect((await Promise.all(pedidos)).map((r) => r.statusCode)).toEqual([502, 502, 502]);

    fornecedor.mockImplementation(async () => respostaFornecedor());
    for (let i = 0; i < 4; i++) expect((await pedir(token, CORPO)).statusCode).toBe(200);
  });

  it("o limite é por conta: outra conta não é afetada", async () => {
    const a = criarConta("a@x.com");
    const b = criarConta("b@x.com");
    const liberar = fornecedorTravado();
    const pedidosA = [1, 2, 3].map(() => pedir(a.token, CORPO));
    await vi.waitFor(() => expect(liberar.length).toBe(3));
    const pedidoB = pedir(b.token, CORPO);
    await vi.waitFor(() => expect(liberar.length).toBe(4));
    liberar.forEach((l) => l(respostaFornecedor()));
    const todos = await Promise.all([...pedidosA, pedidoB]);
    expect(todos.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
  });
});

describe("GET /v1/creditos", () => {
  it("401 sem sessão, 403 conta grátis", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/creditos" })).statusCode).toBe(401);
    const { token } = criarConta("g@x.com", "gratis");
    const r = await app.inject({ method: "GET", url: "/v1/creditos", headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(403);
  });

  it("contrato com o app: buscarSaldoCreditos lê o saldo real depois de um pedido", async () => {
    const { token } = criarConta("a@x.com");
    await pedir(token, CORPO);
    const saldo = await buscarSaldoCreditos(token, "http://localhost/v1", fetchPorInject(app));
    expect(saldo).toEqual({ usados: 1, total: 3000, renovaEm: Date.UTC(2026, 9, 1, 3, 0, 0) });
  });

  it("faixa superior mostra total 10.000", async () => {
    const { id, token } = criarConta("s@x.com");
    app.banco.prepare(`update contas set faixa_ia = 'superior' where id = ?`).run(id);
    const saldo = await buscarSaldoCreditos(token, "http://localhost/v1", fetchPorInject(app));
    expect(saldo?.total).toBe(10_000);
  });
});
