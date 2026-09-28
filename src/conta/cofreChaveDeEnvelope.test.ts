import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { CofreChaveDeEnvelopeSistema } from "./cofreChaveDeEnvelope";
import { CofreChaveDeEnvelopeFake } from "./CofreChaveDeEnvelopeFake";
import { paraBase64 } from "../sync/base64";

const EMAIL = "ana@exemplo.com";
const OUTRO_EMAIL = "bia@exemplo.com";

describe("CofreChaveDeEnvelopeSistema", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("ler pede o segredo chave-de-envelope, nunca uma string livre", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.ler(EMAIL);
    expect(invokeMock).toHaveBeenCalledWith("ler_token_conta", {
      segredo: "chave-de-envelope",
    });
  });

  it("ler sem entrada no cofre devolve null", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const cofre = new CofreChaveDeEnvelopeSistema();
    expect(await cofre.ler(EMAIL)).toBeNull();
  });

  it("ler decodifica o base64 guardado de volta para os bytes originais quando o e-mail bate", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 255]);
    invokeMock.mockResolvedValueOnce(JSON.stringify({ v: 1, email: EMAIL, chave: paraBase64(bytes) }));
    const cofre = new CofreChaveDeEnvelopeSistema();
    const lido = await cofre.ler(EMAIL);
    expect(lido).toEqual(bytes);
  });

  it("gravar manda o segredo chave-de-envelope com o JSON {v,email,chave} em base64", async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    invokeMock.mockResolvedValueOnce(undefined);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.gravar(EMAIL, bytes);
    expect(invokeMock).toHaveBeenCalledWith("gravar_token_conta", {
      segredo: "chave-de-envelope",
      token: JSON.stringify({ v: 1, email: EMAIL, chave: paraBase64(bytes) }),
    });
  });

  it("gravar normaliza o e-mail (maiúscula/espaços) antes de guardar", async () => {
    const bytes = new Uint8Array([1]);
    invokeMock.mockResolvedValueOnce(undefined);
    const cofre = new CofreChaveDeEnvelopeSistema();
    await cofre.gravar("  Ana@Exemplo.com ", bytes);
    expect(invokeMock).toHaveBeenCalledWith("gravar_token_conta", {
      segredo: "chave-de-envelope",
      token: JSON.stringify({ v: 1, email: EMAIL, chave: paraBase64(bytes) }),
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
    await cofre.gravar(EMAIL, bytes);
    expect(await cofre.ler(EMAIL)).toEqual(bytes);
  });

  it("ler com e-mail diferente do guardado APAGA a entrada e devolve null (Review Focus 1)", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let guardado: string | null = JSON.stringify({ v: 1, email: EMAIL, chave: paraBase64(bytes) });
    invokeMock.mockImplementation(async (comando: string) => {
      if (comando === "ler_token_conta") return guardado;
      if (comando === "apagar_token_conta") {
        guardado = null;
        return undefined;
      }
      throw new Error(`comando inesperado: ${comando}`);
    });
    const cofre = new CofreChaveDeEnvelopeSistema();

    expect(await cofre.ler(OUTRO_EMAIL)).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("apagar_token_conta", { segredo: "chave-de-envelope" });
    // A entrada some de verdade: uma leitura seguinte, mesmo com o e-mail certo, continua null.
    expect(await cofre.ler(EMAIL)).toBeNull();
  });

  it("entrada do formato antigo (base64 puro, sem e-mail) é descartada na leitura", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    let guardado: string | null = paraBase64(bytes); // formato de antes desta mudança
    invokeMock.mockImplementation(async (comando: string) => {
      if (comando === "ler_token_conta") return guardado;
      if (comando === "apagar_token_conta") {
        guardado = null;
        return undefined;
      }
      throw new Error(`comando inesperado: ${comando}`);
    });
    const cofre = new CofreChaveDeEnvelopeSistema();

    expect(await cofre.ler(EMAIL)).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("apagar_token_conta", { segredo: "chave-de-envelope" });
  });
});

describe("CofreChaveDeEnvelopeFake", () => {
  it("começa vazio", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    expect(await cofre.ler(EMAIL)).toBeNull();
  });

  it("grava e lê a mesma chave com o mesmo e-mail", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    const bytes = new Uint8Array([1, 2, 3]);
    await cofre.gravar(EMAIL, bytes);
    expect(await cofre.ler(EMAIL)).toBe(bytes);
  });

  it("ler com e-mail diferente descarta a entrada e devolve null", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    await cofre.gravar(EMAIL, new Uint8Array([1, 2, 3]));
    expect(await cofre.ler(OUTRO_EMAIL)).toBeNull();
    expect(await cofre.ler(EMAIL)).toBeNull(); // a entrada de A já foi descartada
  });

  it("entrada de formato antigo (string simulando base64 puro) é descartada na leitura", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    cofre.bruto = "AbCdEf==";
    expect(await cofre.ler(EMAIL)).toBeNull();
    expect(cofre.bruto).toBeNull();
  });

  it("apagar limpa a chave", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    await cofre.gravar(EMAIL, new Uint8Array([1]));
    await cofre.apagar();
    expect(await cofre.ler(EMAIL)).toBeNull();
  });

  it("com falhar ligado, os três métodos rejeitam", async () => {
    const cofre = new CofreChaveDeEnvelopeFake();
    cofre.falhar = true;
    await expect(cofre.ler(EMAIL)).rejects.toThrow();
    await expect(cofre.gravar(EMAIL, new Uint8Array([1]))).rejects.toThrow();
    await expect(cofre.apagar()).rejects.toThrow();
  });
});
