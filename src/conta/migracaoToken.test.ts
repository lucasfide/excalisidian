// src/conta/migracaoToken.test.ts
import { describe, it, expect } from "vitest";

import { CofreTokenFake } from "./CofreTokenFake";
import { lerTokenComMigracao, type TokenLegado } from "./migracaoToken";
import type { CofreToken } from "./cofreToken";

/** Legado falso simples: guarda um token em memória e conta as chamadas, para os testes
 * verificarem "intocado" vs. "apagado". */
class LegadoFake implements TokenLegado {
  chamadasLer = 0;
  chamadasApagar = 0;

  constructor(private token: string | null) {}

  async ler(): Promise<string | null> {
    this.chamadasLer++;
    return this.token;
  }

  async apagar(): Promise<void> {
    this.chamadasApagar++;
    this.token = null;
  }
}

describe("lerTokenComMigracao", () => {
  it("sem nada em lugar nenhum: devolve null e não escreve nada", async () => {
    const cofre = new CofreTokenFake();
    const legado = new LegadoFake(null);

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBeNull();
    expect(cofre.token).toBeNull();
    expect(legado.chamadasApagar).toBe(0);
  });

  it("só o cofre tem token: devolve o do cofre, legado intocado", async () => {
    const cofre = new CofreTokenFake();
    cofre.token = "tok-cofre";
    const legado = new LegadoFake(null);

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBe("tok-cofre");
    expect(legado.chamadasApagar).toBe(0);
  });

  it("só o legado tem token: grava no cofre, apaga o legado, devolve o token", async () => {
    const cofre = new CofreTokenFake();
    const legado = new LegadoFake("tok-legado");

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBe("tok-legado");
    expect(cofre.token).toBe("tok-legado");
    expect(legado.chamadasApagar).toBe(1);
  });

  it("os dois têm token: fica o do cofre, legado apagado, cofre não é regravado", async () => {
    const cofre = new CofreTokenFake();
    cofre.token = "tok-cofre";
    const legado = new LegadoFake("tok-legado");

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBe("tok-cofre");
    expect(cofre.token).toBe("tok-cofre");
    expect(legado.chamadasApagar).toBe(1);
  });

  it("cofre falha ao gravar: legado é apagado mesmo assim, devolve o token do legado", async () => {
    const cofre: CofreToken = {
      ler: async () => null,
      gravar: async () => {
        throw new Error("cofre indisponível");
      },
      apagar: async () => {},
    };
    const legado = new LegadoFake("tok-legado");

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBe("tok-legado");
    expect(legado.chamadasApagar).toBe(1);
  });

  it("cofre falha ao ler, com legado presente: devolve o legado e apaga o legado", async () => {
    const cofre: CofreToken = {
      ler: async () => {
        throw new Error("cofre indisponível");
      },
      gravar: async () => {},
      apagar: async () => {},
    };
    const legado = new LegadoFake("tok-legado");

    const resultado = await lerTokenComMigracao(cofre, legado);

    expect(resultado).toBe("tok-legado");
    expect(legado.chamadasApagar).toBe(1);
  });
});
