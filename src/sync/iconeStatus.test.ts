// src/sync/iconeStatus.test.ts
import { describe, it, expect } from "vitest";

import { iconeDeStatusSync, corDeStatusSync } from "./iconeStatus";
import type { StatusSync } from "../estado/syncStore";

describe("iconeDeStatusSync", () => {
  it("mapeia cada StatusSync para o ícone do doc 06", () => {
    expect(iconeDeStatusSync("sincronizado")).toBe("cloud-check");
    expect(iconeDeStatusSync("sincronizando")).toBe("refresh-cw");
    expect(iconeDeStatusSync("sem-conexao")).toBe("cloud-off");
    expect(iconeDeStatusSync("pausado")).toBe("pause");
    expect(iconeDeStatusSync({ erro: "sessao" })).toBe("alert-triangle");
    expect(iconeDeStatusSync({ erro: "plano" })).toBe("alert-triangle");
    expect(iconeDeStatusSync({ erro: "espaco" })).toBe("alert-triangle");
  });
});

describe("corDeStatusSync", () => {
  it("repouso (sincronizado, sincronizando): tinta-media sem opacidade", () => {
    expect(corDeStatusSync("sincronizado")).toEqual({ token: "tinta-media", opacidade50: false });
    expect(corDeStatusSync("sincronizando")).toEqual({
      token: "tinta-media",
      opacidade50: false,
    });
  });

  it("sem-conexao: ocre (atenção)", () => {
    expect(corDeStatusSync("sem-conexao")).toEqual({ token: "ocre", opacidade50: false });
  });

  it("pausado: tinta-media a 50%", () => {
    expect(corDeStatusSync("pausado")).toEqual({ token: "tinta-media", opacidade50: true });
  });

  it("erro que pede ação: bordo", () => {
    const erros: StatusSync[] = [{ erro: "sessao" }, { erro: "plano" }, { erro: "espaco" }];
    for (const erro of erros) {
      expect(corDeStatusSync(erro)).toEqual({ token: "bordo", opacidade50: false });
    }
  });
});
