import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { CofreChaveDeEnvelopeSistema } from "./cofreChaveDeEnvelope";
import { CofreChaveDeEnvelopeFake } from "./CofreChaveDeEnvelopeFake";
import { paraBase64 } from "../sync/base64";

describe("CofreChaveDeEnvelopeSistema", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("ler pede o segredo chave-de-envelope, nunca uma string livre", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.ler();
    expect(invokeMock).toHaveBeenCalledWith("ler_token_conta", {
      segredo: "chave-de-envelope",
    });
  });

  it("ler sem entrada no cofre devolve null", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const cofre = new CofreChaveDeEnvelopeSistema();
    expect(await cofre.ler()).toBeNull();
  });

  it("ler decodifica o base64 guardado de volta para os bytes originais", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 255]);
    invokeMock.mockResolvedValueOnce(paraBase64(bytes));
    const cofre = new CofreChaveDeEnvelopeSistema();
    const lido = await cofre.ler();
    expect(lido).toEqual(bytes);
  });

  it("gravar manda o segredo chave-de-envelope e os bytes em base64", async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    invokeMock.mockResolvedValueOnce(undefined);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.gravar(bytes);
    expect(invokeMock).toHaveBeenCalledWith("gravar_token_conta", {
      segredo: "chave-de-envelope",
      token: paraBase64(bytes),
    });
  });

  it("apagar manda o segredo chave-de-envelope", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.apagar();
    expect(invokeMock).toHaveBeenCalledWith("apagar_token_conta", {
      segredo: "chave-de-envelope",
    });
  });

  it("ida e volta pelo cofre preserva os bytes exatos (inclusive 0x00 e 0xff)", async () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256;
    let guardado: string | null = null;
    invokeMock.mockImplementation(async (comando: string, args: Record<string, unknown>) => {
      if (comando === "gravar_token_conta") {
        guardado = args.token as string;
        return undefined;
      }
      if (comando === "ler_token_conta") return guardado;
      throw new Error(`comando inesperado: ${comando}`);
    });
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.gravar(bytes);
    expect(await cofre.ler()).toEqual(bytes);
  });
});

describe("CofreChaveDeEnvelopeFake", () => {
  it("começa vazio", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    expect(await cofre.ler()).toBeNull();
  });

  it("grava e lê a mesma chave", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    const bytes = new Uint8Array([1, 2, 3]);
    await cofre.gravar(bytes);
    expect(await cofre.ler()).toBe(bytes);
  });

  it("apagar limpa a chave", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    await cofre.gravar(new Uint8Array([1]));
    await cofre.apagar();
    expect(await cofre.ler()).toBeNull();
  });

  it("com falhar ligado, os três métodos rejeitam", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    cofre.falhar = true;
    await expect(cofre.ler()).rejects.toThrow();
    await expect(cofre.gravar(new Uint8Array([1]))).rejects.toThrow();
    await expect(cofre.apagar()).rejects.toThrow();
  });
});
