// Estado global do vault (zustand): raiz, árvore, índice, backlinks, status de indexação.
// O conteúdo dos arquivos abertos NÃO vive aqui — vive no documentosStore, por aba
// (doc 05 §7). A aba ativa vive no workspaceStore.

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
import { hashConteudo, deveIgnorarEvento } from "../vault/escritaAtomica";
import { useDocumentosStore } from "./documentosStore";
import type { EventoArquivo } from "../vault/VaultAdapter";

// Acima deste número de eventos num lote (ex.: git checkout), reindexa tudo em vez de
// arquivo por arquivo.
const LOTE_GRANDE = 50;

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
  /** Pasta em que "Nova nota/desenho/pasta" cria, quando definida. */
  pastaSelecionada: string | null;

  indice: Map<string, FileMeta>;
  resolucao: IndiceResolucao;
  links: IndiceLinks;
  statusIndice: StatusIndice;

  definirAdapter(adapter: TauriVaultAdapter): Promise<void>;
  recarregarArvore(): Promise<void>;
  reindexar(): Promise<void>;
  reindexarArquivo(path: string): Promise<void>;
  reconciliar(eventos: EventoArquivo[]): Promise<void>;
  resolver(alvo: string, origem: string): string | null;
  backlinksDe(path: string): Backlink[];
  alternarPasta(path: string): void;
  selecionarPasta(path: string | null): void;
}

let cancelarWatcher: () => void = () => {};

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
  pastaSelecionada: null,

  indice: new Map(),
  resolucao: RESOLUCAO_VAZIA,
  links: LINKS_VAZIO,
  statusIndice: "vazio",

  async definirAdapter(adapter) {
    set({
      adapter,
      raiz: adapter.raiz(),
      indice: new Map(),
      resolucao: RESOLUCAO_VAZIA,
      links: LINKS_VAZIO,
      statusIndice: "vazio",
      pastaSelecionada: null,
    });
    await get().recarregarArvore();
    await get().reindexar();

    cancelarWatcher();
    cancelarWatcher = adapter.observar((eventos) => {
      void get().reconciliar(eventos);
    });
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

    const base =
      get().indice.size > 0
        ? get().indice
        : (await carregarIndice(adapter.raiz())) ?? new Map();

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

  async reconciliar(eventos) {
    const { adapter } = get();
    if (!adapter || eventos.length === 0) return;
    const docs = useDocumentosStore.getState();

    if (eventos.length > LOTE_GRANDE) {
      // Lote grande (ex.: git checkout): reindexa tudo de uma vez.
      await get().recarregarArvore();
      await get().reindexar();
      await docs.aoEventoExterno([...new Set(eventos.map((e) => e.path))]);
      return;
    }

    const afetados: string[] = [];
    for (const ev of eventos) {
      if (ev.tipo === "removido") {
        afetados.push(ev.path);
        continue;
      }
      // Foi a nossa própria gravação atômica? Então ignora (doc 02 §10).
      try {
        const texto = await adapter.lerTexto(ev.path);
        if (deveIgnorarEvento(adapter.absoluto(ev.path), await hashConteudo(texto))) {
          continue;
        }
      } catch {
        // sumiu entre o evento e a leitura: trata como afetado
      }
      afetados.push(ev.path);
    }
    if (afetados.length === 0) return;

    await get().recarregarArvore();
    for (const path of [...new Set(afetados)]) {
      await get().reindexarArquivo(path);
    }
    await docs.aoEventoExterno([...new Set(afetados)]);
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

  selecionarPasta(path) {
    set({ pastaSelecionada: path });
  },
}));
