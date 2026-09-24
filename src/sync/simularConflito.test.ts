// src/sync/simularConflito.test.ts
import { describe, it, expect, vi } from "vitest";

import {
  simularConflito,
  conflitosDeTeste,
  CAMINHO_NOTA_TESTE,
  CAMINHO_DESENHO_TESTE,
  type DepsSimulacao,
} from "./simularConflito";
import { diffLinhas } from "./diffLinhas";
import { lerCenaDeConflito } from "./cenaDeConflito";
import type { Conflito } from "./tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

// Mesmo padrão do fake usado em conflitosStore.test.ts: guarda o que foi escrito num Map,
// pra o teste conferir tanto o conjunto de caminhos tocados quanto o conteúdo exato.
// `existe`/`lerTexto` lêem do mesmo Map, pra simular um arquivo já presente no vault antes
// de `simularConflito` rodar (arquivo de verdade do usuário, ou de uma rodada anterior).
function adaptadorFalso(preexistentes?: Record<string, string>) {
  const arquivos = new Map<string, string>(Object.entries(preexistentes ?? {}));
  const escreverTexto = vi.fn(async (caminho: string, conteudo: string) => {
    arquivos.set(caminho, conteudo);
  });
  const existe = vi.fn(async (caminho: string) => arquivos.has(caminho));
  const lerTexto = vi.fn(async (caminho: string) => {
    const conteudo = arquivos.get(caminho);
    if (conteudo === undefined) throw new Error(`arquivo não existe: ${caminho}`);
    return conteudo;
  });
  return {
    escreverTexto,
    existe,
    lerTexto,
    arquivos,
  } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    existe: typeof existe;
    lerTexto: typeof lerTexto;
    arquivos: Map<string, string>;
  };
}

// Deps falsas: registram árvore/índice sem tocar o vaultStore real.
function depsFalso() {
  const arvoreChamadas: string[] = [];
  const reindexadas: string[] = [];
  const recarregarArvore = vi.fn(async () => {
    arvoreChamadas.push("recarregou");
  });
  const reindexarArquivo = vi.fn(async (caminho: string) => {
    reindexadas.push(caminho);
  });
  return {
    recarregarArvore,
    reindexarArquivo,
    arvoreChamadas,
    reindexadas,
  } satisfies DepsSimulacao & { arvoreChamadas: string[]; reindexadas: string[] };
}

describe("conflitosDeTeste", () => {
  it("monta um conflito de nota e um de desenho, nos dois caminhos de teste", () => {
    const [nota, desenho] = conflitosDeTeste();
    expect(nota.caminho).toBe(CAMINHO_NOTA_TESTE);
    expect(nota.tipo).toBe("nota");
    expect(desenho.caminho).toBe(CAMINHO_DESENHO_TESTE);
    expect(desenho.tipo).toBe("desenho");
  });

  it("a versão remota difere da local nos dois conflitos", () => {
    const [nota, desenho] = conflitosDeTeste();
    expect(nota.remoto.conteudo).not.toBe(nota.local.conteudo);
    expect(desenho.remoto.conteudo).not.toBe(desenho.local.conteudo);
  });

  it("a nota de teste tem as três formas de diferença: alterada (pareada), só-remota e só-local", () => {
    const [nota] = conflitosDeTeste();
    const trechos = diffLinhas(nota.local.conteudo, nota.remoto.conteudo);

    // Par removido -> adicionado (linha alterada, comparada lado a lado).
    const temPar = trechos.some(
      (t, i) => t.tipo === "removido" && trechos[i + 1]?.tipo === "adicionado",
    );
    expect(temPar).toBe(true);

    // Um trecho "adicionado" que não é a metade de um par (não imediatamente precedido de
    // "removido") — só existe na remota.
    const temAdicionadoIsolado = trechos.some(
      (t, i) => t.tipo === "adicionado" && trechos[i - 1]?.tipo !== "removido",
    );
    expect(temAdicionadoIsolado).toBe(true);

    // Um trecho "removido" que não é a metade de um par (não imediatamente seguido de
    // "adicionado") — só existe na local.
    const temRemovidoIsolado = trechos.some(
      (t, i) => t.tipo === "removido" && trechos[i + 1]?.tipo !== "adicionado",
    );
    expect(temRemovidoIsolado).toBe(true);
  });

  it("o desenho de teste é lido sem erro pelo leitor de cena, nas duas versões", () => {
    const [, desenho] = conflitosDeTeste();

    const local = lerCenaDeConflito(desenho.local.conteudo);
    expect(local.ok).toBe(true);
    if (local.ok) expect(local.cena.elements).toHaveLength(1);

    const remoto = lerCenaDeConflito(desenho.remoto.conteudo);
    expect(remoto.ok).toBe(true);
    if (remoto.ok) expect(remoto.cena.elements).toHaveLength(2);
  });
});

