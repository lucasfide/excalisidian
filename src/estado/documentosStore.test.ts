import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// Regressões da auditoria de 12/09/2026 (docs/relatorio-auditoria-2026-09-12.md),
// achados 01–04. Cenários reproduzidos em scripts/auditoria-reproducoes.cjs.
describe("documentosStore — regressões da auditoria", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function abrirComConflito() {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    store().editar("Nota.md", "local");
    disco.set("Nota.md", "externo");
    await store().aoEventoExterno(["Nota.md"]);
    expect(store().docs.get("Nota.md")!.estado).toBe("conflito");
  }

  it("achado 01: conflito externo cancela o autosave — o timer não sobrescreve o disco", async () => {
    vi.useFakeTimers();
    await abrirComConflito();

    await vi.advanceTimersByTimeAsync(2000);

    expect(disco.get("Nota.md")).toBe("externo");
    expect(store().docs.get("Nota.md")!.estado).toBe("conflito");
  });

  it("achado 01: digitar durante o conflito não rebaixa o estado nem agenda autosave", async () => {
    vi.useFakeTimers();
    await abrirComConflito();

    store().editar("Nota.md", "local editado durante o conflito");

    expect(store().docs.get("Nota.md")!.estado).toBe("conflito");
    await vi.advanceTimersByTimeAsync(2000);
    expect(disco.get("Nota.md")).toBe("externo");
  });

  it("achado 01: flushTudo não grava documento em conflito — reporta como bloqueado", async () => {
    await abrirComConflito();

    const resultado = await store().flushTudo();

    expect(resultado.bloqueados).toEqual(["Nota.md"]);
    expect(resultado.falhas).toEqual([]);
    expect(disco.get("Nota.md")).toBe("externo");
  });

  it("achado 02: flushTudo propaga falha de gravação em vez de resolver em silêncio", async () => {
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    const escreverOriginal = adapter.escreverTexto;
    adapter.escreverTexto = async () => {
      throw new Error("EACCES");
    };
    try {
      store().editar("Nota.md", "local");

      const resultado = await store().flushTudo();

      expect(resultado.falhas).toEqual(["Nota.md"]);
      expect(store().docs.get("Nota.md")!.estado).toBe("erro");
      expect(disco.get("Nota.md")).toBe("original");
    } finally {
      adapter.escreverTexto = escreverOriginal;
    }
  });

  it("achado 04: gravação lenta não marca 'salvo' com conteúdo defasado — a revisão nova vai pro disco", async () => {
    vi.useFakeTimers();
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    const escreverOriginal = adapter.escreverTexto;
    let release!: () => void;
    let bloquear = true;
    adapter.escreverTexto = async (p: string, c: string) => {
      if (bloquear) {
        bloquear = false;
        await new Promise<void>((r) => (release = r));
      }
      disco.set(p, c);
    };
    try {
      store().editar("Nota.md", "v1");
      const primeira = store().salvar("Nota.md");
      store().editar("Nota.md", "v2");
      await vi.advanceTimersByTimeAsync(800); // timer de v2: encontra gravação em voo
      release();
      await primeira;
      await vi.advanceTimersByTimeAsync(10); // re-enfileiramento grava v2

      expect(disco.get("Nota.md")).toBe("v2");
      const d = store().docs.get("Nota.md")!;
      expect(d.conteudoDisco).toBe("v2");
      expect(d.estado).not.toBe("erro");
    } finally {
      adapter.escreverTexto = escreverOriginal;
    }
  });

  it("achado 03: salvarAteDrenar captura a edição feita durante uma gravação em voo", async () => {
    vi.useFakeTimers();
    disco.set("Nota.md", "original");
    await store().abrir("Nota.md");
    const escreverOriginal = adapter.escreverTexto;
    let release!: () => void;
    let bloquear = true;
    adapter.escreverTexto = async (p: string, c: string) => {
      if (bloquear) {
        bloquear = false;
        await new Promise<void>((r) => (release = r));
      }
      disco.set(p, c);
    };
    try {
      store().editar("Nota.md", "v1");
      const primeira = store().salvar("Nota.md");
      store().editar("Nota.md", "v2");

      const dreno = store().salvarAteDrenar("Nota.md");
      release();
      await primeira;
      const resultado = await dreno;
      await vi.advanceTimersByTimeAsync(10);

      expect(resultado).toBe("salvo");
      expect(disco.get("Nota.md")).toBe("v2");
    } finally {
      adapter.escreverTexto = escreverOriginal;
    }
  });

  it("salvarAteDrenar retorna 'bloqueado' para documento em conflito", async () => {
    await abrirComConflito();

    expect(await store().salvarAteDrenar("Nota.md")).toBe("bloqueado");
    expect(disco.get("Nota.md")).toBe("externo");
  });
});
