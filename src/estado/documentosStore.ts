// Estado por documento aberto (doc 05 §7 / doc 04 §1). Cada aba do workspace tem uma entrada
// aqui, com conteúdo em disco vs. no editor, estado de salvamento e autosave próprio com
// debounce de 800 ms (doc 04 §2). O conteúdo NÃO vive no store do vault — vive aqui.

import { create } from "zustand";

import { useVaultStore } from "./vaultStore";
import { tipoDoArquivo } from "../vault/arvore";

export type EstadoDoc =
  | "limpo"
  | "editando"
  | "salvando"
  | "salvo"
  | "erro"
  | "conflito"
  | "orfao";

export interface DocEstado {
  path: string;
  conteudoDisco: string;
  conteudoEditor: string;
  estado: EstadoDoc;
  erro: string | null;
  /** Bump a cada recarga externa: o EditorNota remonta quando muda. */
  versao: number;
}

const DEBOUNCE_MS = 800;
const timers = new Map<string, number>();
/** Gravações em voo: `flushTudo` e o autosave não iniciam uma segunda para o mesmo path. */
const gravando = new Map<string, Promise<void>>();

interface DocumentosState {
  docs: Map<string, DocEstado>;
  abrir(path: string): Promise<void>;
  editar(path: string, texto: string): void;
  salvar(path: string): Promise<void>;
  recarregarDoDisco(path: string): Promise<void>;
  /** Grava o conteúdo do editor por cima do disco, resolvendo um conflito. */
  manterMinhaVersao(path: string): Promise<void>;
  /** Recria no disco um arquivo apagado por fora, com o conteúdo desta aba. */
  recriar(path: string): Promise<void>;
  /** Reage a eventos externos do watcher nos arquivos abertos (doc 02 §11). */
  aoEventoExterno(paths: string[]): Promise<void>;
  flushTudo(): Promise<void>;
  fechar(path: string): void;
  renomearNoMapa(antigo: string, novo: string): void;
}

function patch(
  set: (fn: (s: DocumentosState) => Partial<DocumentosState>) => void,
  path: string,
  mudanca: Partial<DocEstado>,
) {
  set((s) => {
    const atual = s.docs.get(path);
    if (!atual) return {};
    const docs = new Map(s.docs);
    docs.set(path, { ...atual, ...mudanca });
    return { docs };
  });
}

