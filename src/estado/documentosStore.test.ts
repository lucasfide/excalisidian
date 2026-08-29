import { describe, it, expect, beforeEach, vi } from "vitest";

// O store usa window.setTimeout (contexto do webview). No ambiente node do vitest,
// aponta window para o global.
vi.stubGlobal("window", globalThis);

// Disco falso, controlado pelo teste. O adapter real puxa os plugins do Tauri.
const disco = new Map<string, string>();
const adapter = {
  raiz: () => "C:/vault",
  absoluto: (p: string) => `C:/vault/${p}`,
  async lerTexto(p: string) {
    if (!disco.has(p)) throw new Error("ENOENT");
    return disco.get(p)!;
  },
  async escreverTexto(p: string, c: string) {
    disco.set(p, c);
  },
};

vi.mock("./vaultStore", () => ({
  useVaultStore: {
    getState: () => ({ adapter, reindexarArquivo: async () => {} }),
  },
}));

import { useDocumentosStore } from "./documentosStore";

const store = () => useDocumentosStore.getState();

beforeEach(() => {
  disco.clear();
  useDocumentosStore.setState({ docs: new Map() });
});

describe("documentosStore — conflitos externos (Fatia 5)", () => {
  it("aba limpa: mudança externa recarrega em silêncio", async () => {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");

    disco.set("Nota.md", "editado por fora");
    await store().aoEventoExterno(["Nota.md"]);

    const d = store().docs.get("Nota.md")!;
    expect(d.estado).toBe("limpo");
    expect(d.conteudoEditor).toBe("editado por fora");
    expect(d.conteudoDisco).toBe("editado por fora");
  });

  it("aba suja: mudança externa divergente vira conflito, sem perder o que o usuário digitou", async () => {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    store().editar("Nota.md", "minha edição");

    disco.set("Nota.md", "edição de outro editor");
    await store().aoEventoExterno(["Nota.md"]);

    const d = store().docs.get("Nota.md")!;
    expect(d.estado).toBe("conflito");
    expect(d.conteudoEditor).toBe("minha edição");
  });

  it("conflito: manter minha versão grava o editor por cima do disco", async () => {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    store().editar("Nota.md", "minha edição");
    disco.set("Nota.md", "edição de outro editor");
    await store().aoEventoExterno(["Nota.md"]);

    await store().manterMinhaVersao("Nota.md");

    expect(disco.get("Nota.md")).toBe("minha edição");
    expect(store().docs.get("Nota.md")!.estado).toBe("limpo");
  });

  it("arquivo apagado por fora: aba fica órfã mesmo com edição pendente, e recriar regrava", async () => {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    store().editar("Nota.md", "conteúdo que só existe na aba");

    disco.delete("Nota.md");
    await store().aoEventoExterno(["Nota.md"]);
    expect(store().docs.get("Nota.md")!.estado).toBe("orfao");

    await store().recriar("Nota.md");
    expect(disco.get("Nota.md")).toBe("conteúdo que só existe na aba");
    expect(store().docs.get("Nota.md")!.estado).toBe("limpo");
  });

  it("mudança externa idêntica ao que já temos não faz nada", async () => {
    disco.set("Nota.md", "igual");
    await store().abrir("Nota.md");
    await store().aoEventoExterno(["Nota.md"]);
    expect(store().docs.get("Nota.md")!.estado).toBe("limpo");
  });
});
