// Doc 11 §12, item 2: os três dialetas montam o request certo e mapeiam status para os
// códigos normalizados. O fetch do plugin-http é simulado; nenhuma chamada de rede real.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

import { cabecalhosBase, completar, listarModelos, textoDoErro } from "./cliente";
import { provedorDe, MODELO_LEITURA } from "./provedores";
import { FalhaAgente } from "./tipos";
import { definirTokenDaSessao } from "../servico/sessao";
import { BASE_URL_SERVICO } from "../servico/base";

function respostaHTTP(status: number, corpo: unknown) {
  return { status, json: async () => corpo };
}

function contexto(provedorId: "openai" | "anthropic" | "gemini") {
  const provedor = provedorDe(provedorId);
  return {
    provedor,
    chave: "chave-teste",
    baseUrl: provedor.baseUrlPadrao,
    modelo: provedorId === "openai" ? "gpt-5.6-luna" : "um-modelo",
    thinking: "baixo" as const,
  };
}

beforeEach(() => fetchMock.mockReset());

describe("cliente — completar", () => {
  it("openai: POST /chat/completions com Bearer e reasoning_effort em gpt-5*", async () => {
    fetchMock.mockResolvedValue(
      respostaHTTP(200, {
        choices: [{ message: { content: "olá" } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );

    const r = await completar({
      ...contexto("openai"),
      system: "sys",
      mensagens: [{ papel: "usuario", texto: "oi" }],
    });

    expect(r).toEqual({ texto: "olá", uso: { tokensEntrada: 10, tokensSaida: 3 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.reasoning_effort).toBe("low");
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(init.headers.Authorization).toBe("Bearer chave-teste");
  });

  it("openai: modelo sem thinking (gpt-4o) não envia reasoning_effort", async () => {
    fetchMock.mockResolvedValue(
      respostaHTTP(200, {
        choices: [{ message: { content: "x" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );

    await completar({
      ...contexto("openai"),
      modelo: "gpt-4o",
      system: "s",
      mensagens: [{ papel: "usuario", texto: "x" }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("anthropic: POST /v1/messages com x-api-key e system separado", async () => {
    fetchMock.mockResolvedValue(
      respostaHTTP(200, {
        content: [{ type: "text", text: "opa" }],
        usage: { input_tokens: 7, output_tokens: 2 },
      }),
    );

    const r = await completar({
      ...contexto("anthropic"),
      system: "sys",
      mensagens: [{ papel: "usuario", texto: "oi" }],
    });

    expect(r.texto).toBe("opa");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("chave-teste");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body);
    expect(body.system).toBe("sys");
    expect(body.max_tokens).toBe(2048);
  });

  it("gemini: chave vai na query e resposta vem de candidates", async () => {
    fetchMock.mockResolvedValue(
      respostaHTTP(200, {
        candidates: [{ content: { parts: [{ text: "gem " }, { text: "erado" }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    );

    const r = await completar({
      ...contexto("gemini"),
      system: "sys",
      mensagens: [{ papel: "usuario", texto: "oi" }],
    });

    expect(r.texto).toBe("gem erado");
    expect(r.uso).toEqual({ tokensEntrada: 5, tokensSaida: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(":generateContent?key=chave-teste");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe("oi");
  });

  it("mapeia status: 401→chave, 429→cota, 404→modelo, 500→provedor", async () => {
    for (const [status, codigo] of [
      [401, "chave"],
      [403, "chave"],
      [429, "cota"],
      [404, "modelo"],
      [503, "provedor"],
    ] as const) {
      fetchMock.mockResolvedValue(respostaHTTP(status, { error: { message: "x" } }));
      const erro = await completar({
        ...contexto("openai"),
        system: "s",
        mensagens: [{ papel: "usuario", texto: "x" }],
      }).catch((e) => e);
      expect(erro).toBeInstanceOf(FalhaAgente);
      expect(erro.codigo).toBe(codigo);
    }
  });

  it("exceção de conexão vira FalhaAgente('rede'); escopo bloqueado vira 'escopo'", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const erro = await completar({
      ...contexto("openai"),
      system: "s",
      mensagens: [{ papel: "usuario", texto: "x" }],
    }).catch((e) => e);
    expect(erro.codigo).toBe("rede");

    fetchMock.mockRejectedValueOnce(new Error("url not allowed on the configured scope"));
    const erro2 = await completar({
      ...contexto("openai"),
      system: "s",
      mensagens: [{ papel: "usuario", texto: "x" }],
    }).catch((e) => e);
    expect(erro2.codigo).toBe("escopo");
  });

  it("corpo sem resposta decifrável vira 'resposta'", async () => {
    fetchMock.mockResolvedValue(respostaHTTP(200, { choices: [] }));
    const erro = await completar({
      ...contexto("openai"),
      system: "s",
      mensagens: [{ papel: "usuario", texto: "x" }],
    }).catch((e) => e);
    expect(erro.codigo).toBe("resposta");
  });
});

describe("cliente — listarModelos", () => {
  it("openai: data[].id (porta OpenRouter, DashScope e Ollama também)", async () => {
    fetchMock.mockResolvedValue(respostaHTTP(200, { data: [{ id: "gpt-5.6-luna" }, { id: "gpt-5.4-mini" }] }));
    expect(await listarModelos(contexto("openai"))).toEqual(["gpt-5.6-luna", "gpt-5.4-mini"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("anthropic: GET /v1/models com x-api-key", async () => {
    fetchMock.mockResolvedValue(respostaHTTP(200, { data: [{ id: "claude-x" }] }));
    expect(await listarModelos(contexto("anthropic"))).toEqual(["claude-x"]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-api-key"]).toBe("chave-teste");
  });

  it("gemini: models[].name sem o prefixo models/", async () => {
    fetchMock.mockResolvedValue(
      respostaHTTP(200, { models: [{ name: "models/gemini-flash" }, { name: "models/gemini-pro" }] }),
    );
    expect(await listarModelos(contexto("gemini"))).toEqual(["gemini-flash", "gemini-pro"]);
  });
});

describe("cliente — textoDoErro", () => {
  it("cada código chega em português do Brasil, sem stack trace", () => {
    expect(textoDoErro(new FalhaAgente("chave"))).toContain("chave da API");
    expect(textoDoErro(new FalhaAgente("cota"))).toContain("limitou");
    expect(textoDoErro(new FalhaAgente("modelo"))).toContain("modelo");
    expect(textoDoErro(new FalhaAgente("escopo"))).toContain("base URL");
    expect(textoDoErro(new Error("genérica"))).toContain("Não foi possível falar com o provedor.");
  });
});

describe("autenticação por sessão", () => {
  afterEach(() => definirTokenDaSessao(null));

  it("provedor que exige conta usa o token da sessão como Bearer", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("excalisidian"),
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer tok-abc");
  });

  it("provedor que exige conta ignora chave digitada, se alguém puser uma", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("excalisidian"),
      chave: "sk-nao-deveria-ser-usada",
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer tok-abc");
  });

  it("sem sessão, falha com código próprio em vez de chamar sem autenticação", () => {
    expect(() =>
      cabecalhosBase({
        provedor: provedorDe("excalisidian"),
        baseUrl: BASE_URL_SERVICO,
        modelo: MODELO_LEITURA,
        thinking: "padrao",
      }),
    ).toThrow(expect.objectContaining({ codigo: "sessao" }));
  });

  it("provedor de chave própria continua usando a chave digitada", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("openai"),
      chave: "sk-minha",
      baseUrl: "https://api.openai.com/v1",
      modelo: "gpt-5.4-mini",
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer sk-minha");
  });

  it("gemini com exigeConta (hipotético) sem sessão: listarModelos falha com 'sessao', sem chamada de rede", async () => {
    const provedorGeminiExigeConta = { ...provedorDe("gemini"), exigeConta: true };
    await expect(
      listarModelos({
        provedor: provedorGeminiExigeConta,
        baseUrl: provedorDe("gemini").baseUrlPadrao,
        modelo: "um-modelo",
        thinking: "padrao",
      }),
    ).rejects.toEqual(expect.objectContaining({ codigo: "sessao" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