export const useDocumentosStore = create<DocumentosState>((set, get) => ({
  docs: new Map(),

  async abrir(path) {
    if (get().docs.has(path)) return;
    const adapter = useVaultStore.getState().adapter;
    if (!adapter) return;
    try {
      const texto = await adapter.lerTexto(path);
      set((s) => {
        const docs = new Map(s.docs);
        docs.set(path, {
          path,
          conteudoDisco: texto,
          conteudoEditor: texto,
          estado: "limpo",
          erro: null,
          versao: 0,
        });
        return { docs };
      });
    } catch (e) {
      set((s) => {
        const docs = new Map(s.docs);
        docs.set(path, {
          path,
          conteudoDisco: "",
          conteudoEditor: "",
          estado: "orfao",
          erro: String(e),
          versao: 0,
        });
        return { docs };
      });
    }
  },

  editar(path, texto) {
    const doc = get().docs.get(path);
    if (!doc) return;
    patch(set, path, {
      conteudoEditor: texto,
      estado: texto === doc.conteudoDisco ? "limpo" : "editando",
    });
    window.clearTimeout(timers.get(path));
    if (texto !== doc.conteudoDisco) {
      timers.set(
        path,
        window.setTimeout(() => void get().salvar(path), DEBOUNCE_MS),
      );
    }
  },

  async salvar(path) {
    const emVoo = gravando.get(path);
    if (emVoo) return emVoo;

    const doc = get().docs.get(path);
    const adapter = useVaultStore.getState().adapter;
    if (!doc || !adapter) return;
    window.clearTimeout(timers.get(path));
    if (doc.conteudoEditor === doc.conteudoDisco) return; // nada mudou: não grava

    const alvo = doc.conteudoEditor;
    patch(set, path, { estado: "salvando", erro: null });
    const tarefa = (async () => {
      try {
        await adapter.escreverTexto(path, alvo);
        patch(set, path, { conteudoDisco: alvo, estado: "salvo" });
        void useVaultStore.getState().reindexarArquivo(path);
        window.setTimeout(() => {
          const d = get().docs.get(path);
          if (d && d.estado === "salvo" && d.conteudoEditor === d.conteudoDisco) {
            patch(set, path, { estado: "limpo" });
          }
        }, 1200);
      } catch (e) {
        patch(set, path, { estado: "erro", erro: String(e) });
      } finally {
        gravando.delete(path);
      }
    })();
    gravando.set(path, tarefa);
    return tarefa;
  },

  async recarregarDoDisco(path) {
    if (!get().docs.has(path)) return;
    const adapter = useVaultStore.getState().adapter;
    if (!adapter) return;
    window.clearTimeout(timers.get(path));
    try {
      const texto = await adapter.lerTexto(path);
      const versaoAtual = get().docs.get(path)?.versao ?? 0;
      patch(set, path, {
        conteudoDisco: texto,
        conteudoEditor: texto,
        estado: "limpo",
        erro: null,
        versao: versaoAtual + 1,
      });
    } catch (e) {
      patch(set, path, { estado: "orfao", erro: String(e) });
    }
  },

  async manterMinhaVersao(path) {
    const doc = get().docs.get(path);
    const adapter = useVaultStore.getState().adapter;
    if (!doc || !adapter) return;
    const alvo = doc.conteudoEditor;
    patch(set, path, { estado: "salvando", erro: null });
    try {
      await adapter.escreverTexto(path, alvo);
      patch(set, path, { conteudoDisco: alvo, estado: "limpo" });
      void useVaultStore.getState().reindexarArquivo(path);
    } catch (e) {
      patch(set, path, { estado: "erro", erro: String(e) });
    }
  },

  async recriar(path) {
    await get().manterMinhaVersao(path);
  },

  async aoEventoExterno(paths) {
    const adapter = useVaultStore.getState().adapter;
    if (!adapter) return;
    for (const path of paths) {
      const doc = get().docs.get(path);
      if (!doc) continue;
      const sujo = doc.conteudoEditor !== doc.conteudoDisco;
      let textoDisco: string | null = null;
      try {
        textoDisco = await adapter.lerTexto(path);
      } catch {
        // sumiu do disco: aba órfã, com ou sem edição pendente (doc 02 §11)
        patch(set, path, { estado: "orfao", erro: "Este arquivo não existe mais no disco." });
        continue;
      }
      if (textoDisco === doc.conteudoDisco) continue; // nada de novo no disco
      // Desenho nunca recarrega em silêncio: recarregar descarta seleção, viewport e
      // histórico de desfazer, o que é destrutivo mesmo sem edição pendente (doc 02 §11).
      const desenho = tipoDoArquivo(path) === "drawing";
      if (!sujo && !desenho) {
        await get().recarregarDoDisco(path);
      } else {
        patch(set, path, { estado: "conflito" });
      }
    }
  },

  async flushTudo() {
    const sujos = () =>
      [...get().docs.values()].filter(
        (d) => d.conteudoEditor !== d.conteudoDisco && d.estado !== "erro",
      );
    // Duas passadas: se uma gravação estava em voo com conteúdo já defasado, a
    // segunda pega o conteúdo mais novo.
    await Promise.all(sujos().map((d) => get().salvar(d.path)));
    await Promise.all(sujos().map((d) => get().salvar(d.path)));
  },

  fechar(path) {
    window.clearTimeout(timers.get(path));
    timers.delete(path);
    set((s) => {
      const docs = new Map(s.docs);
      docs.delete(path);
      return { docs };
    });
  },

  renomearNoMapa(antigo, novo) {
    set((s) => {
      const d = s.docs.get(antigo);
      if (!d) return {};
      const docs = new Map(s.docs);
      docs.delete(antigo);
      docs.set(novo, { ...d, path: novo });
      return { docs };
    });
    const t = timers.get(antigo);
    if (t !== undefined) {
      timers.delete(antigo);
      timers.set(novo, t);
    }
  },
}));
