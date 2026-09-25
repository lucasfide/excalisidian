// src/sync/ServicoSyncHttp.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { definirTokenDaSessao } from "../servico/sessao";
import { deBase64, paraBase64 } from "./base64";
import { ServicoSyncHttp } from "./ServicoSyncHttp";

const BASE = "https://api.exemplo.test/v1";

const resposta = (status: number, corpo: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => corpo }) as Response;

function servico(fetchImpl: typeof fetch) {
  return new ServicoSyncHttp(BASE, fetchImpl);
}

beforeEach(() => {
  definirTokenDaSessao("tok-sessao");
});

afterEach(() => {
  definirTokenDaSessao(null);
});

describe("ServicoSyncHttp", () => {
  describe("sem sessão", () => {
    it("qualquer método lança FalhaSync(sessao) sem chamar fetch", async () => {
      definirTokenDaSessao(null);
      const falso = vi.fn(async () => resposta(200, {}));
      const s = servico(falso as unknown as typeof fetch);

      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));
      await expect(s.criarVault("id-1", new Uint8Array([1]), new Uint8Array([2]))).rejects.toThrow(
        expect.objectContaining({ codigo: "sessao" }),
      );
      await expect(s.baixar("id-1", 0)).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));
      await expect(s.enviarLote("id-1", 0, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "sessao" }),
      );
      await expect(s.enviarRetrato("id-1", 1, [new Uint8Array([1])])).rejects.toThrow(
        expect.objectContaining({ codigo: "sessao" }),
      );
      await expect(s.apagarVault("id-1")).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));

      expect(falso).not.toHaveBeenCalled();
    });
  });

  describe("cabeçalho de autorização", () => {
    it("manda Bearer com o token da sessão atual", async () => {
      const falso = vi.fn(async () => resposta(200, []));
      const s = servico(falso as unknown as typeof fetch);
      await s.listarVaults();
      const [, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-sessao");
    });
  });

  describe("listarVaults", () => {
    it("GET /sync/vaults e decodifica base64", async () => {
      const nomeCifrado = new Uint8Array([10, 20, 30]);
      const envelope = new Uint8Array([40, 50]);
      const falso = vi.fn(async () =>
        resposta(200, [{ id: "v1", nomeCifrado: paraBase64(nomeCifrado), envelope: paraBase64(envelope) }]),
      );
      const s = servico(falso as unknown as typeof fetch);

      const vaults = await s.listarVaults();

      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults`);
      expect(init.method).toBe("GET");
      expect(vaults).toEqual([{ id: "v1", nomeCifrado, envelope }]);
    });

    it("resposta 2xx malformada (não é lista) vira servidor", async () => {
      const falso = vi.fn(async () => resposta(200, { não: "lista" }));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "servidor" }));
    });
  });

  describe("criarVault", () => {
    it("POST /sync/vaults com id, nomeCifrado e envelope em base64", async () => {
      const falso = vi.fn(async () => resposta(200, {}));
      const s = servico(falso as unknown as typeof fetch);
      const nomeCifrado = new Uint8Array([1, 2, 3]);
      const envelope = new Uint8Array([4, 5, 6]);

      await s.criarVault("id-1", nomeCifrado, envelope);

      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        id: "id-1",
        nomeCifrado: paraBase64(nomeCifrado),
        envelope: paraBase64(envelope),
      });
    });

    it("409 com codigo ja-existe vira FalhaSync(ja-existe)", async () => {
      const falso = vi.fn(async () => resposta(409, { codigo: "ja-existe" }));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.criarVault("id-1", new Uint8Array([1]), new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "ja-existe" }),
      );
    });
  });

  describe("baixar", () => {
    it("GET /sync/vaults/{id}/pacotes?apos={n} decodifica lotes, retrato e ultimoRetrato", async () => {
      const bytesLote = new Uint8Array([9, 9, 9]);
      const partesRetrato = [new Uint8Array([1, 1]), new Uint8Array([2, 2])];
      const falso = vi.fn(async () =>
        resposta(200, {
          retrato: { ateSequencia: 5, partes: partesRetrato.map(paraBase64) },
          lotes: [{ sequencia: 6, bytes: paraBase64(bytesLote) }],
          ultimoRetrato: 5,
        }),
      );
      const s = servico(falso as unknown as typeof fetch);

      const resultado = await s.baixar("id-1", 3);

      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults/id-1/pacotes?apos=3`);
      expect(init.method).toBe("GET");
      expect(resultado.ultimoRetrato).toBe(5);
      expect(resultado.retrato).toEqual({ ateSequencia: 5, partes: partesRetrato });
      expect(resultado.lotes).toEqual([{ sequencia: 6, bytes: bytesLote }]);
    });

    it("sem retrato na resposta, ultimoRetrato ainda vem preenchido", async () => {
      const falso = vi.fn(async () => resposta(200, { lotes: [], ultimoRetrato: 0 }));
      const s = servico(falso as unknown as typeof fetch);
      const resultado = await s.baixar("id-1", 0);
      expect(resultado.retrato).toBeUndefined();
      expect(resultado.ultimoRetrato).toBe(0);
    });

    it("resposta 2xx malformada (sem ultimoRetrato) vira servidor", async () => {
      const falso = vi.fn(async () => resposta(200, { lotes: [] }));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.baixar("id-1", 0)).rejects.toThrow(expect.objectContaining({ codigo: "servidor" }));
    });
  });

  describe("enviarLote", () => {
    it("POST /sync/vaults/{id}/lotes com esperoUltima e bytes em base64, devolve sequencia", async () => {
      const bytes = new Uint8Array([7, 8, 9]);
      const falso = vi.fn(async () => resposta(200, { sequencia: 4 }));
      const s = servico(falso as unknown as typeof fetch);

      const sequencia = await s.enviarLote("id-1", 3, bytes);

      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults/id-1/lotes`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ esperoUltima: 3, bytes: paraBase64(bytes) });
      expect(sequencia).toBe(4);
    });

    it("409 com codigo fora-de-ordem vira FalhaSync(fora-de-ordem)", async () => {
      const falso = vi.fn(async () => resposta(409, { codigo: "fora-de-ordem" }));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.enviarLote("id-1", 3, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );
    });

    it("409 com corpo malformado vira servidor", async () => {
      const falso = vi.fn(async () => resposta(409, { outraCoisa: true }));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.enviarLote("id-1", 3, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "servidor" }),
      );
    });

    it("409 sem corpo JSON válido vira servidor", async () => {
      const falso = vi.fn(
        async () =>
          ({
            status: 409,
            ok: false,
            json: async () => {
              throw new Error("no body");
            },
          }) as unknown as Response,
      );
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.enviarLote("id-1", 3, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "servidor" }),
      );
    });
  });

  describe("enviarRetrato", () => {
    it("POST /sync/vaults/{id}/retratos com ateSequencia e partes em base64", async () => {
      const partes = [new Uint8Array([1]), new Uint8Array([2, 3])];
      const falso = vi.fn(async () => resposta(200, {}));
      const s = servico(falso as unknown as typeof fetch);

      await s.enviarRetrato("id-1", 10, partes);

      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults/id-1/retratos`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ ateSequencia: 10, partes: partes.map(paraBase64) });
    });
  });

  describe("apagarVault", () => {
    it("DELETE /sync/vaults/{id}", async () => {
      const falso = vi.fn(async () => resposta(200, {}));
      const s = servico(falso as unknown as typeof fetch);
      await s.apagarVault("id-1");
      const [url, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/sync/vaults/id-1`);
      expect(init.method).toBe("DELETE");
    });
  });

  describe("mapeamento de códigos de erro", () => {
    it("401 vira sessao", async () => {
      const falso = vi.fn(async () => resposta(401, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "sessao" }));
    });

    it("403 vira plano", async () => {
      const falso = vi.fn(async () => resposta(403, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "plano" }));
    });

    it("404 vira nao-encontrado", async () => {
      const falso = vi.fn(async () => resposta(404, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "nao-encontrado" }));
    });

    it("413 vira espaco", async () => {
      const falso = vi.fn(async () => resposta(413, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.enviarLote("id-1", 0, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "espaco" }),
      );
    });

    it("507 vira espaco", async () => {
      const falso = vi.fn(async () => resposta(507, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.enviarLote("id-1", 0, new Uint8Array([1]))).rejects.toThrow(
        expect.objectContaining({ codigo: "espaco" }),
      );
    });

    it("500 vira servidor", async () => {
      const falso = vi.fn(async () => resposta(500, {}));
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "servidor" }));
    });

    it("falha de conexão vira rede", async () => {
      const falso = vi.fn(async () => {
        throw new Error("connection refused");
      });
      const s = servico(falso as unknown as typeof fetch);
      await expect(s.listarVaults()).rejects.toThrow(expect.objectContaining({ codigo: "rede" }));
    });
  });

  describe("bytes idênticos de ida e volta", () => {
    it("baixar devolve os mesmos bytes que o servidor mandou em base64", async () => {
      const original = new Uint8Array(20000);
      for (let i = 0; i < original.length; i++) original[i] = i % 256;
      const falso = vi.fn(async () =>
        resposta(200, { lotes: [{ sequencia: 1, bytes: paraBase64(original) }], ultimoRetrato: 0 }),
      );
      const s = servico(falso as unknown as typeof fetch);
      const resultado = await s.baixar("id-1", 0);
      expect(resultado.lotes[0].bytes).toEqual(original);
      expect(deBase64(paraBase64(original))).toEqual(original);
    });
  });
});
