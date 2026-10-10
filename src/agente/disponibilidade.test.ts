import { describe, expect, it } from "vitest";

import { configUsavel, provedorDisponivel } from "./disponibilidade";
import { provedorDe } from "./provedores";
import type { ConfigAgente } from "./tipos";
import { SERVICOS_ONLINE_LIBERADOS } from "../servico/base";

function config(provedor: ConfigAgente["provedor"]): ConfigAgente {
  return { provedor, habilitado: true } as ConfigAgente;
}

describe("disponibilidade dos provedores (serviços online em beta)", () => {
  it("o app é publicado com os serviços online desligados", () => {
    expect(SERVICOS_ONLINE_LIBERADOS).toBe(false);
  });

  it("com a chave desligada, a IA do Excalisidian fica indisponível e as demais não", () => {
    expect(provedorDisponivel(provedorDe("excalisidian"), false)).toBe(false);
    expect(provedorDisponivel(provedorDe("openai"), false)).toBe(true);
  });

  it("com a chave ligada, todos ficam disponíveis", () => {
    expect(provedorDisponivel(provedorDe("excalisidian"), true)).toBe(true);
  });

  it("config salva com a IA do Excalisidian vira agente não configurado quando desligado", () => {
    expect(configUsavel(config("excalisidian"), false)).toBeNull();
  });

  it("config salva com outro provedor, ou com a chave ligada, é mantida", () => {
    const outra = config("openai");
    expect(configUsavel(outra, false)).toBe(outra);
    const propria = config("excalisidian");
    expect(configUsavel(propria, true)).toBe(propria);
  });

  it("sem config, continua sem config", () => {
    expect(configUsavel(null, false)).toBeNull();
  });
});