describe("simularConflito", () => {
  it("caminho inexistente: grava nos dois nomes-base, sem numerar", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    const resultado = await simularConflito(
      adaptador,
      (c) => registrados.push(c),
      new Date(),
      depsFalso(),
    );

    expect(resultado.caminhoNota).toBe(CAMINHO_NOTA_TESTE);
    expect(resultado.caminhoDesenho).toBe(CAMINHO_DESENHO_TESTE);
    expect([...adaptador.arquivos.keys()].sort()).toEqual(
      [CAMINHO_NOTA_TESTE, CAMINHO_DESENHO_TESTE].sort(),
    );
  });

  it("o conteúdo gravado de cada arquivo é idêntico ao local.conteudo do conflito registrado", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c), new Date(), depsFalso());

    expect(registrados).toHaveLength(2);
    for (const conflito of registrados) {
      expect(adaptador.arquivos.get(conflito.caminho)).toBe(conflito.local.conteudo);
    }
  });

  it("registra um conflito de nota e um de desenho, cada um apontando pro caminho real gravado", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c), new Date(), depsFalso());

    expect(registrados.map((c) => c.tipo).sort()).toEqual(["desenho", "nota"]);
    expect(registrados.map((c) => c.caminho).sort()).toEqual(
      [CAMINHO_NOTA_TESTE, CAMINHO_DESENHO_TESTE].sort(),
    );
  });

  it("recarrega a árvore uma vez e reindexa os dois caminhos gravados", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();

    const resultado = await simularConflito(adaptador, () => {}, new Date(), deps);

    expect(deps.arvoreChamadas).toEqual(["recarregou"]);
    expect(deps.reindexadas.sort()).toEqual(
      [resultado.caminhoNota, resultado.caminhoDesenho].sort(),
    );
  });

  it("rodar duas vezes seguidas: a segunda rodada numera em vez de sobrescrever a primeira", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    const r1 = await simularConflito(
      adaptador,
      (c) => registrados.push(c),
      new Date(),
      depsFalso(),
    );
    const r2 = await simularConflito(
      adaptador,
      (c) => registrados.push(c),
      new Date(),
      depsFalso(),
    );

    expect(r1.caminhoNota).toBe(CAMINHO_NOTA_TESTE);
    expect(r1.caminhoDesenho).toBe(CAMINHO_DESENHO_TESTE);
    expect(r2.caminhoNota).toBe("Excalisidian - conflito de teste (2).md");
    expect(r2.caminhoDesenho).toBe("Excalisidian - conflito de teste (2).draw.md");

    // as quatro gravações convivem — nada foi sobrescrito.
    expect(adaptador.arquivos.size).toBe(4);
    expect(registrados).toHaveLength(4);
  });

  it("arquivo de verdade do usuário com o nome de teste: a simulação numera e o arquivo do usuário fica intacto byte a byte", async () => {
    const conteudoDoUsuario =
      "# Nota de verdade do usuário\n\nConteúdo importante, não gerado pelo teste.";
    const adaptador = adaptadorFalso({ [CAMINHO_NOTA_TESTE]: conteudoDoUsuario });
    const registrados: Conflito[] = [];

    const resultado = await simularConflito(
      adaptador,
      (c) => registrados.push(c),
      new Date(),
      depsFalso(),
    );

    // a nota do usuário nunca é tocada — a simulação nasce em "... (2).md".
    expect(resultado.caminhoNota).toBe("Excalisidian - conflito de teste (2).md");
    expect(adaptador.arquivos.get(CAMINHO_NOTA_TESTE)).toBe(conteudoDoUsuario);
    // o desenho, sem conflito de nome, nasce no nome-base normal.
    expect(resultado.caminhoDesenho).toBe(CAMINHO_DESENHO_TESTE);
    // os dois conflitos foram registrados mesmo assim — a simulação nunca recusa.
    expect(registrados).toHaveLength(2);
    for (const conflito of registrados) {
      expect(adaptador.arquivos.get(conflito.caminho)).toBe(conflito.local.conteudo);
    }
  });

  it("desenho de verdade do usuário com o nome de teste: a simulação numera e o desenho do usuário fica intacto", async () => {
    const conteudoDoUsuario = "---\nexcalisidian: drawing\n---\n%%\n# Excalisidian Drawing\n%%\n";
    const adaptador = adaptadorFalso({ [CAMINHO_DESENHO_TESTE]: conteudoDoUsuario });
    const registrados: Conflito[] = [];

    const resultado = await simularConflito(
      adaptador,
      (c) => registrados.push(c),
      new Date(),
      depsFalso(),
    );

    expect(resultado.caminhoDesenho).toBe("Excalisidian - conflito de teste (2).draw.md");
    expect(adaptador.arquivos.get(CAMINHO_DESENHO_TESTE)).toBe(conteudoDoUsuario);
    expect(resultado.caminhoNota).toBe(CAMINHO_NOTA_TESTE);
    expect(registrados).toHaveLength(2);
  });
});
