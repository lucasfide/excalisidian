import { describe, it, expect } from "vitest";

import {
  gerarCodigoDeRecuperacao,
  formatarCodigo,
  normalizarCodigo,
  codigoValido,
  ALFABETO,
} from "./codigoDeRecuperacao";

const sequencial = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

// Bytes que atravessam a fronteira do alfabeto (comprimento 31): abaixo de 31, exatamente
// 31, valores entre 31 e 255, e 255. Com o gerador `sequencial` (bytes 0 a 23) todo byte é
// menor que 31, então `bytes[i] % ALFABETO.length` nunca reduz nada — a volta do resto não
// é exercitada. As expectativas abaixo foram calculadas à mão a partir do alfabeto, não
// recalculadas com `% ALFABETO.length`, para não provar só que a função concorda consigo
// mesma.
const bytesComFronteira = Uint8Array.from([
  0, 5, 30, 31, 32, 61, 62, 63, 92, 93, 94, 100, 123, 124, 150, 180, 200, 217, 218, 240,
  247, 248, 254, 255,
]);
const comFronteira = (n: number) => bytesComFronteira.slice(0, n);

describe("gerarCodigoDeRecuperacao", () => {
  it("tem 24 caracteres do alfabeto seguro", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(codigo).toHaveLength(24);
    for (const c of codigo) expect(ALFABETO).toContain(c);
  });

  it("dá a volta no alfabeto para bytes maiores que 31 (0=A, 31=A, 32=B, 255=H)", () => {
    // ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", índice 0=A 1=B 2=C 3=D 4=E 5=F 6=G
    // 7=H 8=J 9=K 10=M 11=N 12=P 13=Q 14=R 15=S 16=T 17=U 18=V 19=W 20=X 21=Y 22=Z 23=2
    // 24=3 25=4 26=5 27=6 28=7 29=8 30=9.
    // byte 0   -> índice 0  -> A
    // byte 5   -> índice 5  -> F
    // byte 30  -> índice 30 -> 9
    // byte 31  -> índice 0  -> A   (fronteira exata: 31 dá a volta pra 0)
    // byte 32  -> índice 1  -> B
    // byte 61  -> índice 30 -> 9
    // byte 62  -> índice 0  -> A
    // byte 63  -> índice 1  -> B
    // byte 92  -> índice 30 -> 9
    // byte 93  -> índice 0  -> A
    // byte 94  -> índice 1  -> B
    // byte 100 -> índice 7  -> H
    // byte 123 -> índice 30 -> 9
    // byte 124 -> índice 0  -> A
    // byte 150 -> índice 26 -> 5
    // byte 180 -> índice 25 -> 4
    // byte 200 -> índice 14 -> R
    // byte 217 -> índice 0  -> A
    // byte 218 -> índice 1  -> B
    // byte 240 -> índice 23 -> 2
    // byte 247 -> índice 30 -> 9
    // byte 248 -> índice 0  -> A
    // byte 254 -> índice 6  -> G
    // byte 255 -> índice 7  -> H
    expect(gerarCodigoDeRecuperacao(comFronteira)).toBe("AF9AB9AB9ABH9A54RAB29AGH");
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
