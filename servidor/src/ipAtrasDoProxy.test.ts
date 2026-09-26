// servidor/src/ipAtrasDoProxy.test.ts
// Na VPS o servidor escuta só em 127.0.0.1 (doc 18 §2) e toda requisição chega pelo Caddy —
// então `request.ip` sem `trustProxy` seria sempre 127.0.0.1, e o limite "10/min por IP"
// (doc 18 §3) contaria todo mundo junto, num balde só. Com `trustProxy` confiando SÓ no
// proxy local, `request.ip` vem do `X-Forwarded-For` quando quem conecta é 127.0.0.1 (o
// Caddy) — e é ignorado quando quem conecta é outro endereço qualquer, para uma requisição
// que chegasse direto no servidor (pulando o Caddy) não conseguir forjar o próprio IP.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { criarApp } from "./app";
import type { Config } from "./config";

let pastaTemporaria: string;
let app: FastifyInstance;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-ip-"));
  app = criarApp({ porta: 0, pastaDados: pastaTemporaria } as Config);
});

afterEach(async () => {
  await app.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

// Corpo de "entrar" com um e-mail sempre diferente e uma prova válida em formato (32
// bytes em base64) — assim o limite POR E-MAIL nunca entra em jogo, e o teste isola só o
// limite por IP.
function corpoEntrar(sufixo: string | number) {
  return {
    email: `entrar-${sufixo}@teste.com`,
    provaDeIdentidade: Buffer.alloc(32, 7).toString("base64"),
    kdf: "argon2id-m65536-t3-p4-v1",
  };
}

describe("request.ip atrás do proxy (trustProxy)", () => {
  it("duas requisições vindas de 127.0.0.1 (o Caddy) com X-Forwarded-For diferentes contam em baldes de IP separados", async () => {
    // 11 tentativas com X-Forwarded-For: 9.9.9.9 — a 11ª deve bater no limite do IP 9.9.9.9.
    let ultimaRespostaDoNove: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let i = 0; i < 11; i++) {
      ultimaRespostaDoNove = await app.inject({
        method: "POST",
        url: "/v1/sessoes",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": "9.9.9.9" },
        payload: corpoEntrar(`nove-${i}`),
      });
    }
    expect(ultimaRespostaDoNove?.statusCode).toBe(429);

    // Uma requisição nova, mesmo peer confiável (127.0.0.1), mas outro X-Forwarded-For —
    // se o balde fosse por peer (sempre 127.0.0.1), isto também bateria em 429. Como o
    // balde é pelo IP real (via X-Forwarded-For), esta é a primeira tentativa desse IP.
    const respostaDoOito = await app.inject({
      method: "POST",
      url: "/v1/sessoes",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "8.8.8.8" },
      payload: corpoEntrar("oito"),
    });
    expect(respostaDoOito.statusCode).toBe(401);
  });

  it("uma requisição de fora (peer != 127.0.0.1) não consegue escolher o próprio IP forjando X-Forwarded-For", async () => {
    // Mesmo peer real (simulando alguém que não passou pelo Caddy), mas um
    // X-Forwarded-For DIFERENTE em cada tentativa — se o servidor confiasse nisso sem o
    // peer ser o proxy local, cada tentativa pareceria vir de um IP novo e nunca bateria
    // no limite. O peer real deve ser usado, ignorando o cabeçalho forjado.
    let ultimaResposta: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let i = 0; i < 11; i++) {
      ultimaResposta = await app.inject({
        method: "POST",
        url: "/v1/sessoes",
        remoteAddress: "203.0.113.5",
        headers: { "x-forwarded-for": `10.0.0.${i}` },
        payload: corpoEntrar(`forjado-${i}`),
      });
    }
    expect(ultimaResposta?.statusCode).toBe(429);
  });
});
