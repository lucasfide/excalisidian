// servidor/src/fornecedorIa.test.ts
// Chamada ao fornecedor (doc 18 §5.1, passo 9): corpo enviado, leitura do usage (inclusive
// sem detalhe de cache ou sem usage — cobrança conservadora) e falhas.

import { describe, expect, it, vi } from "vitest";

import type { ConfigIa } from "./config";
import {
  chamarComTentativa,
  chamarFornecedor,
  ehModeloLogico,
  FalhaFornecedor,
  tetoDeSaida,
  type MensagemIa,
} from "./fornecedorIa";

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

// Corpo de erro do OpenRouter cujo texto ecoa o prompt: nada disso pode chegar ao registro.
const ECO = "TEXTO-SECRETO-DA-NOTA";
function corpoErro(code: number) {
  return { error: { code, message: `prompt inválido: ${ECO}`, metadata: { provider_name: "Fireworks", raw: ECO } } };
}

async function falhaDe(f: unknown, extra: Partial<Parameters<typeof chamarFornecedor>[0]> = {}): Promise<FalhaFornecedor> {
  const erro = await chamarFornecedor({
    ia: IA,
    fetchImpl: f as typeof fetch,
    mensagens: MENSAGENS,
    maxTokens: 500,
    ...extra,
  }).catch((e) => e);
  expect(erro).toBeInstanceOf(FalhaFornecedor);
  return erro;
}

