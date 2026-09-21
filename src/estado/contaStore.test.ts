import { describe, it, expect, beforeEach, vi } from "vitest";

import { useContaStore } from "./contaStore";
import { ServicoContaFake } from "../conta/ServicoContaFake";
import { tokenDaSessaoAtual, definirTokenDaSessao } from "../servico/sessao";

const guardados: Record<string, unknown> = {};

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => guardados[k],
    set: async (k: string, v: unknown) => {
      guardados[k] = v;
    },
    delete: async (k: string) => {
      delete guardados[k];
    },
    save: async () => {},
  }),
}));

const comConta = () =>
  new ServicoContaFake({ "ana@exemplo.com": { senha: "segredo123", plano: "premium" } });

describe("contaStore", () => {
  beforeEach(() => {
    for (const k of Object.keys(guardados)) delete guardados[k];
    definirTokenDaSessao(null);
    useContaStore.setState({ sessao: null, carregado: false, ocupado: false, erro: null });
    useContaStore.getState().definirServico(comConta());
  });

  it("começa sem sessão", () => {
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().plano()).toBe("gratis");
  });

  it("entrar guarda a sessão e espelha o token no porta-token", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    expect(useContaStore.getState().sessao?.email).toBe("ana@exemplo.com");
    expect(useContaStore.getState().plano()).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("entrar persiste só o token, nunca a senha nem o email", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(guardados.tokenConta).toBe(useContaStore.getState().sessao?.token);
    expect(JSON.stringify(guardados)).not.toContain("segredo123");
    expect(JSON.stringify(guardados)).not.toContain("ana@exemplo.com");
  });

  it("entrar com senha errada guarda o código do erro e não abre sessão", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "errada");
    expect(ok).toBe(false);
    expect(useContaStore.getState().erro).toBe("credenciais");
    expect(useContaStore.getState().sessao).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("sair limpa estado, disco e porta-token", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    await useContaStore.getState().sair();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(guardados.tokenConta).toBeUndefined();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("carregar sem token salvo termina sem sessão e marca carregado", async () => {
    await useContaStore.getState().carregar();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().carregado).toBe(true);
  });

  it("carregar com token salvo renova e traz o plano do servidor", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const inicial = await servico.entrar("ana@exemplo.com", "segredo123");
    guardados.tokenConta = inicial.token;

    await useContaStore.getState().carregar();

    expect(useContaStore.getState().sessao?.plano).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("carregar com token morto limpa o disco em silêncio, sem erro na tela", async () => {
    guardados.tokenConta = "tok-que-nao-existe";
    await useContaStore.getState().carregar();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().erro).toBeNull();
    expect(guardados.tokenConta).toBeUndefined();
    expect(tokenDaSessaoAtual()).toBeNull();
  });
});
