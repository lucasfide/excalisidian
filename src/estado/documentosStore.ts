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
/** Limite de iterações do dreno: cada passada grava o conteúdo mais recente; se o usuário
 * continuar digitando durante uma gravação lenta, o dreno converge sem laço infinito. */
const MAX_PASSADAS_DRENO = 10;
const timers = new Map<string, number>();
/** Gravações em voo: `flushTudo` e o autosave não iniciam uma segunda para o mesmo path. */
const gravando = new Map<string, Promise<boolean>>();

/** Resultado de `flushTudo`: o que falhou e o que exige decisão do usuário (doc 04 §1). */
export interface ResultadoFlush {
  /** Documentos cuja gravação falhou (permissão, disco cheio…). */
  falhas: string[];
  /** Documentos em conflito/órfão com edição pendente: só o usuário resolve. */
  bloqueados: string[];
}

/** Resultado do dreno de um documento ao fechar a aba (auditoria 12/09, achados 02/03). */
export type ResultadoDreno = "salvo" | "erro" | "bloqueado";

interface DocumentosState {
  docs: Map<string, DocEstado>;
  abrir(path: string): Promise<void>;
  editar(path: string, texto: string): void;
  /** Grava o conteúdo atual. Resolve `true` se a gravação desta revisão teve sucesso;
   * `false` em falha ou estado bloqueado. Nunca lança. */
  salvar(path: string): Promise<boolean>;
  /** Grava até o disco alcançar o conteúdo mais recente do editor, incluindo edições
   * feitas durante uma gravação lenta. Usado ao fechar aba e no flush de fechamento. */
  salvarAteDrenar(path: string): Promise<ResultadoDreno>;
  recarregarDoDisco(path: string): Promise<void>;
  /** Grava o conteúdo do editor por cima do disco, resolvendo um conflito. */
  manterMinhaVersao(path: string): Promise<void>;
  /** Recria no disco um arquivo apagado por fora, com o conteúdo desta aba. */
  recriar(path: string): Promise<void>;
  /** Reage a eventos externos do watcher nos arquivos abertos (doc 02 §11). */
  aoEventoExterno(paths: string[]): Promise<void>;
  flushTudo(): Promise<ResultadoFlush>;
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
    // Em conflito/órfão o autosave NÃO age: só a decisão explícita do usuário
    // (manterMinhaVersao/recriar) grava no disco (doc 04 §1; auditoria 12/09, achado 01).
    // Digitar não rebaixa o estado — a faixa continua visível até a decisão.
    if (doc.estado === "conflito" || doc.estado === "orfao") {
      patch(set, path, { conteudoEditor: texto });
      return;
    }
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
    const doc = get().docs.get(path);
    if (!doc) return true;
    // Conflito/órfão exigem decisão do usuário — o autosave nunca passa por cima
    // (auditoria 12/09, achado 01).
    if (doc.estado === "conflito" || doc.estado === "orfao") return false;

    const emVoo = gravando.get(path);
    if (emVoo) return emVoo;

    const adapter = useVaultStore.getState().adapter;
    if (!adapter) return false;
    window.clearTimeout(timers.get(path));
    if (doc.conteudoEditor === doc.conteudoDisco) return true; // nada mudou: não grava

    const alvo = doc.conteudoEditor;
    patch(set, path, { estado: "salvando", erro: null });
    const tarefa = (async () => {
      let gravou = false;
      try {
        await adapter.escreverTexto(path, alvo);
        gravou = true;
        const maisNovo = get().docs.get(path);
        if (maisNovo && maisNovo.conteudoEditor === alvo) {
          patch(set, path, { conteudoDisco: alvo, estado: "salvo" });
          void useVaultStore.getState().reindexarArquivo(path);
          window.setTimeout(() => {
            const d = get().docs.get(path);
            if (d && d.estado === "salvo" && d.conteudoEditor === d.conteudoDisco) {
              patch(set, path, { estado: "limpo" });
            }
          }, 1200);
        } else if (maisNovo) {
          // Editaram durante a gravação: NÃO marcar "salvo" — o disco tem `alvo`, o
          // editor já tem outra coisa (auditoria 12/09, achado 04).
          patch(set, path, { conteudoDisco: alvo, estado: "editando" });
        }
      } catch (e) {
        patch(set, path, { estado: "erro", erro: String(e) });
      } finally {
        gravando.delete(path);
      }
      // Re-enfileira DEPOIS de liberar `gravando`: se o editor mudou durante a escrita,
      // a revisão mais nova ainda precisa ir pro disco (achado 04).
      if (gravou) {
        const d = get().docs.get(path);
        if (
          d &&
          d.estado === "editando" &&
          d.conteudoEditor !== d.conteudoDisco
        ) {
          void get().salvar(path);
        }
      }
      return gravou;
    })();
    gravando.set(path, tarefa);
    return tarefa;
  },

  async salvarAteDrenar(path) {
    for (let i = 0; i < MAX_PASSADAS_DRENO; i++) {
      const doc = get().docs.get(path);
      if (!doc) return "salvo";
      if (doc.estado === "conflito" || doc.estado === "orfao") return "bloqueado";
      if (doc.conteudoEditor === doc.conteudoDisco && doc.estado !== "salvando") {
        return doc.estado === "erro" ? "erro" : "salvo";
      }
      const ok = await get().salvar(path);
      if (!ok) {
        // Pode ser divergência de revisão (re-enfileirado) ou falha real: o laço
        // reavalia no próximo passo e o limite de passadas corta laço patológico.
        const d = get().docs.get(path);
        if (!d || d.estado === "erro") return "erro";
      }
    }
    const doc = get().docs.get(path);
    if (!doc) return "salvo";
    if (doc.estado === "conflito" || doc.estado === "orfao") return "bloqueado";
    return doc.conteudoEditor === doc.conteudoDisco ? "salvo" : "erro";
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
        // sumiu do disco: aba órfã, com ou sem edição pendente (doc 02 §11).
        // Cancela o autosave: recriar o arquivo é decisão do usuário (achado 01).
        window.clearTimeout(timers.get(path));
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
        // Cancela o debounce pendente: com o timer vivo, o autosave venceria e
        // sobrescreveria a versão externa sem o usuário decidir (achado 01).
        window.clearTimeout(timers.get(path));
        patch(set, path, { estado: "conflito" });
      }
    }
  },

  async flushTudo() {
    const alvos = [...get().docs.values()].filter(
      (d) => d.conteudoEditor !== d.conteudoDisco || d.estado === "salvando",
    );
    const resultados = await Promise.all(
      alvos.map(async (d) => ({
        path: d.path,
        resultado: await get().salvarAteDrenar(d.path),
      })),
    );
    return {
      falhas: resultados.filter((r) => r.resultado === "erro").map((r) => r.path),
      bloqueados: resultados
        .filter((r) => r.resultado === "bloqueado")
        .map((r) => r.path),
    };
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
