// src/estado/conflitosStore.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import { useConflitosStore } from "./conflitosStore";
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
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "local" }, adaptador, quando);

    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("resolver com a remota escreve pelo adaptador, nunca direto no disco", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith("nota.md", "de lá");
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("manter as duas grava a cópia carimbada", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith(
      "nota (conflito de 21-09-2026, Notebook).md",
      "de lá",
    );
  });

  it("escrita que falha mantém o conflito na fila", async () => {
    const adaptador = adaptadorFalhoQueEstoura();
    useConflitosStore.getState().registrar(conflito());

    await expect(
      useConflitosStore
        .getState()
        .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando),
    ).rejects.toThrow("disco cheio");

    expect(useConflitosStore.getState().conflitos).toHaveLength(1);
  });

  it("resolver caminho que não está em conflito não faz nada", async () => {
    const adaptador = adaptadorFalso();
    await useConflitosStore
      .getState()
      .resolver("outra.md", { acao: "manterAmbas" }, adaptador, quando);
    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
  });

  it("limpar esvazia a fila — usado ao trocar de vault", () => {
    useConflitosStore.getState().registrar(conflito("a.md"));
    useConflitosStore.getState().registrar(conflito("b.md"));
    useConflitosStore.getState().limpar();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("duas resoluções 'manter as duas' seguidas: a segunda cópia numera, a primeira não some", async () => {
    const adaptador = adaptadorFalso();

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

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
    const desenho = (): Conflito => ({
      caminho: "mapa.draw.md",
      tipo: "desenho",
      local: { origem: "local", conteudo: "daqui", mtimeMs: 2, dispositivo: "Desktop" },
      remoto: { origem: "remoto", conteudo: "de lá", mtimeMs: 1, dispositivo: "Notebook" },
    });

    useConflitosStore.getState().registrar(desenho());
    await useConflitosStore
      .getState()
      .resolver("mapa.draw.md", { acao: "manterAmbas" }, adaptador, quando);

    useConflitosStore.getState().registrar(desenho());
    await useConflitosStore
      .getState()
      .resolver("mapa.draw.md", { acao: "manterAmbas" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenNthCalledWith(
      2,
      "mapa (conflito de 21-09-2026, Notebook) (2).draw.md",
      "de lá",
    );
  });

  it("ficar com a remota continua escrevendo no caminho original, sem numeração, mesmo se já existir cópia de conflito", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenLastCalledWith("nota.md", "de lá");
  });

  it("duas chamadas de resolver concorrentes para o mesmo caminho: só uma escrita acontece", async () => {
    const adaptador = adaptadorControlado();
    useConflitosStore.getState().registrar(conflito());

    // Dispara as duas SEM esperar a primeira — a segunda deve ver o caminho já "em
    // resolução" e retornar na hora, sem nem chamar escreverTexto.
    const p1 = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);
    const p2 = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    await adaptador.liberarProxima();
    await Promise.all([p1, p2]);

    expect(adaptador.escreverTexto).toHaveBeenCalledTimes(1);
  });

  it("emResolucao é verdadeiro durante a resolução e falso depois", async () => {
    const adaptador = adaptadorControlado();
    useConflitosStore.getState().registrar(conflito());

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);

    const p = useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(true);

    await adaptador.liberarProxima();
    await p;

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);
  });

  it("depois de uma resolução que falha, o caminho sai do conjunto e aceita nova resolução", async () => {
    const adaptador = adaptadorFalhoQueEstoura();
    useConflitosStore.getState().registrar(conflito());

    await expect(
      useConflitosStore
        .getState()
        .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando),
    ).rejects.toThrow("disco cheio");

    expect(useConflitosStore.getState().emResolucao("nota.md")).toBe(false);

    // Nova tentativa, agora com um adaptador que funciona, deve ser aceita normalmente.
    const adaptadorOk = adaptadorFalso();
    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptadorOk, quando);

    expect(adaptadorOk.escreverTexto).toHaveBeenCalledWith("nota.md", "de lá");
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });
});
