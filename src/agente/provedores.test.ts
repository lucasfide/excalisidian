// Doc 11 §12, itens 1 e 3: catálogo puro.
import { describe, it, expect } from "vitest";

import {
  PROVEDORES,
  provedorDe,
  baseUrlEfetiva,
  modeloComThinking,
  mapearThinking,
  validarBaseUrl,
  mascararChave,
} from "./provedores";
import type { ProvedorId } from "./tipos";

describe("provedores", () => {
  it("o catálogo tem os seis provedores da decisão", () => {
    const ids = PROVEDORES.map((p) => p.id);
    expect(new Set(ids)).toEqual(
      new Set<ProvedorId>(["openai", "anthropic", "gemini", "openrouter", "alibaba", "ollama"]),
    );
  });

  it("provedorDe de id desconhecido lança", () => {
    expect(() => provedorDe("nada" as ProvedorId)).toThrow();
  });

  it("baseUrlEfetiva: override por provedor vence; vazio cai no padrão", () => {
    expect(baseUrlEfetiva("ollama", { ollama: "http://192.168.0.10:11434/v1" })).toBe(
      "http://192.168.0.10:11434/v1",
    );
    expect(baseUrlEfetiva("ollama", { openai: "https://x.example" })).toBe(
      "http://localhost:11434/v1",
    );
  });

  it("só ollama não exige chave", () => {
    expect(provedorDe("ollama").precisaChave).toBe(false);
    expect(provedorDe("openai").precisaChave).toBe(true);
  });

  it("modeloComThinking: gpt-5* e família o no dialeto openai; nada nos outros", () => {
    expect(modeloComThinking("openai", "gpt-5.6-luna")).toBe(true);
    expect(modeloComThinking("openai", "gpt-5.4-mini")).toBe(true);
    expect(modeloComThinking("openai", "o4-mini")).toBe(true);
    expect(modeloComThinking("openai", "gpt-4o")).toBe(false);
    expect(modeloComThinking("anthropic", "gpt-5.6-luna")).toBe(false);
    expect(modeloComThinking("openai", "  GPT-5.4-PRO  ")).toBe(true);
  });

  it("mapearThinking traduz para reasoning_effort; padrão omite", () => {
    expect(mapearThinking("padrao")).toBeUndefined();
    expect(mapearThinking("baixo")).toBe("low");
    expect(mapearThinking("medio")).toBe("medium");
    expect(mapearThinking("alto")).toBe("high");
    expect(mapearThinking("minimal")).toBe("minimal");
  });

  it("validarBaseUrl aceita http(s), rejeita o resto", () => {
    expect(validarBaseUrl("")).toBeNull();
    expect(validarBaseUrl("  https://gateway.minhaempresa.com/v1  ")).toBeNull();
    expect(validarBaseUrl("http://localhost:11434/v1")).toBeNull();
    expect(validarBaseUrl("ftp://x")).not.toBeNull();
    expect(validarBaseUrl("api.openai.com")).not.toBeNull();
    expect(validarBaseUrl("javascript:alert(1)")).not.toBeNull();
  });

  it("mascararChave mostra só o rabo", () => {
    expect(mascararChave("sk-proj-abcdefghij")).toBe("sk-…ghij");
    expect(mascararChave("abc")).toBe("••••");
  });
});
