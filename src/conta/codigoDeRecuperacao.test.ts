import { describe, it, expect } from "vitest";

import {
  gerarCodigoDeRecuperacao,
  formatarCodigo,
  normalizarCodigo,
  codigoValido,
  ALFABETO,
} from "./codigoDeRecuperacao";

const sequencial = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

describe("gerarCodigoDeRecuperacao", () => {
  it("tem 24 caracteres do alfabeto seguro", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(codigo).toHaveLength(24);
    for (const c of codigo) expect(ALFABETO).toContain(c);
  });

  it("não usa caracteres que se confundem à mão", () => {
    for (const ruim of ["0", "O", "1", "I", "L"]) {
      expect(ALFABETO).not.toContain(ruim);
    }
  });

  it("duas chamadas com aleatório real não coincidem", () => {
    expect(gerarCodigoDeRecuperacao()).not.toBe(gerarCodigoDeRecuperacao());
  });
});

describe("formatarCodigo", () => {
  it("quebra em grupos de quatro separados por hífen", () => {
    expect(formatarCodigo("ABCDEFGHJKMNPQRSTUVWXYZ2")).toBe(
      "ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2",
    );
  });
});

describe("normalizarCodigo", () => {
  it("tira hífen, espaço e caixa", () => {
    expect(normalizarCodigo(" abcd-efgh ijkm ")).toBe("ABCDEFGHJKM".slice(0, 11));
  });

  it("um código formatado volta ao original", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(normalizarCodigo(formatarCodigo(codigo))).toBe(codigo);
  });
});

describe("codigoValido", () => {
  it("aceita o código gerado, formatado ou não", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(codigoValido(codigo)).toBe(true);
    expect(codigoValido(formatarCodigo(codigo))).toBe(true);
    expect(codigoValido(formatarCodigo(codigo).toLowerCase())).toBe(true);
  });

  it("recusa comprimento errado", () => {
    expect(codigoValido("ABCD")).toBe(false);
  });

  it("recusa caractere fora do alfabeto", () => {
    expect(codigoValido("0".repeat(24))).toBe(false);
  });
});
