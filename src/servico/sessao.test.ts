// src/servico/sessao.test.ts
import { describe, it, expect, beforeEach } from "vitest";

import { tokenDaSessaoAtual, definirTokenDaSessao } from "./sessao";
import { BASE_URL_SERVICO, hostDoServico } from "./base";

describe("sessão do serviço", () => {
  beforeEach(() => definirTokenDaSessao(null));

  it("começa sem token", () => {
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("guarda e devolve o token definido", () => {
    definirTokenDaSessao("abc123");
    expect(tokenDaSessaoAtual()).toBe("abc123");
  });

  it("definir null limpa, que é o que o logout faz", () => {
    definirTokenDaSessao("abc123");
    definirTokenDaSessao(null);
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("token vazio ou só espaço conta como ausente", () => {
    definirTokenDaSessao("   ");
    expect(tokenDaSessaoAtual()).toBeNull();
  });
});

describe("base do serviço", () => {
  it("a URL é https e termina sem barra", () => {
    expect(BASE_URL_SERVICO.startsWith("https://")).toBe(true);
    expect(BASE_URL_SERVICO.endsWith("/")).toBe(false);
  });

  it("hostDoServico devolve só o host, para casar com o escopo do capability", () => {
    expect(hostDoServico()).toBe(new URL(BASE_URL_SERVICO).host);
  });
});
