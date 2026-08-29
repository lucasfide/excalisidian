import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  converterElementoParaTema,
  converterElementosParaTema,
  ehPostit,
  lerPaletaCanvas,
  type MapasTema,
} from "./paletaCanvas";

// Fixture com os 14 tokens normativos (doc 06 §295-334). `environment: "node"` não tem DOM,
// então as funções de conversão são testadas injetando os mapas em vez de ler getComputedStyle
// — só `lerPaletaCanvas`/`lerMapasDeTema` dependem de DOM, e ficam sem cobertura de unidade
// aqui de propósito (cobertas manualmente, ver plano de verificação do doc 09 ADR-12).
const MAPAS_FIXTURE: MapasTema = {
  tracos: {
    "traco-tinta": { claro: "#1c1917", escuro: "#efeae0" },
    "traco-musgo": { claro: "#3e5c46", escuro: "#86a98b" },
    "traco-ocre": { claro: "#a87a1c", escuro: "#d3a845" },
    "traco-bordo": { claro: "#7a2e22", escuro: "#c97b69" },
    "traco-suave": { claro: "#655e54", escuro: "#9a9384" },
  },
  fundos: {
    "fundo-neutro": { claro: "#e5dfd4", escuro: "#272319" },
    "fundo-musgo": { claro: "#cfdbd1", escuro: "#2c3a2f" },
    "fundo-ocre": { claro: "#eddcb4", escuro: "#3d3323" },
    "fundo-bordo": { claro: "#e7cec8", escuro: "#3a2823" },
  },
  postits: {
    "postit-ocre": { claro: "#eddcb4", escuro: "#4a3e28" },
    "postit-musgo": { claro: "#cfdbd1", escuro: "#2f4034" },
    "postit-bordo": { claro: "#e7cec8", escuro: "#4a2f28" },
    "postit-neutro": { claro: "#e5dfd4", escuro: "#312c22" },
  },
};

describe("lerPaletaCanvas fora do navegador", () => {
  it("não lança sem DOM; formato continua correto com hex vazio", () => {
    const paleta = lerPaletaCanvas();
    expect(paleta.tracos).toHaveLength(5);
    expect(paleta.fundos).toHaveLength(5);
    expect(paleta.postits).toHaveLength(4);
    expect(paleta.fundos[0]).toEqual({ nome: "fundo-nenhum", hex: "transparent" });
  });
});

describe("conversão de traços", () => {
  const tracos = Object.values(MAPAS_FIXTURE.tracos);

  it("converte os 5 traços de claro para escuro", () => {
    for (const par of tracos) {
      const el = { type: "line", strokeColor: par.claro };
      const convertido = converterElementoParaTema(el, "escuro", MAPAS_FIXTURE);
      expect(convertido.strokeColor).toBe(par.escuro);
    }
  });

  it("converte os 5 traços de escuro para claro", () => {
    for (const par of tracos) {
      const el = { type: "line", strokeColor: par.escuro };
      const convertido = converterElementoParaTema(el, "claro", MAPAS_FIXTURE);
      expect(convertido.strokeColor).toBe(par.claro);
    }
  });
});

describe("conversão de preenchimentos comuns (não post-it)", () => {
  const fundos = Object.values(MAPAS_FIXTURE.fundos);
  const tintaClaro = MAPAS_FIXTURE.tracos["traco-tinta"].claro;
  const tintaEscuro = MAPAS_FIXTURE.tracos["traco-tinta"].escuro;

  it("converte de claro para escuro em retângulos normais", () => {
    for (const par of fundos) {
      const el = {
        type: "rectangle",
        strokeColor: tintaClaro,
        backgroundColor: par.claro,
        fillStyle: "solid",
      };
      const convertido = converterElementoParaTema(el, "escuro", MAPAS_FIXTURE);
      expect(convertido.backgroundColor).toBe(par.escuro);
    }
  });

  it("converte de escuro para claro em retângulos normais", () => {
    for (const par of fundos) {
      const el = {
        type: "rectangle",
        strokeColor: tintaEscuro,
        backgroundColor: par.escuro,
        fillStyle: "solid",
      };
      const convertido = converterElementoParaTema(el, "claro", MAPAS_FIXTURE);
      expect(convertido.backgroundColor).toBe(par.claro);
    }
  });
});

