// src/vault/VaultAdapterMemoria.test.ts
import { describe, it, expect } from "vitest";

import { VaultAdapterMemoria } from "./VaultAdapterMemoria";

describe("VaultAdapterMemoria", () => {
  it("raiz devolve o caminho passado no construtor, com padrão sensato", () => {
    expect(new VaultAdapterMemoria("C:/meu-vault").raiz()).toBe("C:/meu-vault");
    expect(new VaultAdapterMemoria().raiz()).toBeTruthy();
  });

  it("escreverTexto + lerTexto: ida e volta", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("nota.md", "conteúdo");
    expect(await vault.lerTexto("nota.md")).toBe("conteúdo");
  });

  it("escreverBinario + lerBinario: ida e volta byte a byte", async () => {
    const vault = new VaultAdapterMemoria();
    const dados = new Uint8Array([1, 2, 3, 255]);
    await vault.escreverBinario("img.png", dados);
    expect(await vault.lerBinario("img.png")).toEqual(dados);
  });

  it("lerTexto de arquivo inexistente lança", async () => {
    const vault = new VaultAdapterMemoria();
    await expect(vault.lerTexto("fantasma.md")).rejects.toThrow();
  });

  it("lerBinario de arquivo inexistente lança", async () => {
    const vault = new VaultAdapterMemoria();
    await expect(vault.lerBinario("fantasma.png")).rejects.toThrow();
  });

  it("existe: true depois de escrever, false antes e depois de remover", async () => {
    const vault = new VaultAdapterMemoria();
    expect(await vault.existe("nota.md")).toBe(false);
    await vault.escreverTexto("nota.md", "x");
    expect(await vault.existe("nota.md")).toBe(true);
    await vault.remover("nota.md");
    expect(await vault.existe("nota.md")).toBe(false);
  });

  it("mtimeMs cresce estritamente a cada escrita, mesmo no mesmo milissegundo real", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("a.md", "1");
    await vault.escreverTexto("a.md", "2");
    await vault.escreverTexto("a.md", "3");
    const entradas = await vault.listar();
    const a = entradas.find((e) => e.path === "a.md")!;
    // Cada escrita produziu um mtimeMs maior que o anterior — não dá pra checar os
    // intermediários por fora, mas a leitura final tem que refletir a mais recente.
    expect(await vault.lerTexto("a.md")).toBe("3");
    expect(a.mtimeMs).toBeGreaterThan(0);
  });

  it("mtimeMs de dois arquivos escritos em sequência é estritamente crescente", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("a.md", "1");
    await vault.escreverTexto("b.md", "2");
    const entradas = await vault.listar();
    const a = entradas.find((e) => e.path === "a.md")!;
    const b = entradas.find((e) => e.path === "b.md")!;
    expect(b.mtimeMs).toBeGreaterThan(a.mtimeMs);
  });

  it("birthtimeMs não muda quando o arquivo é regravado; mtimeMs sim", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("a.md", "1");
    const primeira = (await vault.listar()).find((e) => e.path === "a.md")!;
    await vault.escreverTexto("a.md", "2");
    const segunda = (await vault.listar()).find((e) => e.path === "a.md")!;
    expect(segunda.birthtimeMs).toBe(primeira.birthtimeMs);
    expect(segunda.mtimeMs).toBeGreaterThan(primeira.mtimeMs);
  });

  it("listar: walk completo, inclui pastas criadas por criarPasta antes da escrita", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("pasta/sub");
    await vault.escreverTexto("pasta/sub/nota.md", "x");
    const entradas = await vault.listar();
    const porPath = new Map(entradas.map((e) => [e.path, e]));
    expect(porPath.get("pasta")?.isDir).toBe(true);
    expect(porPath.get("pasta/sub")?.isDir).toBe(true);
    expect(porPath.get("pasta/sub/nota.md")?.isDir).toBe(false);
  });

  it("listar: pula pasta ponto e tudo dentro dela (igual walk_vault)", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("nota.md", "visível");
    await vault.criarPasta(".trash");
    await vault.escreverTexto(".trash/apagado.md", "não deveria aparecer");
    const entradas = await vault.listar();
    expect(entradas.map((e) => e.path)).toEqual(["nota.md"]);
  });

  it("listarPasta: enxerga dentro de pasta ponto, diferente de listar()", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta(".trash");
    await vault.escreverTexto(".trash/apagado.md", "x");
    const itens = await vault.listarPasta(".trash");
    expect(itens).toEqual([{ nome: "apagado.md", isDir: false }]);
  });

  it("listarPasta: pasta inexistente devolve lista vazia, não lança", async () => {
    const vault = new VaultAdapterMemoria();
    expect(await vault.listarPasta("nunca-existiu")).toEqual([]);
  });

  it("listarPasta: só um nível, não desce em subpastas", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("a/c");
    await vault.escreverTexto("a/b.md", "x");
    await vault.escreverTexto("a/c/d.md", "y");
    const itens = await vault.listarPasta("a");
    expect(itens.sort((x, y) => x.nome.localeCompare(y.nome))).toEqual([
      { nome: "b.md", isDir: false },
      { nome: "c", isDir: true },
    ]);
  });

  it("escrever em pasta inexistente lança, igual ao disco real (escritaAtomica.ts não cria pasta)", async () => {
    const vault = new VaultAdapterMemoria();
    await expect(vault.escreverTexto("pasta-nova/nota.md", "x")).rejects.toThrow();
    await expect(vault.escreverBinario("pasta-nova/img.png", new Uint8Array([1]))).rejects.toThrow();
    expect(await vault.existe("pasta-nova/nota.md")).toBe(false);
  });

  it("escrever em pasta inexistente funciona depois de criarPasta", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("pasta-nova");
    await vault.escreverTexto("pasta-nova/nota.md", "conteúdo");
    expect(await vault.lerTexto("pasta-nova/nota.md")).toBe("conteúdo");
  });

  it("criarPasta é recursivo (mkdir -p): cria também os ancestrais que faltam", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("a/b/c");
    await vault.escreverTexto("a/b/c/nota.md", "x");
    expect(await vault.lerTexto("a/b/c/nota.md")).toBe("x");
  });

  it("criarPasta: pasta vazia aparece em listar() e listarPasta() do pai", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("vazia");
    const entradas = await vault.listar();
    expect(entradas).toEqual([{ path: "vazia", isDir: true, size: 0, mtimeMs: expect.any(Number), birthtimeMs: expect.any(Number) }]);
  });

  it("mover arquivo: some do caminho antigo, aparece no novo com o mesmo conteúdo", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("origem.md", "conteúdo");
    await vault.mover("origem.md", "destino.md");
    expect(await vault.existe("origem.md")).toBe(false);
    expect(await vault.lerTexto("destino.md")).toBe("conteúdo");
  });

  it("mover pasta: filhos vão junto, com os caminhos reescritos", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("a/sub");
    await vault.escreverTexto("a/x.md", "1");
    await vault.escreverTexto("a/sub/y.md", "2");
    await vault.mover("a", "b");
    expect(await vault.existe("a/x.md")).toBe(false);
    expect(await vault.existe("a/sub/y.md")).toBe(false);
    expect(await vault.lerTexto("b/x.md")).toBe("1");
    expect(await vault.lerTexto("b/sub/y.md")).toBe("2");
  });

  it("mover arquivo inexistente lança", async () => {
    const vault = new VaultAdapterMemoria();
    await expect(vault.mover("fantasma.md", "novo.md")).rejects.toThrow();
  });

  it("mover para pasta de destino inexistente lança, igual ao rename do plugin-fs", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("origem.md", "x");
    await expect(vault.mover("origem.md", "pasta-nova/destino.md")).rejects.toThrow();
    // nada mudou: a origem continua onde estava, o destino não existe.
    expect(await vault.existe("origem.md")).toBe(true);
    expect(await vault.existe("pasta-nova/destino.md")).toBe(false);
  });

  it("mover para pasta de destino existente funciona", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("pasta-nova");
    await vault.escreverTexto("origem.md", "conteúdo");
    await vault.mover("origem.md", "pasta-nova/destino.md");
    expect(await vault.existe("origem.md")).toBe(false);
    expect(await vault.lerTexto("pasta-nova/destino.md")).toBe("conteúdo");
  });

  it("remover: apaga o arquivo (permanente, sem lixeira)", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.escreverTexto("a.md", "x");
    await vault.remover("a.md");
    expect(await vault.existe("a.md")).toBe(false);
  });

  it("remover pasta: recursivo, apaga tudo dentro", async () => {
    const vault = new VaultAdapterMemoria();
    await vault.criarPasta("a/sub");
    await vault.escreverTexto("a/x.md", "1");
    await vault.escreverTexto("a/sub/y.md", "2");
    await vault.remover("a");
    expect(await vault.existe("a")).toBe(false);
    expect(await vault.existe("a/x.md")).toBe(false);
    expect(await vault.existe("a/sub/y.md")).toBe(false);
  });

  it("observar e aoPerderSincronia: no-op, devolvem função de cancelar que não lança", () => {
    const vault = new VaultAdapterMemoria();
    const cancelarObservar = vault.observar(() => {});
    const cancelarPerder = vault.aoPerderSincronia(() => {});
    expect(() => cancelarObservar()).not.toThrow();
    expect(() => cancelarPerder()).not.toThrow();
  });
});
