import { describe, expect, it } from "vitest";
import { trocarProvedor, type CamposPorProvedor } from "./rascunhoAgente";
import type { ConfigAgente } from "../../agente/tipos";

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
});