describe("chamarFornecedor — o que a falha carrega para o registro", () => {
  it("http: status, código e nome do provedor do corpo de erro; nunca a mensagem nem o raw", async () => {
    const erro = await falhaDe(fetchQueResponde(502, corpoErro(502)));
    expect(erro).toMatchObject({ motivo: "http", statusFornecedor: 502, codigoErroFornecedor: 502, provedorEscolhido: "Fireworks" });
    expect(JSON.stringify({ ...erro, message: erro.message })).not.toContain(ECO);
    expect(erro.message).not.toContain("sk-teste-secreta");
  });

  it("http com corpo que não é JSON: só o status", async () => {
    const f = vi.fn(async () => new Response(`<html>${ECO}</html>`, { status: 503 }));
    const erro = await falhaDe(f);
    expect(erro).toMatchObject({ motivo: "http", statusFornecedor: 503 });
    expect(erro.codigoErroFornecedor).toBeUndefined();
    expect(JSON.stringify({ ...erro, message: erro.message })).not.toContain(ECO);
  });

  it("código e provedor com formato estranho (texto livre) são descartados", async () => {
    const erro = await falhaDe(
      fetchQueResponde(500, {
        error: { code: ECO, metadata: { provider_name: `${ECO} ${ECO} ${ECO} ${ECO} ${ECO} ${ECO}` } },
      }),
    );
    expect(erro.codigoErroFornecedor).toBeUndefined();
    expect(erro.provedorEscolhido).toBeUndefined();
  });

  it("rede, tempo e json", async () => {
    const rede = await falhaDe(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(rede.motivo).toBe("rede");
    const tempo = await falhaDe(
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((_r, rej) => init.signal?.addEventListener("abort", () => rej(init.signal!.reason))),
      ),
      { tempoMaximoMs: 20 },
    );
    expect(tempo.motivo).toBe("tempo");
    const json = await falhaDe(vi.fn(async () => new Response("não é json", { status: 200 })));
    expect(json.motivo).toBe("json");
  });

  it("sem texto: motivo, id da geração, provedor, motivo de fim e tokens", async () => {
    const erro = await falhaDe(
      fetchQueResponde(200, {
        id: "gen-abc123",
        provider: "Fireworks",
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 10, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 4 } },
      }),
    );
    expect(erro).toMatchObject({
      motivo: "sem_texto",
      idGeracao: "gen-abc123",
      provedorEscolhido: "Fireworks",
      motivoFim: "length",
      tokensEntrada: 10,
      tokensSaida: 500,
      tokensCache: 4,
    });
  });

  it("sucesso: detalhe com id, provedor, motivo de fim e cache", async () => {
    const f = fetchQueResponde(200, {
      id: "gen-xyz",
      provider: "Together",
      choices: [{ message: { content: "oi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 60 } },
    });
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.detalhe).toEqual({ idGeracao: "gen-xyz", provedorEscolhido: "Together", motivoFim: "stop", tokensCache: 60 });
  });

  it("id e provedor fora do formato esperado são omitidos", async () => {
    const f = fetchQueResponde(200, {
      id: ECO.repeat(10),
      provider: `${ECO} ${ECO} ${ECO} ${ECO} ${ECO} ${ECO}`,
      choices: [{ message: { content: "oi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.detalhe.idGeracao).toBeUndefined();
    expect(r.detalhe.provedorEscolhido).toBeUndefined();
  });
});

describe("chamarComTentativa — uma nova tentativa", () => {
  const ok = () => new Response(JSON.stringify(corpoOk({ prompt_tokens: 10, completion_tokens: 2 })), { status: 200 });
  function relogioFalso() {
    let t = 0;
    return { agora: () => t, avancar: (ms: number) => (t += ms) };
  }
  const chamar = (f: unknown, relogio: () => number) =>
    chamarComTentativa({ ia: IA, fetchImpl: f as typeof fetch, mensagens: MENSAGENS, maxTokens: 500, relogio });

  it("sem falha: uma tentativa só", async () => {
    const f = vi.fn(async () => ok());
    const r = await chamar(f, relogioFalso().agora);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.tentativas).toBe(1);
    expect(r.resposta.texto).toBe("oi");
  });

  it("502 rápido, depois sucesso: duas chamadas, tentativas 2", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 502 })).mockResolvedValueOnce(ok());
    const r = await chamar(f, relogioFalso().agora);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.tentativas).toBe(2);
  });

  it("429, 500 e rede também tentam de novo; a falha final carrega tentativas 2", async () => {
    const primeiras = [
      async () => new Response("{}", { status: 429 }),
      async () => new Response("{}", { status: 500 }),
      async (): Promise<Response> => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const primeira of primeiras) {
      const f = vi
        .fn()
        .mockImplementationOnce(primeira)
        .mockImplementationOnce(async () => new Response("{}", { status: 502 }));
      const erro = await chamar(f, relogioFalso().agora).catch((e) => e);
      expect(f).toHaveBeenCalledTimes(2);
      expect(erro).toBeInstanceOf(FalhaFornecedor);
      expect(erro.tentativas).toBe(2);
      expect(erro.statusFornecedor).toBe(502);
    }
  });

  it("tempo esgotado rápido também tenta de novo, e a segunda usa só o que sobrou dos 90 s", async () => {
    const r = relogioFalso();
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      if (n === 1) {
        r.avancar(10_000);
        throw new DOMException("tempo", "TimeoutError");
      }
      return ok();
    });
    const espiaTimeout = vi.spyOn(AbortSignal, "timeout");
    const res = await chamar(f, r.agora);
    const limites = espiaTimeout.mock.calls.map((c) => c[0]);
    espiaTimeout.mockRestore();
    expect(res.tentativas).toBe(2);
    expect(limites).toEqual([90_000, 80_000]);
  });

  it("400, 401 e 404 não tentam de novo", async () => {
    for (const status of [400, 401, 404]) {
      const f = vi.fn(async () => new Response("{}", { status }));
      const erro = await chamar(f, relogioFalso().agora).catch((e) => e);
      expect(f).toHaveBeenCalledTimes(1);
      expect(erro.tentativas).toBe(1);
    }
  });

  it("json inválido e resposta sem texto não tentam de novo", async () => {
    const a = vi.fn(async () => new Response("x", { status: 200 }));
    await chamar(a, relogioFalso().agora).catch(() => {});
    expect(a).toHaveBeenCalledTimes(1);
    const b = fetchQueResponde(200, { choices: [{ message: { content: "" } }] });
    await chamar(b, relogioFalso().agora).catch(() => {});
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("falha aos 15 s (ou depois) não tenta de novo; aos 14,9 s tenta", async () => {
    for (const [gasto, chamadas] of [
      [15_000, 1],
      [20_000, 1],
      [14_900, 2],
    ] as const) {
      const r = relogioFalso();
      const f = vi.fn(async () => {
        r.avancar(gasto);
        return new Response("{}", { status: 502 });
      });
      await chamar(f, r.agora).catch(() => {});
      expect(f).toHaveBeenCalledTimes(chamadas);
    }
  });
});
