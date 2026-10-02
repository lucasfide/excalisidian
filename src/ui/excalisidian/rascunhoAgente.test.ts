import { describe, expect, it } from "vitest";
import {
  montarConfigAgente,
  quantidadeEtapas,
  provedorInicial,
  rascunhoInicial,
  trocarProvedor,
  type CamposPorProvedor,
} from "./rascunhoAgente";
import type { ConfigAgente } from "../../agente/tipos";
import { MODELO_ACOMPANHAMENTO, MODELO_LEITURA } from "../../agente/provedores";

const config = {
  habilitado: true,
  provedor: "openai",
  chaves: { openai: "sk-a", anthropic: "sk-b" },
  baseUrls: { anthropic: "https://x.test" },
  modeloGateiro: "g1",
  modeloAssistente: "a1",
  thinking: "padrao",
  webSearch: false,
  tetoDiarioUsd: null,
} as unknown as ConfigAgente;

const base: CamposPorProvedor = {
  provedor: "openai",
  chave: "sk-digitada",
  baseUrl: "https://velha.test",
  modeloGateiro: "g1",
  modeloAssistente: "a1",
};

describe("trocarProvedor", () => {
  it("mesmo provedor não apaga nada", () => {
    expect(trocarProvedor(base, "openai", config)).toBe(base);
  });
  it("outro provedor descarta chave digitada, usa a base salva e zera modelos", () => {
    const r = trocarProvedor(base, "anthropic", config);
    expect(r).toEqual({
      provedor: "anthropic",
      chave: "",
      baseUrl: "https://x.test",
      modeloGateiro: "",
      modeloAssistente: "",
    });
  });
  it("voltar ao provedor salvo recupera os modelos salvos", () => {
    const r = trocarProvedor({ ...base, provedor: "anthropic" }, "openai", config);
    expect(r.modeloGateiro).toBe("g1");
    expect(r.modeloAssistente).toBe("a1");
    expect(r.baseUrl).toBe("");
  });
  it("sem configuração: tudo vazio", () => {
    const r = trocarProvedor(base, "gemini" as never, null);
    expect(r).toMatchObject({ chave: "", baseUrl: "", modeloGateiro: "", modeloAssistente: "" });
  });
  it("ao selecionar IA própria preenche os modelos lógicos fixos", () => {
    const r = trocarProvedor(base, "excalisidian", config);
    expect(r).toMatchObject({ modeloGateiro: MODELO_LEITURA, modeloAssistente: MODELO_ACOMPANHAMENTO });
  });
});

describe("rascunho e configuração final", () => {
  it("primeira configuração seleciona IA própria quando está disponível", () => {
    const r = rascunhoInicial(null, true);
    expect(r).toMatchObject({
      provedor: "excalisidian",
      modeloGateiro: MODELO_LEITURA,
      modeloAssistente: MODELO_ACOMPANHAMENTO,
      thinking: "padrao",
      webSearch: false,
      teto: "",
    });
    expect(provedorInicial(null, true)).toBe("excalisidian");
  });

  it("não seleciona provedor de conta que não aparece na lista", () => {
    expect(provedorInicial(null, false)).toBe("openai");
    expect(rascunhoInicial(null, false).provedor).toBe("openai");
  });

  it("usa dois passos próprios e preserva cinco externos", () => {
    expect(quantidadeEtapas(true)).toBe(2);
    expect(quantidadeEtapas(false)).toBe(5);
  });

  it("normaliza IA própria e mantém credenciais e URLs dos provedores externos", () => {
    const configComHeranca: ConfigAgente = {
      ...config,
      provedor: "excalisidian",
      chaves: { openai: "sk-openai", excalisidian: "chave-antiga" },
      baseUrls: { openai: "https://custom.openai.test", excalisidian: "https://host-antigo.test" },
      modeloGateiro: "modelo-externo",
      modeloAssistente: "modelo-externo-2",
      thinking: "alto",
      webSearch: true,
      tetoDiarioUsd: 12,
    };
    const r = rascunhoInicial(configComHeranca, true);
    const final = montarConfigAgente(
      { ...r, baseUrl: "https://host-digitado.test" },
      configComHeranca,
      "https://host-digitado.test",
    );
    expect(final).toMatchObject({
      provedor: "excalisidian",
      modeloGateiro: MODELO_LEITURA,
      modeloAssistente: MODELO_ACOMPANHAMENTO,
      thinking: "padrao",
      webSearch: false,
      tetoDiarioUsd: null,
      chaves: { openai: "sk-openai" },
      baseUrls: { openai: "https://custom.openai.test" },
    });
    expect(final.chaves).not.toHaveProperty("excalisidian");
    expect(final.baseUrls).not.toHaveProperty("excalisidian");
  });

  it("salva configuração externa mantendo chave existente e base URL customizada", () => {
    const r = {
      ...base,
      chave: "",
      thinking: "alto" as const,
      webSearch: false,
      teto: "2.5",
    };
    const final = montarConfigAgente(r, config, "https://custom.test");
    expect(final.chaves).toMatchObject({ openai: "sk-a", anthropic: "sk-b" });
    expect(final.baseUrls).toMatchObject({ anthropic: "https://x.test", openai: "https://custom.test" });
    expect(final).toMatchObject({ provedor: "openai", thinking: "alto", tetoDiarioUsd: 2.5 });
  });
});
