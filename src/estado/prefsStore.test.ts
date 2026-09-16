import { describe, it, expect, beforeEach, vi } from "vitest";

const { armazenado } = vi.hoisted(() => ({ armazenado: new Map<string, unknown>() }));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    async get<T>(chave: string) {
      return armazenado.get(chave) as T | undefined;
    },
    async set(chave: string, valor: unknown) {
      armazenado.set(chave, valor);
    },
    async save() {},
  }),
}));

const emitMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => emitMock(...args),
}));

import { usePrefsStore } from "./prefsStore";

beforeEach(() => {
  armazenado.clear();
  emitMock.mockClear();
  usePrefsStore.setState({
    tema: "sistema",
    larguraNota: "media",
    sidebarColapsada: false,
    nomeUsuario: null,
    carregado: false,
  });
});

describe("prefsStore", () => {
  it("carrega 'sistema' como padrão quando não há nada salvo", async () => {
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().tema).toBe("sistema");
    expect(usePrefsStore.getState().carregado).toBe(true);
  });

  it("definirTema aplica na hora e persiste; carregar depois lê o valor salvo", async () => {
    usePrefsStore.getState().definirTema("escuro");
    expect(usePrefsStore.getState().tema).toBe("escuro");

    // `definirTema` salva em segundo plano (não bloqueia a UI) — dá um respiro pro
    // microtask da escrita terminar antes de simular a "próxima sessão".
    await new Promise((r) => setTimeout(r, 0));

    // Nova "sessão": zera o estado em memória, carrega do que foi salvo.
    usePrefsStore.setState({ tema: "sistema", carregado: false });
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().tema).toBe("escuro");

    // Doc 12 §6: outras janelas precisam saber que o tema mudou.
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
  });

  it("ignora um valor salvo inválido, mantendo o padrão", async () => {
    armazenado.set("tema", "roxo-neon");
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().tema).toBe("sistema");
  });

  it("larguraNota: padrão 'media', persiste e ignora valor inválido", async () => {
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().larguraNota).toBe("media");

    usePrefsStore.getState().definirLarguraNota("full");
    await new Promise((r) => setTimeout(r, 0));

    usePrefsStore.setState({ larguraNota: "media", carregado: false });
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().larguraNota).toBe("full");
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");

    armazenado.set("larguraNota", "gigante");
    usePrefsStore.setState({ larguraNota: "media", carregado: false });
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().larguraNota).toBe("media");
  });

  it("sidebarColapsada: padrão false, alternarSidebar persiste", async () => {
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().sidebarColapsada).toBe(false);

    usePrefsStore.getState().alternarSidebar();
    expect(usePrefsStore.getState().sidebarColapsada).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    usePrefsStore.setState({ sidebarColapsada: false, carregado: false });
    await usePrefsStore.getState().carregar();
    expect(usePrefsStore.getState().sidebarColapsada).toBe(true);

    // Doc 04 §5.1 e doc 12 §6 listam sidebar colapsada entre as preferências compartilhadas.
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
  });

  describe("nomeUsuario", () => {
    it("carrega null quando nada foi salvo (nunca informado)", async () => {
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBeNull();
    });

    it("carrega a string salva, incluindo vazia (informado, sem nome)", async () => {
      armazenado.set("nomeUsuario", "Lucas");
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBe("Lucas");

      armazenado.set("nomeUsuario", "");
      usePrefsStore.setState({ nomeUsuario: null, carregado: false });
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBe("");
    });

    it("trata valor salvo que não é string como nunca informado", async () => {
      armazenado.set("nomeUsuario", 42);
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBeNull();
    });

    it("definirNomeUsuario aplica na hora, corta espaços e persiste; emite prefs-mudou", async () => {
      usePrefsStore.getState().definirNomeUsuario("  Lucas  ");
      expect(usePrefsStore.getState().nomeUsuario).toBe("Lucas");
      await new Promise((r) => setTimeout(r, 0));

      usePrefsStore.setState({ nomeUsuario: null, carregado: false });
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBe("Lucas");
      expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
    });

    it("definirNomeUsuario com string vazia grava '' (informado, sem nome), não null", async () => {
      usePrefsStore.getState().definirNomeUsuario("   ");
      expect(usePrefsStore.getState().nomeUsuario).toBe("");
      await new Promise((r) => setTimeout(r, 0));

      usePrefsStore.setState({ nomeUsuario: null, carregado: false });
      await usePrefsStore.getState().carregar();
      expect(usePrefsStore.getState().nomeUsuario).toBe("");
    });
  });
});
