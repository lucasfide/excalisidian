import { describe, expect, it } from "vitest";
import { deveMostrarConviteEmAviso } from "./localConvite";

const base = {
  habilitado: true,
  painelAberto: false,
  caminhoConvite: "notas/a.md",
  caminhoConversa: "notas/a.md",
};

describe("onde o convite do agente aparece", () => {
  it("vira aviso no canto quando o painel do agente está fechado", () => {
    expect(deveMostrarConviteEmAviso(base)).toBe(true);
  });

  it("não vira aviso com o painel do agente aberto: o convite fica dentro do painel", () => {
    expect(deveMostrarConviteEmAviso({ ...base, painelAberto: true })).toBe(false);
  });

  it("não aparece sem convite, com agente desligado ou em outra nota", () => {
    expect(deveMostrarConviteEmAviso({ ...base, caminhoConvite: null })).toBe(false);
    expect(deveMostrarConviteEmAviso({ ...base, habilitado: false })).toBe(false);
    expect(deveMostrarConviteEmAviso({ ...base, caminhoConversa: "notas/b.md" })).toBe(false);
  });
});
