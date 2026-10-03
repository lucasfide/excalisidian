// servidor/src/registrosAcesso.test.ts
// Registros de acesso (Marco Civil, art. 15; doc 18 §4, ADR-46): gravam em criar conta, entrar,
// renovar e `uso` (uma vez por hora por conta e IP); falha de autenticação não grava; os de mais
// de 183 dias somem; o IP nunca vai para o log; nenhuma rota HTTP devolve os registros.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { criarApp } from "./app";
import type { Config } from "./config";
import {
  agendarLimpezaDeRegistrosAcesso,
  apagarRegistrosAcessoVencidos,
  listarRegistrosAcesso,
  registrarAcesso,
  registrarUsoSeNovaHora,
  RETENCAO_REGISTROS_ACESSO_MS,
} from "./registrosAcesso";

const KDF = "argon2id-m65536-t3-p4-v1";
const PROVA = Buffer.alloc(32, 7).toString("base64");
const PROVA_ERRADA = Buffer.alloc(32, 9).toString("base64");
const IP_A = "198.51.100.10";
const IP_B = "198.51.100.20";

let pastaTemporaria: string;
let app: FastifyInstance;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-acessos-"));
  app = criarApp({ porta: 0, pastaDados: pastaTemporaria } as Config);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

function pelaRede(ip: string, token?: string) {
  return {
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  };
}

async function criarContaHttp(email: string, ip = IP_A): Promise<{ token: string; status: number }> {
  const r = await app.inject({
    method: "POST",
    url: "/v1/contas",
    ...pelaRede(ip),
    payload: { email, provaDeIdentidade: PROVA, kdf: KDF },
  });
  return { token: r.statusCode === 200 ? (r.json() as { token: string }).token : "", status: r.statusCode };
}

async function entrarHttp(email: string, ip = IP_A, prova = PROVA) {
  return app.inject({
    method: "POST",
    url: "/v1/sessoes",
    ...pelaRede(ip),
    payload: { email, provaDeIdentidade: prova, kdf: KDF },
  });
}

function todos(email: string) {
  return listarRegistrosAcesso(app.banco, email);
}

describe("registro em criar conta, entrar e renovar", () => {
  it("criar conta grava criar-conta com o IP de quem pediu e o e-mail da conta", async () => {
    await criarContaHttp("ana@teste.com", IP_A);
    const registros = todos("ana@teste.com");
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ ip: IP_A, evento: "criar-conta" });
    expect(Math.abs(registros[0].instante - Date.now())).toBeLessThan(10_000);
  });

  it("entrar grava entrar; senha errada e e-mail inexistente não gravam", async () => {
    await criarContaHttp("ana@teste.com", IP_A);
    expect((await entrarHttp("ana@teste.com", IP_B)).statusCode).toBe(200);
    expect((await entrarHttp("ana@teste.com", IP_B, PROVA_ERRADA)).statusCode).toBe(401);
    expect((await entrarHttp("ninguem@teste.com", IP_B)).statusCode).toBe(401);

    expect(todos("ana@teste.com").map((r) => [r.evento, r.ip])).toEqual([
      ["criar-conta", IP_A],
      ["entrar", IP_B],
    ]);
    expect(todos("ninguem@teste.com")).toEqual([]);
  });

  it("criar conta com e-mail já em uso (409) não grava", async () => {
    await criarContaHttp("ana@teste.com", IP_A);
    expect((await criarContaHttp("ana@teste.com", IP_B)).status).toBe(409);
    expect(todos("ana@teste.com")).toHaveLength(1);
  });

  it("renovar grava renovar; renovar com token inválido não grava", async () => {
    const { token } = await criarContaHttp("ana@teste.com", IP_A);
    const ok = await app.inject({ method: "POST", url: "/v1/sessoes/renovar", ...pelaRede(IP_B, token) });
    expect(ok.statusCode).toBe(200);
    const ruim = await app.inject({ method: "POST", url: "/v1/sessoes/renovar", ...pelaRede(IP_B, "token-que-nao-existe") });
    expect(ruim.statusCode).toBe(401);

    expect(todos("ana@teste.com").map((r) => [r.evento, r.ip])).toEqual([
      ["criar-conta", IP_A],
      ["renovar", IP_B],
    ]);
  });
});

