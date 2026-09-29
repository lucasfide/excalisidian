// servidor/src/fornecedorIa.test.ts
// Chamada ao fornecedor (doc 18 §5.1, passo 9): corpo enviado, leitura do usage (inclusive
// sem detalhe de cache ou sem usage — cobrança conservadora) e falhas.

import { describe, expect, it, vi } from "vitest";

import type { ConfigIa } from "./config";
import { chamarFornecedor, ehModeloLogico, FalhaFornecedor, tetoDeSaida, type MensagemIa } from "./fornecedorIa";

const IA: ConfigIa = { chave: "sk-teste-secreta", url: "https://fornecedor.exemplo", modelo: "modelo-real" };
const MENSAGENS: MensagemIa[] = [
  { role: "system", content: "sistema" },
  { role: "user", content: "olá mundo" },
];

function fetchQueResponde(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

function corpoOk(usage: unknown) {
  return { choices: [{ message: { role: "assistant", content: "oi" }, finish_reason: "stop" }], usage };
}

describe("modelos e teto de saída", () => {
  it("só os dois modelos lógicos são aceitos", () => {
    expect(ehModeloLogico("leitura-rapida")).toBe(true);
    expect(ehModeloLogico("acompanhamento")).toBe(true);
    expect(ehModeloLogico("modelo-real")).toBe(false);
  });

  it("teto: 2048 sem pedido, respeita pedido menor, limita em 4096", () => {
    expect(tetoDeSaida(undefined)).toBe(2048);
    expect(tetoDeSaida(500)).toBe(500);
    expect(tetoDeSaida(100_000)).toBe(4096);
  });
});

describe("chamarFornecedor — pedido", () => {
  it("POST {url}/chat/completions com Bearer, modelo real, raciocínio desligado e max_tokens", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 10, completion_tokens: 2 }));
    await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fornecedor.exemplo/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-teste-secreta");
    const corpo = JSON.parse(init.body as string);
    expect(corpo).toEqual({
      model: "modelo-real",
      messages: MENSAGENS,
      max_tokens: 500,
      stream: false,
      reasoning: { enabled: false },
      provider: { data_collection: "deny", max_price: { prompt: 0.3, completion: 1.2 } },
    });
  });
});

describe("chamarFornecedor — leitura do usage", () => {
  it("detalhe de cache no topo de usage", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 60, entradaSemCache: 40, saida: 20 });
    expect(r).toMatchObject({ texto: "oi", motivoFim: "stop", tokensEntrada: 100, tokensSaida: 20 });
  });

  it("detalhe de cache dentro de prompt_tokens_details", async () => {
    const f = fetchQueResponde(
      200,
      corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { prompt_cache_hit_tokens: 70 } }),
    );
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 70, entradaSemCache: 30, saida: 20 });
  });

  it("cached_tokens (estilo OpenAI) também vale", async () => {
    const f = fetchQueResponde(
      200,
      corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 50 } }),
    );
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso.entradaComCache).toBe(50);
  });

  it("sem detalhe de cache, toda a entrada conta como sem cache (cobra mais, nunca menos)", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 100, completion_tokens: 20 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 0, entradaSemCache: 100, saida: 20 });
  });

  it("sem usage, estima para cima: entrada = caracteres das mensagens, saída = teto pedido", async () => {
    const f = fetchQueResponde(200, corpoOk(undefined));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    const caracteres = "sistema".length + "olá mundo".length;
    expect(r.uso).toEqual({ entradaComCache: 0, entradaSemCache: caracteres, saida: 500 });
    expect(r.tokensEntrada).toBe(caracteres);
    expect(r.tokensSaida).toBe(500);
  });

  it("cache maior que a entrada é limitado à entrada", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 10, completion_tokens: 1, prompt_cache_hit_tokens: 99 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 10, entradaSemCache: 0, saida: 1 });
  });
});

describe("chamarFornecedor — custo informado", () => {
  const chamar = (usage: unknown) =>
    chamarFornecedor({
      ia: IA,
      fetchImpl: fetchQueResponde(200, corpoOk(usage)) as unknown as typeof fetch,
      mensagens: MENSAGENS,
      maxTokens: 500,
    });

  it("lê usage.cost como custoUsd", async () => {
    expect((await chamar({ prompt_tokens: 10, completion_tokens: 2, cost: 0.000123 })).custoUsd).toBe(0.000123);
    expect((await chamar({ prompt_tokens: 10, completion_tokens: 2, cost: 0 })).custoUsd).toBe(0);
  });

  it("cost ausente ou inválido → undefined", async () => {
    expect((await chamar({ prompt_tokens: 10, completion_tokens: 2 })).custoUsd).toBeUndefined();
    expect((await chamar({ prompt_tokens: 10, completion_tokens: 2, cost: "0,1" })).custoUsd).toBeUndefined();
    expect((await chamar({ prompt_tokens: 10, completion_tokens: 2, cost: -0.1 })).custoUsd).toBeUndefined();
    expect((await chamar(undefined)).custoUsd).toBeUndefined();
  });

  it("cost vale mesmo sem contagem de tokens no usage", async () => {
    expect((await chamar({ cost: 0.5 })).custoUsd).toBe(0.5);
  });

  it("cached_tokens no topo de usage", async () => {
    const r = await chamar({ prompt_tokens: 100, completion_tokens: 20, cached_tokens: 40 });
    expect(r.uso.entradaComCache).toBe(40);
  });
});

describe("chamarFornecedor — falhas viram FalhaFornecedor, sem vazar a chave", () => {
  it("status não-2xx", async () => {
    const f = fetchQueResponde(401, { error: "chave sk-teste-secreta inválida" });
    const erro = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaFornecedor);
    expect(String(erro.message)).not.toContain("sk-teste-secreta");
  });

  it("resposta sem texto", async () => {
    const f = fetchQueResponde(200, { choices: [{ message: { content: "" } }], usage: { prompt_tokens: 1, completion_tokens: 0 } });
    await expect(
      chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });

  it("erro de rede", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });

  it("tempo esgotado", async () => {
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, rejeitar) => {
          init.signal?.addEventListener("abort", () => rejeitar(init.signal!.reason));
        }),
    );
    await expect(
      chamarFornecedor({
        ia: IA,
        fetchImpl: f as unknown as typeof fetch,
        mensagens: MENSAGENS,
        maxTokens: 500,
        tempoMaximoMs: 20,
      }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });
});
