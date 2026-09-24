// src/sync/decisoes.test.ts
//
// Um teste por linha da tabela do doc 17 §6 ("Aplicar uma mudança que veio de fora"), com o
// texto da linha no nome do teste, mais os casos de `mudancasLocais` e `ehBinario` pedidos na
// Task 4 do plano.

import { describe, it, expect } from "vitest";

import { mudancasLocais, acaoParaRemota, ehBinario, type Mudanca } from "./decisoes";
import { EXT_TMP } from "../app/constantes";

describe("acaoParaRemota — tabela do doc 17 §6", () => {
  it('gravar | local == base (não mexi) | grava o remoto; bases = hash', () => {
    const mudanca: Mudanca = { tipo: "gravar", caminho: "nota.md", base: "aaa", hash: "bbb" };
    expect(acaoParaRemota(mudanca, "aaa", "aaa", false)).toBe("gravar");
  });

  it('gravar | arquivo não existe aqui (nunca existiu, base null) | grava o remoto; bases = hash', () => {
    const mudanca: Mudanca = { tipo: "gravar", caminho: "nova.md", base: null, hash: "bbb" };
    expect(acaoParaRemota(mudanca, null, null, false)).toBe("gravar");
  });

  it('gravar | local == hash (já igual) | só bases = hash', () => {
    const mudanca: Mudanca = { tipo: "gravar", caminho: "nota.md", base: "aaa", hash: "bbb" };
    expect(acaoParaRemota(mudanca, "bbb", "aaa", false)).toBe("so-atualizar-base");
  });

  it('gravar | mexi (local != base) | conflito', () => {
    const mudanca: Mudanca = { tipo: "gravar", caminho: "nota.md", base: "aaa", hash: "bbb" };
    expect(acaoParaRemota(mudanca, "ccc", "aaa", false)).toBe("conflito");
  });

  it('apagar | local == base | move para a lixeira deste computador', () => {
    const mudanca: Mudanca = { tipo: "apagar", caminho: "nota.md", base: "aaa" };
    expect(acaoParaRemota(mudanca, "aaa", "aaa", false)).toBe("mover-para-lixeira");
  });

  it('apagar | mexi | não apaga: a versão local será enviada de novo no passo 3', () => {
    const mudanca: Mudanca = { tipo: "apagar", caminho: "nota.md", base: "aaa" };
    expect(acaoParaRemota(mudanca, "ccc", "aaa", false)).toBe("manter-local-e-reenviar");
  });

  it('gravar de arquivo que apaguei aqui | recria o arquivo com a versão remota (apagar nunca vence editar)', () => {
    const mudanca: Mudanca = { tipo: "gravar", caminho: "nota.md", base: "aaa", hash: "bbb" };
    expect(acaoParaRemota(mudanca, null, "aaa", true)).toBe("recriar");
  });

  // Ambiguidade não coberta literalmente pela tabela: "apagar" chega, mas este computador já
  // apagou o mesmo arquivo desde a base (convergência — os dois lados concordam que sumiu).
  // A tabela só cobre "local == base" (mover para lixeira) e "mexi" (manter e reenviar); aqui
  // não há "mexi" (não há conteúdo local para perder) nem "local == base" (base é um hash,
  // local é null). Resolvido como "so-atualizar-base": nenhum texto do usuário está em jogo
  // dos dois lados, e reenviar um "apagar" para um arquivo que já não existe não faria sentido.
  it("apagar | já apaguei aqui também (convergência, sem texto em jogo) | só atualiza a base", () => {
    const mudanca: Mudanca = { tipo: "apagar", caminho: "nota.md", base: "aaa" };
    expect(acaoParaRemota(mudanca, null, "aaa", true)).toBe("so-atualizar-base");
  });
});

describe("mudancasLocais", () => {
  it("arquivo novo (não está em bases) vira gravar com base null", () => {
    const atual = new Map([["nova.md", "hash1"]]);
    const resultado = mudancasLocais(atual, {}, new Set());
    expect(resultado).toEqual([{ tipo: "gravar", caminho: "nova.md", base: null }]);
  });

  it("arquivo editado (hash diferente da base) vira gravar com a base antiga", () => {
    const atual = new Map([["nota.md", "hash2"]]);
    const bases = { "nota.md": "hash1" };
    const resultado = mudancasLocais(atual, bases, new Set());
    expect(resultado).toEqual([{ tipo: "gravar", caminho: "nota.md", base: "hash1" }]);
  });

  it("arquivo apagado (estava em bases, sumiu de atual) vira apagar", () => {
    const bases = { "nota.md": "hash1" };
    const resultado = mudancasLocais(new Map(), bases, new Set());
    expect(resultado).toEqual([{ tipo: "apagar", caminho: "nota.md", base: "hash1" }]);
  });

  it("arquivo igual à base não gera mudança", () => {
    const atual = new Map([["nota.md", "hash1"]]);
    const bases = { "nota.md": "hash1" };
    expect(mudancasLocais(atual, bases, new Set())).toEqual([]);
  });

  it("caminho em conflito aberto fica de fora", () => {
    const atual = new Map([["nota.md", "hash2"]]);
    const bases = { "nota.md": "hash1" };
    expect(mudancasLocais(atual, bases, new Set(["nota.md"]))).toEqual([]);
  });

  it("arquivo dentro de .trash/ fica fora de mudancasLocais", () => {
    const atual = new Map([[".trash/nota.md", "hash1"]]);
    expect(mudancasLocais(atual, {}, new Set())).toEqual([]);
  });

  it(`arquivo temporário (.${EXT_TMP}) fica fora de mudancasLocais`, () => {
    const atual = new Map([[`nota.md.${EXT_TMP}`, "hash1"]]);
    expect(mudancasLocais(atual, {}, new Set())).toEqual([]);
  });

  it("apagado dentro de .trash/ também fica fora (não gera 'apagar' a partir da lixeira)", () => {
    const bases = { ".trash/nota.md": "hash1" };
    expect(mudancasLocais(new Map(), bases, new Set())).toEqual([]);
  });
});

describe("ehBinario", () => {
  it("arquivo .md é texto", () => {
    expect(ehBinario("nota.md")).toBe(false);
  });

  it("arquivo .MD (maiúsculo) é texto", () => {
    expect(ehBinario("nota.MD")).toBe(false);
  });

  it(".draw.md é texto (desenho é markdown)", () => {
    expect(ehBinario("mapa.draw.md")).toBe(false);
  });

  it("imagem é binário", () => {
    expect(ehBinario("foto.png")).toBe(true);
  });

  it("pdf é binário", () => {
    expect(ehBinario("relatorio.pdf")).toBe(true);
  });

  it("arquivo sem extensão é binário", () => {
    expect(ehBinario("LEIAME")).toBe(true);
  });
});
