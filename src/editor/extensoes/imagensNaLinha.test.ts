import { describe, it, expect } from "vitest";

import {
  embedComLargura,
  embedsNaLinha,
  larguraDoAlias,
  linhaSoDeEmbeds,
  mudancasParaMover,
  type DestinoImagem,
  type DocLinhas,
} from "./imagensNaLinha";

function docDe(texto: string): DocLinhas {
  const linhas = texto.split("\n");
  const inicios: number[] = [];
  let pos = 0;
  for (const l of linhas) {
    inicios.push(pos);
    pos += l.length + 1;
  }
  return {
    lines: linhas.length,
    line: (n) => ({ from: inicios[n - 1], to: inicios[n - 1] + linhas[n - 1].length, text: linhas[n - 1] }),
  };
}

function mover(texto: string, origem: { linha: number; indice: number }, destino: DestinoImagem) {
  const mudancas = mudancasParaMover(docDe(texto), origem, destino);
  if (!mudancas) return null;
  let saida = texto;
  for (const m of [...mudancas].reverse()) saida = saida.slice(0, m.from) + m.insert + saida.slice(m.to);
  return saida;
}

describe("embedsNaLinha", () => {
  it("acha embeds, alvo e alias", () => {
    const e = embedsNaLinha("![[a.png|300]] ![[b.png]]");
    expect(e.map((x) => [x.alvo, x.alias])).toEqual([["a.png", "300"], ["b.png", undefined]]);
    expect(e[1].de).toBe(15);
  });

  it("linha só de embeds, ignorando espaço", () => {
    const t = " ![[a.png]]  ![[b.png]] ";
    expect(linhaSoDeEmbeds(t, embedsNaLinha(t))).toBe(true);
    const u = "olha ![[a.png]]";
    expect(linhaSoDeEmbeds(u, embedsNaLinha(u))).toBe(false);
  });

  it("largura do alias e reescrita", () => {
    expect(larguraDoAlias("400x300")).toBe(400);
    expect(larguraDoAlias(undefined)).toBeNull();
    expect(embedComLargura("anexos/a.png", 399.6)).toBe("![[anexos/a.png|400]]");
    expect(embedComLargura("anexos/a.png", null)).toBe("![[anexos/a.png]]");
  });
});

describe("mudancasParaMover", () => {
  const base = "texto\n![[a.png]]\n![[b.png]]\nfim";

  it("solta ao lado de outra: junta na mesma linha e apaga a linha de origem", () => {
    expect(mover(base, { linha: 3, indice: 0 }, { tipo: "lado", linha: 2, indice: 0, lado: "depois" })).toBe(
      "texto\n![[a.png]] ![[b.png]]\nfim",
    );
    expect(mover(base, { linha: 2, indice: 0 }, { tipo: "lado", linha: 3, indice: 0, lado: "antes" })).toBe(
      "texto\n![[a.png]] ![[b.png]]\nfim",
    );
  });

  it("reordena na mesma linha", () => {
    const t = "![[a.png]] ![[b.png]] ![[c.png]]";
    expect(mover(t, { linha: 1, indice: 0 }, { tipo: "lado", linha: 1, indice: 2, lado: "depois" })).toBe(
      "![[b.png]] ![[c.png]] ![[a.png]]",
    );
    expect(mover(t, { linha: 1, indice: 2 }, { tipo: "lado", linha: 1, indice: 0, lado: "antes" })).toBe(
      "![[c.png]] ![[a.png]] ![[b.png]]",
    );
  });

  it("separa para uma linha própria", () => {
    const t = "![[a.png]] ![[b.png]]\nfim";
    expect(mover(t, { linha: 1, indice: 1 }, { tipo: "linha", linha: 1, posicao: "depois" })).toBe(
      "![[a.png]]\n![[b.png]]\nfim",
    );
  });

  it("move linha sozinha para depois de outra", () => {
    expect(mover(base, { linha: 2, indice: 0 }, { tipo: "linha", linha: 4, posicao: "depois" })).toBe(
      "texto\n![[b.png]]\nfim\n![[a.png]]",
    );
  });

  it("soltar no próprio lugar não muda nada", () => {
    const t = "![[a.png]] ![[b.png]]";
    expect(mudancasParaMover(docDe(t), { linha: 1, indice: 0 }, { tipo: "lado", linha: 1, indice: 1, lado: "antes" })).toBeNull();
    expect(mudancasParaMover(docDe(base), { linha: 2, indice: 0 }, { tipo: "linha", linha: 1, posicao: "depois" })).toBeNull();
  });
});
