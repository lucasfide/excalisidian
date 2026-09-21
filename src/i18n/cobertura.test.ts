// src/i18n/cobertura.test.ts
// Trava de manutenção: o inglês não pode ficar para trás do português.
//
// Enquanto a migração dos módulos continua, PT_BR cresce a cada tarefa. Este teste não
// conta chaves (seria quebrar a cada commit) — ele cobra que TODA chave do português tenha
// tradução. Chave nova sem inglês quebra o teste na hora, que é quando é barato consertar.

import { describe, it, expect } from "vitest";

import { PT_BR, EN } from "./catalogo";

describe("cobertura de tradução", () => {
  it("toda chave em português tem tradução em inglês", () => {
    const semTraducao = Object.keys(PT_BR).filter((chave) => !(chave in EN));
    expect(semTraducao).toEqual([]);
  });
});