describe("uso: primeiro pedido autenticado de cada hora por conta e IP", () => {
  it("vários pedidos na mesma hora gravam um uso só; pedido sem sessão não grava", async () => {
    const { token } = await criarContaHttp("ana@teste.com", IP_A);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
      expect(r.statusCode).toBe(200);
    }
    const semSessao = await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, "invalido") });
    expect(semSessao.statusCode).toBe(401);
    const semCabecalho = await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A) });
    expect(semCabecalho.statusCode).toBe(401);

    expect(todos("ana@teste.com").filter((r) => r.evento === "uso")).toHaveLength(1);
  });

  it("outro IP da mesma conta grava o seu próprio uso", async () => {
    const { token } = await criarContaHttp("ana@teste.com", IP_A);
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_B, token) });
    const usos = todos("ana@teste.com").filter((r) => r.evento === "uso");
    expect(usos.map((r) => r.ip).sort()).toEqual([IP_A, IP_B]);
  });

  it("passada uma hora, o pedido seguinte grava um novo uso", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const { token } = await criarContaHttp("ana@teste.com", IP_A);
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
    vi.setSystemTime(new Date("2026-10-03T12:59:59Z"));
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
    expect(todos("ana@teste.com").filter((r) => r.evento === "uso")).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-03T13:00:01Z"));
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
    expect(todos("ana@teste.com").filter((r) => r.evento === "uso")).toHaveLength(2);
  });

  it("registrarUsoSeNovaHora devolve se gravou", () => {
    const conta = { id: 1, email: "a@x.com" };
    const t = Date.UTC(2026, 9, 3, 12, 0, 0);
    expect(registrarUsoSeNovaHora(app.banco, conta, IP_A, t)).toBe(true);
    expect(registrarUsoSeNovaHora(app.banco, conta, IP_A, t + 30 * 60_000)).toBe(false);
    expect(registrarUsoSeNovaHora(app.banco, conta, IP_A, t + 61 * 60_000)).toBe(true);
  });
});

describe("retenção de 183 dias", () => {
  it("apaga só o que tem mais de 183 dias", () => {
    const agora = Date.UTC(2026, 9, 3, 12, 0, 0);
    const dia = 24 * 60 * 60 * 1000;
    const conta = { id: 1, email: "a@x.com" };
    registrarAcesso(app.banco, conta, IP_A, "entrar", agora - 184 * dia);
    registrarAcesso(app.banco, conta, IP_A, "entrar", agora - RETENCAO_REGISTROS_ACESSO_MS - 1);
    registrarAcesso(app.banco, conta, IP_A, "entrar", agora - 182 * dia);
    registrarAcesso(app.banco, conta, IP_A, "uso", agora);

    expect(apagarRegistrosAcessoVencidos(app.banco, agora)).toBe(2);
    expect(listarRegistrosAcesso(app.banco, "a@x.com")).toHaveLength(2);
  });

  it("a rotina agendada limpa ao subir e a cada 24 h", () => {
    vi.useFakeTimers();
    const inicio = Date.UTC(2026, 9, 3, 12, 0, 0);
    vi.setSystemTime(inicio);
    const dia = 24 * 60 * 60 * 1000;
    const conta = { id: 1, email: "a@x.com" };
    registrarAcesso(app.banco, conta, IP_A, "entrar", inicio - 200 * dia);
    registrarAcesso(app.banco, conta, IP_A, "entrar", inicio - 182 * dia);

    const cancelar = agendarLimpezaDeRegistrosAcesso(app.banco);
    expect(listarRegistrosAcesso(app.banco, "a@x.com")).toHaveLength(1); // ao subir

    vi.advanceTimersByTime(2 * dia); // o de 182 dias passa de 183 depois de 2 dias
    expect(listarRegistrosAcesso(app.banco, "a@x.com")).toHaveLength(0);
    cancelar();
  });
});

describe("sigilo", () => {
  it("nenhum IP aparece no log (stdout) em criar, entrar, renovar e uso", async () => {
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    const { token } = await criarContaHttp("sigilo@teste.com", IP_A);
    await entrarHttp("sigilo@teste.com", IP_B);
    await app.inject({ method: "POST", url: "/v1/sessoes/renovar", ...pelaRede(IP_B, token) });
    await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });

    expect(espiao).toHaveBeenCalled();
    const tudo = espiao.mock.calls.map((c) => String(c[0])).join("\n");
    expect(tudo).not.toContain(IP_A);
    expect(tudo).not.toContain(IP_B);
    expect(tudo).not.toContain("198.51.100");
    expect(tudo).not.toContain("sigilo@teste.com");
    expect(todos("sigilo@teste.com").length).toBeGreaterThan(0);
  });

  it("nenhuma rota HTTP devolve registros de acesso", async () => {
    const { token } = await criarContaHttp("sigilo@teste.com", IP_A);
    for (const url of ["/v1/acessos", "/v1/registros-acesso", "/v1/registros_acesso", "/v1/sessoes/acessos"]) {
      const r = await app.inject({ method: "GET", url, ...pelaRede(IP_A, token) });
      expect(r.statusCode).toBe(404);
    }
    const atual = await app.inject({ method: "GET", url: "/v1/sessoes/atual", ...pelaRede(IP_A, token) });
    expect(atual.body).not.toContain(IP_A);
  });
});
