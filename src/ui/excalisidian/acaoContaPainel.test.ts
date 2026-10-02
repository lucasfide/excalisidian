import { describe, expect, it } from "vitest";
import {
  acaoDepoisRecuperacaoSessao,
  deveMostrarBotaoContaPainel,
  tokenMudouDuranteRecuperacao,
} from "./acaoContaPainel";

describe("ações de conta no painel do agente", () => {
  it("só oferece entrada para falha de sessão já carregada no provedor com conta", () => {
    expect(
      deveMostrarBotaoContaPainel({
        usaProvedorComConta: true,
        contaCarregada: true,
        sessaoPresente: true,
        erroDeSessao: true,
      }),
    ).toBe(true);
    expect(
      deveMostrarBotaoContaPainel({
        usaProvedorComConta: false,
        contaCarregada: true,
        sessaoPresente: true,
        erroDeSessao: true,
      }),
    ).toBe(false);
    expect(
      deveMostrarBotaoContaPainel({
        usaProvedorComConta: true,
        contaCarregada: true,
        sessaoPresente: true,
        erroDeSessao: false,
      }),
    ).toBe(false);
    expect(
      deveMostrarBotaoContaPainel({
        usaProvedorComConta: true,
        contaCarregada: false,
        sessaoPresente: true,
        erroDeSessao: true,
      }),
    ).toBe(false);
    expect(
      deveMostrarBotaoContaPainel({
        usaProvedorComConta: true,
        contaCarregada: true,
        sessaoPresente: false,
        erroDeSessao: false,
      }),
    ).toBe(true);
  });

  it("abre Conta apenas após expiração; token novo continua e recusa inconclusiva permite nova tentativa", () => {
    expect(acaoDepoisRecuperacaoSessao({ estado: "expirada" })).toBe("abrir-conta");
    expect(
      acaoDepoisRecuperacaoSessao({
        estado: "token-atualizado",
        sessao: { token: "novo", email: "a@b.com", plano: "premium", expiraEm: 100 },
      }),
    ).toBe("continuar");
    expect(
      acaoDepoisRecuperacaoSessao({ estado: "acesso-nao-confirmado", sessao: null }),
    ).toBe("tentar-novamente");
  });

  it("não usa o resultado da recuperação se a sessão mudou enquanto aguardava", () => {
    expect(
      tokenMudouDuranteRecuperacao("esperado", {
        token: "novo",
        email: "a@b.com",
        plano: "premium",
        expiraEm: 100,
      }),
    ).toBe(true);
    expect(
      tokenMudouDuranteRecuperacao("esperado", {
        token: "esperado",
        email: "a@b.com",
        plano: "premium",
        expiraEm: 100,
      }),
    ).toBe(false);
    expect(tokenMudouDuranteRecuperacao("esperado", null)).toBe(false);
  });
});
