// Estado global do vault (zustand). Não guarda conteúdo de arquivo além do que está na aba
// aberta agora — o resto vive no disco e no índice. Uma aba só até a Fatia 4.

import { create } from "zustand";

import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import type { EntradaArquivo } from "../vault/VaultAdapter";
import { montarArvore, tipoDoArquivo, type NoArvore } from "../vault/arvore";
import { parsearNota, type FileMeta } from "../indice/parser";
import {
  construirIndiceResolucao,
  resolverLink,
  type IndiceResolucao,
} from "../indice/resolucao";
import {
  construirIndiceLinks,
  type Backlink,
  type IndiceLinks,
} from "../indice/backlinks";
import { carregarIndice, salvarIndice } from "../indice/cache";

export type EstadoSalvamento =
  | "limpo"
  | "editando"
  | "salvando"
  | "salvo"
  | "erro";

export type StatusIndice = "vazio" | "indexando" | "pronto";

const RESOLUCAO_VAZIA: IndiceResolucao = {
  porCaminho: new Map(),
  porBasename: new Map(),
};
const LINKS_VAZIO: IndiceLinks = {
  backlinks: new Map(),
  naoResolvidos: new Map(),
};

interface VaultState {
  adapter: TauriVaultAdapter | null;
  raiz: string;
  entradas: EntradaArquivo[];
  arvore: NoArvore | null;
  pastasAbertas: Set<string>;

  indice: Map<string, FileMeta>;
  resolucao: IndiceResolucao;
  links: IndiceLinks;
  statusIndice: StatusIndice;

  caminhoAberto: string | null;
  conteudoDisco: string;
  conteudoEditor: string;
  estadoSalvamento: EstadoSalvamento;
  erroSalvamento: string | null;

  definirAdapter(adapter: TauriVaultAdapter): Promise<void>;
  recarregarArvore(): Promise<void>;
  reindexar(): Promise<void>;
  reindexarArquivo(path: string): Promise<void>;
  resolver(alvo: string, origem: string): string | null;
  backlinksDe(path: string): Backlink[];
  alternarPasta(path: string): void;
  abrirArquivo(path: string): Promise<void>;
  fecharArquivo(): void;
  editar(texto: string): void;
  salvar(): Promise<void>;
}

/** Reconstrói os índices derivados a partir de um Map de FileMeta e da lista de caminhos. */
function derivar(indice: Map<string, FileMeta>, todosCaminhos: string[]) {
  const resolucao = construirIndiceResolucao(todosCaminhos);
  const links = construirIndiceLinks(indice.values(), resolucao);
  return { resolucao, links };
}

