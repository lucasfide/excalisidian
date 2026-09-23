// src/sync/simularConflito.test.ts
import { describe, it, expect, vi } from "vitest";

import {
  simularConflito,
  conflitosDeTeste,
  CAMINHO_NOTA_TESTE,
  CAMINHO_DESENHO_TESTE,
} from "./simularConflito";
import { diffLinhas } from "./diffLinhas";
import { lerCenaDeConflito } from "./cenaDeConflito";
import type { Conflito } from "./tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

// Mesmo padrão do fake usado em conflitosStore.test.ts: guarda o que foi escrito num Map,
// pra o teste conferir tanto o conjunto de caminhos tocados quanto o conteúdo exato.
function adaptadorFalso() {
  const arquivos = new Map<string, string>();
  const escreverTexto = vi.fn(async (caminho: string, conteudo: string) => {
    arquivos.set(caminho, conteudo);
  });
  return {
    escreverTexto,
    arquivos,
  } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    arquivos: Map<string, string>;
  };
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
  it("escreve só nos dois caminhos de teste, nenhum outro", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c));

    expect([...adaptador.arquivos.keys()].sort()).toEqual(
      [CAMINHO_NOTA_TESTE, CAMINHO_DESENHO_TESTE].sort(),
    );
  });

  it("o conteúdo gravado de cada arquivo é idêntico ao local.conteudo do conflito registrado", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c));

    expect(registrados).toHaveLength(2);
    for (const conflito of registrados) {
      expect(adaptador.arquivos.get(conflito.caminho)).toBe(conflito.local.conteudo);
    }
  });

  it("registra um conflito de nota e um de desenho", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c));

    expect(registrados.map((c) => c.tipo).sort()).toEqual(["desenho", "nota"]);
  });

  it("rodar duas vezes seguidas sobrescreve os mesmos dois arquivos, sem criar outros", async () => {
    const adaptador = adaptadorFalso();
    const registrados: Conflito[] = [];

    await simularConflito(adaptador, (c) => registrados.push(c));
    await simularConflito(adaptador, (c) => registrados.push(c));

    expect(adaptador.arquivos.size).toBe(2);
    expect([...adaptador.arquivos.keys()].sort()).toEqual(
      [CAMINHO_NOTA_TESTE, CAMINHO_DESENHO_TESTE].sort(),
    );
    expect(adaptador.escreverTexto).toHaveBeenCalledTimes(4);
    expect(registrados).toHaveLength(4);
  });
});
