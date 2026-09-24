// src/ui/excalisidian/abasPreferencias.test.ts
// Lógica pura de navegação das abas de `DialogoPreferencias` (sem testing-library/jsdom —
// só a lógica, testada em isolamento; ver o comentário de topo de `abasPreferencias.ts`).

import { describe, it, expect } from "vitest";

import {
  ABAS_PREFERENCIAS,
  abaInicial,
  abaPorTecla,
  agruparResultadosBusca,
  correspondeBusca,
  entradasBusca,
  normalizarBusca,
  type EntradaBusca,
} from "./abasPreferencias";
import type { TradutorDoApp } from "../../i18n/catalogo";

describe("abaInicial", () => {
  it("secaoInicial vence a última aba usada", () => {
    expect(abaInicial("conta", "agente")).toBe("conta");
  });

  it("sem secaoInicial nem última aba, cai em geral", () => {
    expect(abaInicial(undefined)).toBe("geral");
  });

  it("sem secaoInicial, reabre a última aba usada", () => {
    expect(abaInicial(undefined, "aparencia")).toBe("aparencia");
  });
});

describe("abaPorTecla", () => {
  it("seta para baixo avança e volta ao início no fim da lista", () => {
    expect(abaPorTecla("geral", "ArrowDown")).toBe("aparencia");
    expect(abaPorTecla("agente", "ArrowDown")).toBe("geral");
  });

  it("seta para cima recua e volta ao fim no início da lista", () => {
    expect(abaPorTecla("aparencia", "ArrowUp")).toBe("geral");
    expect(abaPorTecla("geral", "ArrowUp")).toBe("agente");
  });

  it("seta para a direita se comporta como seta para baixo", () => {
    expect(abaPorTecla("agente", "ArrowRight")).toBe("geral");
  });

  it("seta para a esquerda se comporta como seta para cima", () => {
    expect(abaPorTecla("geral", "ArrowLeft")).toBe("agente");
  });

  it("Home vai para a primeira aba", () => {
    expect(abaPorTecla("agente", "Home")).toBe("geral");
  });

  it("End vai para a última aba", () => {
    expect(abaPorTecla("geral", "End")).toBe("agente");
  });

  it("tecla que não navega devolve null", () => {
    expect(abaPorTecla("geral", "a")).toBeNull();
    expect(abaPorTecla("geral", "Tab")).toBeNull();
  });

  it("a lista de abas está na ordem esperada", () => {
    expect(ABAS_PREFERENCIAS).toEqual(["geral", "aparencia", "conta", "agente"]);
  });
});

describe("normalizarBusca", () => {
  it("remove acento", () => {
    expect(normalizarBusca("Agência")).toBe("agencia");
  });

  it("ignora caixa", () => {
    expect(normalizarBusca("JÁ")).toBe("ja");
  });

  it("apara espaço nas pontas", () => {
    expect(normalizarBusca("  café  ")).toBe("cafe");
  });

  it("string vazia continua vazia", () => {
    expect(normalizarBusca("")).toBe("");
  });
});

describe("correspondeBusca", () => {
  it("consulta vazia casa tudo", () => {
    expect(correspondeBusca("", ["qualquer coisa"])).toBe(true);
  });

  it("consulta só com espaço casa tudo", () => {
    expect(correspondeBusca("   ", ["qualquer coisa"])).toBe(true);
  });

  it("ignora acento e caixa", () => {
    expect(correspondeBusca("AGENCIA", ["Agência de IA"])).toBe(true);
  });

  it("várias palavras podem casar em textos diferentes", () => {
    expect(correspondeBusca("tema claro", ["Tema", "Sistema acompanha o modo claro"])).toBe(true);
  });

  it("palavra ausente não casa", () => {
    expect(correspondeBusca("tema roxo", ["Tema escuro"])).toBe(false);
  });

  it("sem textos e consulta não vazia não casa", () => {
    expect(correspondeBusca("tema", [])).toBe(false);
  });
});

