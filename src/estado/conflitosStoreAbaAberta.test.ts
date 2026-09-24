// src/estado/conflitosStoreAbaAberta.test.ts
// Integração conflitosStore + documentosStore reais (só o vaultStore é mockado, como em
// documentosStore.test.ts): prova o efeito que o usuário VÊ quando resolve um conflito com o
// arquivo aberto numa aba — a lição do plano 04 é que "o disco recebeu X" não bastava, o
// defeito estava no passo seguinte (aba/árvore/índice), que só um teste com o documentosStore
// de verdade consegue travar. Em especial: um autosave pendente do conteúdo ANTIGO não pode
// gravar por cima da versão que o usuário escolheu — só timers falsos do vitest provam isso.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// O store usa window.setTimeout (contexto do webview). No ambiente node do vitest,
// aponta window para o global — mesmo padrão de documentosStore.test.ts.
vi.stubGlobal("window", globalThis);

const disco = new Map<string, string>();
const arvoreChamadas: string[] = [];
const reindexadas: string[] = [];

const adapter = {
  raiz: () => "C:/vault",
  absoluto: (p: string) => `C:/vault/${p}`,
  async existe(p: string) {
    return disco.has(p);
  },
  async lerTexto(p: string) {
    if (!disco.has(p)) throw new Error("ENOENT");
    return disco.get(p)!;
  },
  async escreverTexto(p: string, c: string) {
    disco.set(p, c);
  },
} as unknown as VaultAdapter;

// Mock de "./vaultStore": compartilhado por conflitosStore.ts E documentosStore.ts, os dois
// importam o mesmo módulo por caminho relativo — as chamadas de recarregarArvore/
// reindexarArquivo feitas por QUALQUER um dos dois caem nos mesmos espiões abaixo.
vi.mock("./vaultStore", () => ({
  useVaultStore: {
    getState: () => ({
      adapter,
      async recarregarArvore() {
        arvoreChamadas.push("recarregou");
      },
      async reindexarArquivo(p: string) {
        reindexadas.push(p);
      },
    }),
  },
}));

import { useConflitosStore } from "./conflitosStore";
import { useDocumentosStore } from "./documentosStore";
import type { Conflito } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

const quando = new Date(2026, 8, 23);

const conflito = (): Conflito => ({
  caminho: "Nota.md",
  tipo: "nota",
  local: { origem: "local", conteudo: "edição do usuário", mtimeMs: 2, dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "versão do notebook", mtimeMs: 1, dispositivo: "Notebook" },
});

beforeEach(() => {
  disco.clear();
  arvoreChamadas.length = 0;
  reindexadas.length = 0;
  useConflitosStore.setState({ conflitos: [], emResolucaoSet: new Set() });
  useDocumentosStore.setState({ docs: new Map() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("conflitosStore.resolver com a aba aberta (integração real)", () => {
  it("ficar com a outra versão: a aba passa a mostrar o conteúdo escolhido na hora", async () => {
    disco.set("Nota.md", "original no disco");
    await useDocumentosStore.getState().abrir("Nota.md");

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("Nota.md", { acao: "ficarCom", origem: "remoto" }, adapter, quando);

    const doc = useDocumentosStore.getState().docs.get("Nota.md")!;
    expect(doc.conteudoEditor).toBe("versão do notebook");
    expect(doc.conteudoDisco).toBe("versão do notebook");
    expect(doc.estado).toBe("limpo");
    // versao sobe: é o que faz PainelDesenho/PainelDocumento remontar o editor com a key
    // `${path}#${doc.versao}` — sem isto o desenho aberto continuaria com a cena antiga.
    expect(doc.versao).toBe(1);
  });

  it("ficar com a outra versão: recarrega a árvore e reindexa o caminho gravado", async () => {
    disco.set("Nota.md", "original no disco");
    await useDocumentosStore.getState().abrir("Nota.md");

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("Nota.md", { acao: "ficarCom", origem: "remoto" }, adapter, quando);

    expect(arvoreChamadas).toEqual(["recarregou"]);
    expect(reindexadas).toEqual(["Nota.md"]);
  });

  it("autosave pendente do conteúdo antigo NÃO grava depois da resolução", async () => {
    vi.useFakeTimers();
    disco.set("Nota.md", "original no disco");
    await useDocumentosStore.getState().abrir("Nota.md");

    // Usuário está editando: isto arma o timer de autosave de 800ms com "edição não salva".
    useDocumentosStore.getState().editar("Nota.md", "edição não salva, ainda no debounce");
    expect(useDocumentosStore.getState().docs.get("Nota.md")!.estado).toBe("editando");

    // Antes do debounce vencer, o usuário resolve o conflito escolhendo a versão remota.
    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("Nota.md", { acao: "ficarCom", origem: "remoto" }, adapter, quando);

    // Sem a correção, este avanço de tempo dispararia o autosave armado antes da resolução e
    // regravaria "edição não salva..." por cima da versão que o usuário escolheu.
    await vi.advanceTimersByTimeAsync(2000);

    expect(disco.get("Nota.md")).toBe("versão do notebook");
    const doc = useDocumentosStore.getState().docs.get("Nota.md")!;
    expect(doc.conteudoEditor).toBe("versão do notebook");
    expect(doc.estado).toBe("limpo");
  });

  it("ficar com esta (local): não recarrega a aba — o editor continua com a edição do usuário", async () => {
    disco.set("Nota.md", "original no disco");
    await useDocumentosStore.getState().abrir("Nota.md");
    useDocumentosStore.getState().editar("Nota.md", "edição local do usuário");

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("Nota.md", { acao: "ficarCom", origem: "local" }, adapter, quando);

    const doc = useDocumentosStore.getState().docs.get("Nota.md")!;
    expect(doc.conteudoEditor).toBe("edição local do usuário");
    expect(doc.versao).toBe(0); // não recarregou: versao não mudou
    expect(disco.get("Nota.md")).toBe("original no disco"); // nada foi gravado
  });

  it("manter as duas: a aba do original não recarrega, só o disco ganha a cópia nova", async () => {
    vi.useFakeTimers();
    disco.set("Nota.md", "original no disco");
    await useDocumentosStore.getState().abrir("Nota.md");
    useDocumentosStore.getState().editar("Nota.md", "edição local em andamento");

    useConflitosStore.getState().registrar(conflito());
    await useConflitosStore
      .getState()
      .resolver("Nota.md", { acao: "manterAmbas" }, adapter, quando);

    const doc = useDocumentosStore.getState().docs.get("Nota.md")!;
    // aba do original intocada: nem versao nem conteúdo mudaram.
    expect(doc.versao).toBe(0);
    expect(doc.conteudoEditor).toBe("edição local em andamento");

    // a cópia de conflito foi gravada com o conteúdo remoto, num caminho novo.
    expect(disco.get("Nota (conflito de 23-09-2026, Notebook).md")).toBe("versão do notebook");
    expect(reindexadas).toEqual(["Nota (conflito de 23-09-2026, Notebook).md"]);

    // o autosave da edição local, que já estava armado antes da resolução, segue seu curso
    // normal (é uma edição de verdade do usuário, sem relação com o conflito resolvido).
    await vi.advanceTimersByTimeAsync(2000);
    expect(disco.get("Nota.md")).toBe("edição local em andamento");
  });
});
