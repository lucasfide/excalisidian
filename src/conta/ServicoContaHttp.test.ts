// src/conta/ServicoContaHttp.test.ts
import { describe, it, expect, vi } from "vitest";

import { ServicoContaHttp } from "./ServicoContaHttp";

const BASE = "https://api.exemplo.test/v1";

const resposta = (status: number, corpo: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => corpo }) as Response;

const sessaoValida = {
  token: "tok-1",
  email: "ana@exemplo.com",
  plano: "premium",
  expiraEm: Date.now() + 1000,
};

describe("ServicoContaHttp", () => {
  it("entrar manda email e senha no corpo e devolve a sessão do servidor", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);

    const s = await servico.entrar("ana@exemplo.com", "segredo123");

    expect(s.token).toBe("tok-1");
    expect(s.plano).toBe("premium");
    const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/sessoes`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ana@exemplo.com",
      senha: "segredo123",
    });
  });

  it("401 em entrar vira credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("409 em criar vira emailEmUso", async () => {
    const falso = vi.fn(async () => resposta(409, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.criar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });

  it("401 em renovar vira expirada, não credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.renovar("tok-velho")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("renovar manda o token no Authorization", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await servico.renovar("tok-velho");
    const [, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-velho");
  });

  it("exceção de rede vira rede", async () => {
    const falso = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "rede" }),
    );
  });

  it("500 vira servidor", async () => {
    const falso = vi.fn(async () => resposta(500, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("403 vira servidor, não credenciais — autenticado mas sem permissão é outro problema", async () => {
    const falso = vi.fn(async () => resposta(403, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("corpo sem token vira servidor, não sessão quebrada", async () => {
    const falso = vi.fn(async () => resposta(200, { email: "a@b.c" }));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("sair com token inválido não propaga erro", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.sair("tok-velho")).resolves.toBeUndefined();
  });
});
