// src/conta/ServicoContaHttp.test.ts
import { describe, it, expect, vi } from "vitest";

import { normalizarEmail } from "./derivacaoSenha";
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

// Dublê da derivação: rápido e determinístico, para não rodar o Argon2id real em cada
// teste (ele demora frações de segundo por chamada — inaceitável multiplicado pelos
// testes desta suíte). Devolve valores fixos e distintos da senha de entrada, para os
// testes conseguirem confirmar que é ISSO que vai no corpo, e não a senha.
const derivarFalso = vi.fn(async (email: string, _senha: string) => ({
  provaDeIdentidade: `prova-de:${normalizarEmail(email)}`,
  chaveDeEnvelope: new Uint8Array([1, 2, 3]),
  kdf: "kdf-fake-v1",
}));

function servicoComDubles(fetchImpl: typeof fetch) {
  derivarFalso.mockClear();
  return new ServicoContaHttp(BASE, fetchImpl, derivarFalso);
}

describe("ServicoContaHttp", () => {
  it("entrar manda email normalizado, provaDeIdentidade e kdf — nunca a senha", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);

    const s = await servico.entrar(" Ana@Exemplo.com ", "segredo123456");

    expect(s.token).toBe("tok-1");
    expect(s.plano).toBe("premium");
    const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/sessoes`);
    expect(init.method).toBe("POST");
    const corpoBruto = init.body as string;
    // A senha não aparece no corpo serializado, em lugar nenhum.
    expect(corpoBruto).not.toContain("segredo123456");
    expect(JSON.parse(corpoBruto)).toEqual({
      email: "ana@exemplo.com",
      provaDeIdentidade: "prova-de:ana@exemplo.com",
      kdf: "kdf-fake-v1",
    });
    expect(derivarFalso).toHaveBeenCalledWith(" Ana@Exemplo.com ", "segredo123456");
  });

  it("criar manda email normalizado, provaDeIdentidade e kdf — nunca a senha", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);

    await servico.criar(" Ana@Exemplo.com ", "segredo123456");

    const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/contas`);
    const corpoBruto = init.body as string;
    expect(corpoBruto).not.toContain("segredo123456");
    expect(JSON.parse(corpoBruto)).toEqual({
      email: "ana@exemplo.com",
      provaDeIdentidade: "prova-de:ana@exemplo.com",
      kdf: "kdf-fake-v1",
    });
  });

  it("criar com senha de 11 caracteres rejeita senhaCurta sem chamar fetch nem derivação", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);

    await expect(servico.criar("a@b.c", "onzeletras1")).rejects.toThrow(
      expect.objectContaining({ codigo: "senhaCurta" }),
    );
    expect(falso).not.toHaveBeenCalled();
    expect(derivarFalso).not.toHaveBeenCalled();
  });

  it("criar com 12 caracteres acentuados em NFD (mais unidades antes do NFC) passa", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);

    // "áéíóúâêîôû12" em NFD: cada uma das 10 vogais acentuadas é letra base + diacrítico
    // combinante — 22 unidades UTF-16 antes do NFC, mas 12 caracteres depois dele. Se a
    // contagem usasse `.length` (unidades UTF-16) direto na string NFD, rejeitaria por
    // engano; a regra exige normalizar para NFC primeiro.
    const senhaNfd = "áéíóúâêîôû12".normalize("NFD");
    expect(senhaNfd.length).toBeGreaterThan(12);
    expect([...senhaNfd.normalize("NFC")].length).toBe(12);

    await expect(servico.criar("a@b.c", senhaNfd)).resolves.toBeTruthy();
    expect(falso).toHaveBeenCalledTimes(1);
    expect(derivarFalso).toHaveBeenCalledTimes(1);
  });

  it("entrar com senha curta chama normalmente — sem mínimo no entrar", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);

    await servico.entrar("a@b.c", "curta");

    expect(falso).toHaveBeenCalledTimes(1);
    expect(derivarFalso).toHaveBeenCalledTimes(1);
  });

  it("401 em entrar vira credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("409 em criar vira emailEmUso", async () => {
    const falso = vi.fn(async () => resposta(409, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.criar("a@b.c", "senhalongabastante")).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });

  it("401 em renovar vira expirada, não credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.renovar("tok-velho")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("renovar manda o token no Authorization", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await servico.renovar("tok-velho");
    const [, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-velho");
  });

  it("exceção de rede vira rede", async () => {
    const falso = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "rede" }),
    );
  });

  it("500 vira servidor", async () => {
    const falso = vi.fn(async () => resposta(500, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("403 vira servidor, não credenciais — autenticado mas sem permissão é outro problema", async () => {
    const falso = vi.fn(async () => resposta(403, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("corpo sem token vira servidor, não sessão quebrada", async () => {
    const falso = vi.fn(async () => resposta(200, { email: "a@b.c" }));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("sair com token inválido não propaga erro", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = servicoComDubles(falso as unknown as typeof fetch);
    await expect(servico.sair("tok-velho")).resolves.toBeUndefined();
  });
});