describe("desambiguação e conversão de post-its", () => {
  it("identifica post-it criado por postit.ts", () => {
    const postit = {
      type: "rectangle",
      backgroundColor: "#eddcb4",
      strokeColor: "#eddcb4",
      fillStyle: "solid",
      roundness: null,
    };
    expect(ehPostit(postit, MAPAS_FIXTURE)).toBe(true);
  });

  it("não confunde retângulo comum com post-it quando roundness != null ou cores diferem", () => {
    const retangulo = {
      type: "rectangle",
      backgroundColor: "#eddcb4",
      strokeColor: "#1c1917",
      fillStyle: "solid",
      roundness: null,
    };
    expect(ehPostit(retangulo, MAPAS_FIXTURE)).toBe(false);

    const retanguloArredondado = {
      type: "rectangle",
      backgroundColor: "#eddcb4",
      strokeColor: "#eddcb4",
      fillStyle: "solid",
      roundness: { type: 3 },
    };
    expect(ehPostit(retanguloArredondado, MAPAS_FIXTURE)).toBe(false);
  });

  it("converte as 4 cores de post-it para as escuras correspondentes (e não para fundo-*)", () => {
    for (const par of Object.values(MAPAS_FIXTURE.postits)) {
      const postit = {
        type: "rectangle",
        backgroundColor: par.claro,
        strokeColor: par.claro,
        fillStyle: "solid",
        roundness: null,
      };
      const convEscuro = converterElementoParaTema(postit, "escuro", MAPAS_FIXTURE);
      expect(convEscuro.backgroundColor).toBe(par.escuro);
      expect(convEscuro.strokeColor).toBe(par.escuro);

      const convClaro = converterElementoParaTema(convEscuro, "claro", MAPAS_FIXTURE);
      expect(convClaro.backgroundColor).toBe(par.claro);
      expect(convClaro.strokeColor).toBe(par.claro);
    }
  });
});

describe("fidelidade de round-trip e preservação de cores não mapeadas", () => {
  it("preserva cores hexadecimais desconhecidas / externas", () => {
    const el = { type: "diamond", strokeColor: "#ff00ea", backgroundColor: "#00ffee" };
    const convertido = converterElementoParaTema(el, "escuro", MAPAS_FIXTURE);
    expect(convertido.strokeColor).toBe("#ff00ea");
    expect(convertido.backgroundColor).toBe("#00ffee");
  });

  it("converte label aninhado com fidelidade", () => {
    const tinta = MAPAS_FIXTURE.tracos["traco-tinta"];
    const el = {
      type: "rectangle",
      strokeColor: tinta.claro,
      backgroundColor: "#e5dfd4",
      label: { text: "olá", strokeColor: tinta.claro },
    };
    const esc = converterElementoParaTema(el, "escuro", MAPAS_FIXTURE);
    expect((esc.label as { strokeColor: string }).strokeColor).toBe(tinta.escuro);

    const cla = converterElementoParaTema(esc, "claro", MAPAS_FIXTURE);
    expect((cla.label as { strokeColor: string }).strokeColor).toBe(tinta.claro);
  });

  it("round-trip claro -> escuro -> claro é fiel para múltiplos elementos", () => {
    const elementos = [
      { type: "text", text: "título", strokeColor: "#1c1917" },
      {
        type: "rectangle",
        strokeColor: "#3e5c46",
        backgroundColor: "#cfdbd1",
        fillStyle: "solid",
      },
      {
        type: "rectangle",
        strokeColor: "#eddcb4",
        backgroundColor: "#eddcb4",
        fillStyle: "solid",
        roundness: null,
      },
      { type: "arrow", strokeColor: "#a87a1c" },
    ];

    const escuros = converterElementosParaTema(elementos, "escuro", MAPAS_FIXTURE);
    const claros = converterElementosParaTema(escuros, "claro", MAPAS_FIXTURE);
    expect(claros).toEqual(elementos);
  });
});

describe("consistência estrutural entre globals.css e a paleta normativa", () => {
  it("todo token --canvas-claro-* tem par --canvas-escuro-* em globals.css", () => {
    const css = readFileSync(join(__dirname, "../estilos/globals.css"), "utf-8");
    const claros = [...css.matchAll(/--canvas-claro-([a-z-]+):/g)].map((m) => m[1]);
    const escuros = new Set(
      [...css.matchAll(/--canvas-escuro-([a-z-]+):/g)].map((m) => m[1]),
    );
    expect(claros.length).toBe(13);
    for (const nome of claros) {
      expect(escuros.has(nome)).toBe(true);
    }
  });
});
