// src/estado/conflitosStore.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import { useConflitosStore, type DepsResolucao } from "./conflitosStore";
import type { Conflito } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

const quando = new Date(2026, 8, 21);

const conflito = (caminho = "nota.md"): Conflito => ({
  caminho,
  tipo: "nota",
  local: { origem: "local", conteudo: "daqui", mtimeMs: 2, dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "de lá", mtimeMs: 1, dispositivo: "Notebook" },
});

// O adaptador falso guarda o que foi escrito num Map, pra `existe` responder de verdade —
// é assim que o teste prova que caminhoLivre numera em cima de uma cópia já gravada.
function adaptadorFalso() {
  const arquivos = new Map<string, string>();
  const escreverTexto = vi.fn(async (caminho: string, conteudo: string) => {
    arquivos.set(caminho, conteudo);
  });
  const existe = vi.fn(async (caminho: string) => arquivos.has(caminho));
  return {
    escreverTexto,
    existe,
    arquivos,
  } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    existe: typeof existe;
    arquivos: Map<string, string>;
  };
}

function adaptadorFalhoQueEstoura() {
  const escreverTexto = vi.fn(async () => {
    throw new Error("disco cheio");
  });
  const existe = vi.fn(async () => false);
  return { escreverTexto, existe } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    existe: typeof existe;
  };
}

// `escreverTexto` só resolve quando o teste manda (via `liberarProxima`), sem temporizador —
// é assim que dá pra simular duas chamadas de `resolver` concorrentes, a primeira ainda "no
// meio" da escrita quando a segunda chega. `caminhoLivre` faz um `await existe(...)` antes de
// chegar em `escreverTexto`, então entre chamar `resolver` e a escrita realmente ficar
// pendente há voltas de microtask no meio — `liberarProxima` drena a fila de microtasks (sem
// timer nenhum) até a escrita aparecer, e só então libera.
function adaptadorControlado() {
  const arquivos = new Map<string, string>();
  const pendentes: Array<() => void> = [];
  const escreverTexto = vi.fn(
    (caminho: string, conteudo: string) =>
      new Promise<void>((resolve) => {
        pendentes.push(() => {
          arquivos.set(caminho, conteudo);
          resolve();
        });
      }),
  );
  const existe = vi.fn(async (caminho: string) => arquivos.has(caminho));
  return {
    escreverTexto,
    existe,
    arquivos,
    async liberarProxima() {
      for (let i = 0; i < 1000 && pendentes.length === 0; i++) {
        await Promise.resolve();
      }
      pendentes.shift()?.();
    },
  } as unknown as VaultAdapter & {
    escreverTexto: typeof escreverTexto;
    existe: typeof existe;
    arquivos: Map<string, string>;
    liberarProxima(): Promise<void>;
  };
}

// Deps falsas para os testes que não precisam dos stores reais (a maioria): registram quem
// foi chamado, na ordem, sem tocar vaultStore/documentosStore/window. Os testes de integração
// com aba aberta e autosave real ficam em conflitosStoreAbaAberta.test.ts — ali sim entram os
// stores de verdade, porque é o autosave de verdade que precisa não disparar.
function depsFalso() {
  const chamadas: string[] = [];
  const recarregarArvore = vi.fn(async () => {
    chamadas.push("recarregarArvore");
  });
  const reindexarArquivo = vi.fn(async (caminho: string) => {
    chamadas.push(`reindexarArquivo:${caminho}`);
  });
  const cancelarAutosavePendente = vi.fn((caminho: string) => {
    chamadas.push(`cancelarAutosavePendente:${caminho}`);
  });
  const recarregarDoDisco = vi.fn(async (caminho: string) => {
    chamadas.push(`recarregarDoDisco:${caminho}`);
  });
  return {
    recarregarArvore,
    reindexarArquivo,
    cancelarAutosavePendente,
    recarregarDoDisco,
    chamadas,
  } satisfies DepsResolucao & { chamadas: string[] };
}

