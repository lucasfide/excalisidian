// Estado global do vault (zustand). Não guarda conteúdo de arquivo além do que está na aba
// aberta agora — o resto vive no disco e no índice (Fatia 3). Uma aba só nesta fatia.

import { create } from "zustand";

import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import type { EntradaArquivo } from "../vault/VaultAdapter";
import { montarArvore, type NoArvore } from "../vault/arvore";

export type EstadoSalvamento =
  | "limpo"
  | "editando"
  | "salvando"
  | "salvo"
  | "erro";

interface VaultState {
  adapter: TauriVaultAdapter | null;
  raiz: string;
  entradas: EntradaArquivo[];
  arvore: NoArvore | null;
  pastasAbertas: Set<string>;

  caminhoAberto: string | null;
  conteudoDisco: string;
  conteudoEditor: string;
  estadoSalvamento: EstadoSalvamento;
  erroSalvamento: string | null;

  definirAdapter(adapter: TauriVaultAdapter): Promise<void>;
  recarregarArvore(): Promise<void>;
  alternarPasta(path: string): void;
  abrirArquivo(path: string): Promise<void>;
  fecharArquivo(): void;
  editar(texto: string): void;
  salvar(): Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  adapter: null,
  raiz: "",
  entradas: [],
  arvore: null,
  pastasAbertas: new Set(),

  caminhoAberto: null,
  conteudoDisco: "",
  conteudoEditor: "",
  estadoSalvamento: "limpo",
  erroSalvamento: null,

  async definirAdapter(adapter) {
    set({ adapter, raiz: adapter.raiz() });
    await get().recarregarArvore();
  },

  async recarregarArvore() {
    const { adapter } = get();
    if (!adapter) return;
    const entradas = await adapter.listar();
    set({ entradas, arvore: montarArvore(entradas) });
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
      setTimeout(() => {
        if (get().estadoSalvamento === "salvo" && get().conteudoEditor === get().conteudoDisco) {
          set({ estadoSalvamento: "limpo" });
        }
      }, 1200);
    } catch (e) {
      set({ estadoSalvamento: "erro", erroSalvamento: String(e) });
    }
  },
}));
