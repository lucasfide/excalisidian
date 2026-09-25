// src/sync/decisaoLigar.test.ts
import { describe, it, expect } from "vitest";

import { decidirLigar, type EntradaDecisaoLigar } from "./decisaoLigar";

const BASE: EntradaDecisaoLigar = {
  vaultAberto: true,
  temEstadoSync: true,
  contaCarregada: true,
  premium: true,
  temChaveNoCofre: true,
};

describe("decidirLigar", () => {
  it("liga quando tudo está pronto", () => {
    expect(decidirLigar(BASE)).toBe("ligar");
  });

  it("não liga sem vault aberto, mesmo com o resto pronto", () => {
    expect(decidirLigar({ ...BASE, vaultAberto: false })).toEqual({ naoLigar: "sem-vault" });
  });

  it("não liga sem EstadoSync neste computador (vault não sincronizado aqui)", () => {
    expect(decidirLigar({ ...BASE, temEstadoSync: false })).toEqual({
      naoLigar: "sem-estado-sync",
    });
  });

  it("sem vault E sem EstadoSync: o motivo é a falta de vault (checado primeiro)", () => {
    expect(decidirLigar({ ...BASE, vaultAberto: false, temEstadoSync: false })).toEqual({
      naoLigar: "sem-vault",
    });
  });

  it("espera a conta carregar antes de concluir qualquer coisa sobre o plano", () => {
    expect(decidirLigar({ ...BASE, contaCarregada: false })).toBe("esperar-conta");
  });

  it("conta ainda carregando e sem premium (plano() cai em 'gratis' no boot): ainda espera, não conclui 'sem premium'", () => {
    expect(decidirLigar({ ...BASE, contaCarregada: false, premium: false })).toBe(
      "esperar-conta",
    );
  });

  it("conta ainda carregando e sem chave no cofre: ainda espera, não conclui 'sem chave'", () => {
    expect(decidirLigar({ ...BASE, contaCarregada: false, temChaveNoCofre: false })).toBe(
      "esperar-conta",
    );
  });

  it("não liga sem sessão premium (grátis ou sem conta) depois que a conta carregou", () => {
    expect(decidirLigar({ ...BASE, premium: false })).toEqual({ naoLigar: "sem-premium" });
  });

  it("não liga premium sem a chaveDeEnvelope no cofre deste computador", () => {
    expect(decidirLigar({ ...BASE, temChaveNoCofre: false })).toEqual({
      naoLigar: "sem-chave-no-cofre",
    });
  });

  it("prioriza vault > EstadoSync > conta carregada > premium > chave no cofre", () => {
    // sem vault, sem estado, conta não carregada, sem premium, sem chave: só "sem-vault".
    expect(
      decidirLigar({
        vaultAberto: false,
        temEstadoSync: false,
        contaCarregada: false,
        premium: false,
        temChaveNoCofre: false,
      }),
    ).toEqual({ naoLigar: "sem-vault" });

    // com vault, sem estado, conta não carregada, sem premium, sem chave: "sem-estado-sync".
    expect(
      decidirLigar({
        vaultAberto: true,
        temEstadoSync: false,
        contaCarregada: false,
        premium: false,
        temChaveNoCofre: false,
      }),
    ).toEqual({ naoLigar: "sem-estado-sync" });
  });
});
