// src/conta/ServicoContaFakeDev.test.ts
import { describe, it, expect } from "vitest";

import {
  ServicoContaFakeDev,
  EMAIL_CONTA_TESTE_DEV,
  SENHA_CONTA_TESTE_DEV,
} from "./ServicoContaFakeDev";
import { FalhaConta } from "./tipos";

const contaTeste = () => ({
  [EMAIL_CONTA_TESTE_DEV]: { senha: SENHA_CONTA_TESTE_DEV, plano: "premium" as const },
});

describe("ServicoContaFakeDev", () => {
  it("entrar com a conta de teste devolve sessão premium", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    const sessao = await s.entrar(EMAIL_CONTA_TESTE_DEV, SENHA_CONTA_TESTE_DEV);
    expect(sessao.email).toBe(EMAIL_CONTA_TESTE_DEV);
    expect(sessao.plano).toBe("premium");
    expect(sessao.token).toBeTruthy();
  });

  it("entrar com senha errada falha com credenciais, igual ServicoContaFake", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    await expect(s.entrar(EMAIL_CONTA_TESTE_DEV, "errada")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("o token de duas chamadas de entrar (mesma conta) é sempre o mesmo — determinístico", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    const sessao1 = await s.entrar(EMAIL_CONTA_TESTE_DEV, SENHA_CONTA_TESTE_DEV);
    const sessao2 = await s.entrar(EMAIL_CONTA_TESTE_DEV, SENHA_CONTA_TESTE_DEV);
    expect(sessao1.token).toBe(sessao2.token);
  });

  it("um token criado numa instância (janela A) é aceito por renovar de outra instância nova (janela B)", async () => {
    const janelaA = new ServicoContaFakeDev(contaTeste());
    const sessaoA = await janelaA.entrar(EMAIL_CONTA_TESTE_DEV, SENHA_CONTA_TESTE_DEV);

    // Janela B: instância NOVA, nunca viu esse token no seu mapa de sessões em memória —
    // só o cofre compartilhado (simulado aqui por passar o mesmo token direto) o conecta à A.
    const janelaB = new ServicoContaFakeDev(contaTeste());
    const sessaoB = await janelaB.renovar(sessaoA.token);

    expect(sessaoB.email).toBe(EMAIL_CONTA_TESTE_DEV);
    expect(sessaoB.plano).toBe("premium");
  });

  it("renovar de token que não bate com nenhuma conta conhecida falha como expirada", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    await expect(s.renovar("tok-qualquer-invalido")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair não explode com token desconhecido", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    await expect(s.sair("tok-qualquer")).resolves.toBeUndefined();
  });

  it("FalhaConta continua sendo a classe de erro (compatível com ServicoConta)", async () => {
    const s = new ServicoContaFakeDev(contaTeste());
    try {
      await s.entrar(EMAIL_CONTA_TESTE_DEV, "errada");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FalhaConta);
    }
  });
});