describe("agruparResultadosBusca", () => {
  const FIXTURE: EntradaBusca[] = [
    { id: "g1", aba: "geral", textos: ["Nome", "saudação"] },
    { id: "g2", aba: "geral", textos: ["Idioma", "idioma língua"] },
    { id: "a1", aba: "aparencia", textos: ["Tema", "claro escuro"] },
    { id: "c1", aba: "conta", textos: ["Conta", "entrar sair"] },
    { id: "ag1", aba: "agente", textos: ["Agente", "chave api"] },
  ];

  it("consulta vazia agrupa tudo, na ordem das abas", () => {
    expect(agruparResultadosBusca("", FIXTURE)).toEqual([
      { aba: "geral", ids: ["g1", "g2"] },
      { aba: "aparencia", ids: ["a1"] },
      { aba: "conta", ids: ["c1"] },
      { aba: "agente", ids: ["ag1"] },
    ]);
  });

  it("só os grupos com entrada casada aparecem", () => {
    expect(agruparResultadosBusca("tema", FIXTURE)).toEqual([{ aba: "aparencia", ids: ["a1"] }]);
  });

  it("grupo sem entrada casada não aparece", () => {
    expect(agruparResultadosBusca("nao existe nisso tudo", FIXTURE)).toEqual([]);
  });

  it("palavras da consulta podem casar em textos diferentes da mesma entrada", () => {
    expect(agruparResultadosBusca("agente chave", FIXTURE)).toEqual([
      { aba: "agente", ids: ["ag1"] },
    ]);
  });

  it("ignora acento e caixa", () => {
    expect(agruparResultadosBusca("SAUDAÇÃO", FIXTURE)).toEqual([{ aba: "geral", ids: ["g1"] }]);
  });
});

describe("entradasBusca", () => {
  // Tradutor de identidade: devolve a própria chave. Testa a ESTRUTURA do registro (quais ids
  // existem em cada estado do agente), não a redação — a redação é coberta pelo catálogo
  // (catalogo.test.ts, cobertura.test.ts).
  const t: TradutorDoApp = (chave) => chave;

  it("sem agente configurado, só a entrada 'agente.configurar'", () => {
    const entradas = entradasBusca(t, { agenteConfigurado: false, agenteHabilitado: false });
    const idsAgente = entradas.filter((e) => e.aba === "agente").map((e) => e.id);
    expect(idsAgente).toEqual(["agente.configurar"]);
  });

  it("com agente configurado e desligado, uma entrada por linha, sem 'conexão'", () => {
    const entradas = entradasBusca(t, { agenteConfigurado: true, agenteHabilitado: false });
    const idsAgente = entradas.filter((e) => e.aba === "agente").map((e) => e.id);
    expect(idsAgente).toEqual(["agente.agente", "agente.modelos", "agente.pasta", "agente.memoria"]);
  });

  it("com agente ligado, a entrada 'conexão' aparece também", () => {
    const entradas = entradasBusca(t, { agenteConfigurado: true, agenteHabilitado: true });
    const idsAgente = entradas.filter((e) => e.aba === "agente").map((e) => e.id);
    expect(idsAgente).toEqual([
      "agente.agente",
      "agente.modelos",
      "agente.conexao",
      "agente.pasta",
      "agente.memoria",
    ]);
  });

  it("geral, aparência e conta sempre presentes, uma entrada cada exceto geral", () => {
    const entradas = entradasBusca(t, { agenteConfigurado: false, agenteHabilitado: false });
    expect(entradas.filter((e) => e.aba === "geral").map((e) => e.id)).toEqual([
      "geral.nome",
      "geral.idioma",
      "geral.atalhos",
      "geral.atualizacoes",
    ]);
    expect(entradas.filter((e) => e.aba === "aparencia").map((e) => e.id)).toEqual([
      "aparencia.tema",
      "aparencia.largura",
    ]);
    expect(entradas.filter((e) => e.aba === "conta").map((e) => e.id)).toEqual(["conta"]);
  });

  it("cada entrada carrega textos não vazios (título/descrição/termos resolvidos pelo t)", () => {
    const entradas = entradasBusca(t, { agenteConfigurado: true, agenteHabilitado: true });
    for (const entrada of entradas) {
      expect(entrada.textos.length).toBeGreaterThan(0);
      for (const texto of entrada.textos) expect(texto.length).toBeGreaterThan(0);
    }
  });
});