export const useVaultStore = create<VaultState>((set, get) => ({
  adapter: null,
  raiz: "",
  entradas: [],
  arvore: null,
  pastasAbertas: new Set(),

  indice: new Map(),
  resolucao: RESOLUCAO_VAZIA,
  links: LINKS_VAZIO,
  statusIndice: "vazio",

  caminhoAberto: null,
  conteudoDisco: "",
  conteudoEditor: "",
  estadoSalvamento: "limpo",
  erroSalvamento: null,

  async definirAdapter(adapter) {
    set({
      adapter,
      raiz: adapter.raiz(),
      indice: new Map(),
      resolucao: RESOLUCAO_VAZIA,
      links: LINKS_VAZIO,
      statusIndice: "vazio",
      caminhoAberto: null,
    });
    await get().recarregarArvore();
    await get().reindexar();
  },

  async recarregarArvore() {
    const { adapter } = get();
    if (!adapter) return;
    const entradas = await adapter.listar();
    set({ entradas, arvore: montarArvore(entradas) });
  },

  async reindexar() {
    const { adapter, entradas } = get();
    if (!adapter) return;
    set({ statusIndice: "indexando" });

    // Base para reparse incremental: o índice em memória, ou o cache em disco no boot.
    const base =
      get().indice.size > 0 ? get().indice : (await carregarIndice(adapter.raiz())) ?? new Map();

    const arquivos = entradas.filter(
      (e) => !e.isDir && tipoDoArquivo(e.path) !== "attachment",
    );
    const novo = new Map<string, FileMeta>();
    for (const e of arquivos) {
      const anterior = base.get(e.path);
      if (anterior && anterior.mtimeMs === e.mtimeMs && anterior.size === e.size) {
        novo.set(e.path, anterior);
      } else {
        try {
          const texto = await adapter.lerTexto(e.path);
          novo.set(
            e.path,
            parsearNota(e.path, texto, { mtimeMs: e.mtimeMs, size: e.size }),
          );
        } catch {
          // arquivo ilegível: fica de fora do índice nesta passada
        }
      }
    }

    const todosCaminhos = entradas.filter((e) => !e.isDir).map((e) => e.path);
    const { resolucao, links } = derivar(novo, todosCaminhos);
    set({ indice: novo, resolucao, links, statusIndice: "pronto" });
    void salvarIndice(adapter.raiz(), novo.values());
  },

  async reindexarArquivo(path) {
    const { adapter, entradas, indice } = get();
    if (!adapter || tipoDoArquivo(path) === "attachment") return;
    const entrada = entradas.find((e) => e.path === path);
    const novo = new Map(indice);
    try {
      const texto = await adapter.lerTexto(path);
      novo.set(
        path,
        parsearNota(path, texto, {
          mtimeMs: entrada?.mtimeMs ?? Date.now(),
          size: entrada?.size ?? texto.length,
        }),
      );
    } catch {
      novo.delete(path);
    }
    const todosCaminhos = entradas.filter((e) => !e.isDir).map((e) => e.path);
    const { resolucao, links } = derivar(novo, todosCaminhos);
    set({ indice: novo, resolucao, links });
    void salvarIndice(get().raiz, novo.values());
  },

  resolver(alvo, origem) {
    return resolverLink(get().resolucao, alvo, origem);
  },

  backlinksDe(path) {
    return get().links.backlinks.get(path) ?? [];
  },

  alternarPasta(path) {
    const abertas = new Set(get().pastasAbertas);
    if (abertas.has(path)) abertas.delete(path);
    else abertas.add(path);
    set({ pastasAbertas: abertas });
  },

  async abrirArquivo(path) {
    const { adapter } = get();
    if (!adapter) return;
    try {
      const texto = await adapter.lerTexto(path);
      set({
        caminhoAberto: path,
        conteudoDisco: texto,
        conteudoEditor: texto,
        estadoSalvamento: "limpo",
        erroSalvamento: null,
      });
    } catch (e) {
      set({ estadoSalvamento: "erro", erroSalvamento: String(e) });
    }
  },

  fecharArquivo() {
    set({
      caminhoAberto: null,
      conteudoDisco: "",
      conteudoEditor: "",
      estadoSalvamento: "limpo",
      erroSalvamento: null,
    });
  },

  editar(texto) {
    const { conteudoDisco } = get();
    set({
      conteudoEditor: texto,
      estadoSalvamento: texto === conteudoDisco ? "limpo" : "editando",
    });
  },

  async salvar() {
    const { adapter, caminhoAberto, conteudoEditor, conteudoDisco } = get();
    if (!adapter || !caminhoAberto) return;
    if (conteudoEditor === conteudoDisco) return; // nada mudou: não grava, não suja o Git
    set({ estadoSalvamento: "salvando", erroSalvamento: null });
    try {
      await adapter.escreverTexto(caminhoAberto, conteudoEditor);
      set({ conteudoDisco: conteudoEditor, estadoSalvamento: "salvo" });
      void get().reindexarArquivo(caminhoAberto);
      setTimeout(() => {
        if (
          get().estadoSalvamento === "salvo" &&
          get().conteudoEditor === get().conteudoDisco
        ) {
          set({ estadoSalvamento: "limpo" });
        }
      }, 1200);
    } catch (e) {
      set({ estadoSalvamento: "erro", erroSalvamento: String(e) });
    }
  },
}));