describe("conflitosStore", () => {
  beforeEach(() => useConflitosStore.setState({ conflitos: [] }));

  it("começa vazio", () => {
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("registrar acrescenta e conflitoDe encontra", () => {
    useConflitosStore.getState().registrar(conflito());
    expect(useConflitosStore.getState().conflitoDe("nota.md")?.caminho).toBe("nota.md");
  });

  it("registrar o mesmo caminho substitui em vez de duplicar", () => {
    useConflitosStore.getState().registrar(conflito());
    const novo = conflito();
    novo.remoto.conteudo = "de lá, mais novo";
    useConflitosStore.getState().registrar(novo);
    expect(useConflitosStore.getState().conflitos).toHaveLength(1);
    expect(useConflitosStore.getState().conflitoDe("nota.md")?.remoto.conteudo).toBe(
      "de lá, mais novo",
    );
  });

  it("resolver com a local não escreve nada e tira da fila", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "local" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("resolver com a remota escreve pelo adaptador, nunca direto no disco", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith("nota.md", "de lá");
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("manter as duas grava a cópia carimbada", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith(
      "nota (conflito de 21-09-2026, Notebook).md",
      "de lá",
    );
  });

  it("escrita que falha mantém o conflito na fila", async () => {
    const adaptador = adaptadorFalhoQueEstoura();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await expect(
      useConflitosStore
        .getState()
        .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps),
    ).rejects.toThrow("disco cheio");

    expect(useConflitosStore.getState().conflitos).toHaveLength(1);
    // A escrita falhou antes de qualquer efeito de árvore/índice/aba.
    expect(deps.recarregarArvore).not.toHaveBeenCalled();
    expect(deps.recarregarDoDisco).not.toHaveBeenCalled();
  });

  it("resolver caminho que não está em conflito não faz nada", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    await useConflitosStore
      .getState()
      .resolver("outra.md", { acao: "manterAmbas" }, adaptador, quando, deps);
    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
    expect(deps.recarregarArvore).not.toHaveBeenCalled();
  });

  it("limpar esvazia a fila — usado ao trocar de vault", () => {
    useConflitosStore.getState().registrar(conflito("a.md"));
    useConflitosStore.getState().registrar(conflito("b.md"));
    useConflitosStore.getState().limpar();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("duas resoluções 'manter as duas' seguidas: a segunda cópia numera, a primeira não some", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).toHaveBeenNthCalledWith(
      1,
      "nota (conflito de 21-09-2026, Notebook).md",
      "de lá",
    );
    expect(adaptador.escreverTexto).toHaveBeenNthCalledWith(
      2,
      "nota (conflito de 21-09-2026, Notebook) (2).md",
      "de lá",
    );
    // a primeira cópia continua intacta — a segunda escrita não pisou nela.
    expect(adaptador.arquivos.get("nota (conflito de 21-09-2026, Notebook).md")).toBe("de lá");
  });

  it("o mesmo vale para desenho: o (2) entra antes de .draw.md", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    const desenho = (): Conflito => ({
      caminho: "mapa.draw.md",
      tipo: "desenho",
      local: { origem: "local", conteudo: "daqui", mtimeMs: 2, dispositivo: "Desktop" },
      remoto: { origem: "remoto", conteudo: "de lá", mtimeMs: 1, dispositivo: "Notebook" },
    });

    useConflitosStore.getState().registrar(desenho());
    await useConflitosStore
      .getState()
      .resolver("mapa.draw.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    useConflitosStore.getState().registrar(desenho());
    await useConflitosStore
      .getState()
      .resolver("mapa.draw.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).toHaveBeenNthCalledWith(
      2,
      "mapa (conflito de 21-09-2026, Notebook) (2).draw.md",
      "de lá",
    );
  });

  it("ficar com a remota continua escrevendo no caminho original, sem numeração, mesmo se já existir cópia de conflito", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps);

    expect(adaptador.escreverTexto).toHaveBeenLastCalledWith("nota.md", "de lá");
  });

  it("duas chamadas de resolver concorrentes para o mesmo caminho: só uma escrita acontece", async () => {
    const adaptador = adaptadorControlado();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    // Dispara as duas SEM esperar a primeira — a segunda deve ver o caminho já "em
    // resolução" e retornar na hora, sem nem chamar escreverTexto.
    const p1 = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);
    const p2 = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    await adaptador.liberarProxima();
    await Promise.all([p1, p2]);

    expect(adaptador.escreverTexto).toHaveBeenCalledTimes(1);
  });

  it("emResolucao é verdadeiro durante a resolução e falso depois", async () => {
    const adaptador = adaptadorControlado();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);

    const p = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(true);

    await adaptador.liberarProxima();
    await p;

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);
  });

  it("depois de uma resolução que falha, o caminho sai do conjunto e aceita nova resolução", async () => {
    const adaptador = adaptadorFalhoQueEstoura();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await expect(
      useConflitosStore
        .getState()
        .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps),
    ).rejects.toThrow("disco cheio");

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);

    // Nova tentativa, agora com um adaptador que funciona, deve ser aceita normalmente.
    const adaptadorOk = adaptadorFalso();
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptadorOk, quando, deps);

    expect(adaptadorOk.escreverTexto).toHaveBeenCalledWith("nota.md", "de lá");
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  // --- efeito que o usuário vê: árvore, índice e aba (plano 07, task B) -------------------
  //
  // O plano 04 só provava "o disco recebeu X". O defeito real ("demorou pra aparecer") estava
  // no passo seguinte — recarregar árvore/índice/aba — que nenhum teste cobria. Estes testes
  // travam exatamente esse passo, com deps falsas (a integração com o autosave de verdade,
  // que precisa de documentosStore real e timers falsos, está em
  // conflitosStoreAbaAberta.test.ts).

  it("ficar com a remota recarrega a árvore e reindexa o caminho gravado", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps);

    expect(deps.recarregarArvore).toHaveBeenCalledTimes(1);
    expect(deps.reindexarArquivo).toHaveBeenCalledWith("nota.md");
  });

  it("ficar com a remota, com o original aberto, recarrega a aba pro conteúdo escolhido", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps);

    expect(deps.recarregarDoDisco).toHaveBeenCalledWith("nota.md");
  });

  it("ficar com a remota cancela o autosave pendente ANTES de escrever, não depois", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando, deps);

    const iCancelou = deps.chamadas.indexOf("cancelarAutosavePendente:nota.md");
    expect(iCancelou).toBeGreaterThanOrEqual(0);
    expect(adaptador.escreverTexto.mock.invocationCallOrder[0]).toBeGreaterThan(
      (deps.cancelarAutosavePendente as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
  });

  it("manter as duas: a aba do original NÃO recarrega (o original nunca foi tocado)", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando, deps);

    expect(deps.recarregarDoDisco).not.toHaveBeenCalled();
    expect(deps.cancelarAutosavePendente).not.toHaveBeenCalled();
    // A cópia nova entra na árvore/índice mesmo assim.
    expect(deps.recarregarArvore).toHaveBeenCalledTimes(1);
    expect(deps.reindexarArquivo).toHaveBeenCalledWith(
      "nota (conflito de 21-09-2026, Notebook).md",
    );
  });

  it("ficar com esta (local): nenhum efeito de árvore/índice/aba — nada foi escrito", async () => {
    const adaptador = adaptadorFalso();
    const deps = depsFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "local" }, adaptador, quando, deps);

    expect(deps.recarregarArvore).not.toHaveBeenCalled();
    expect(deps.reindexarArquivo).not.toHaveBeenCalled();
    expect(deps.recarregarDoDisco).not.toHaveBeenCalled();
    expect(deps.cancelarAutosavePendente).not.toHaveBeenCalled();
  });
});
