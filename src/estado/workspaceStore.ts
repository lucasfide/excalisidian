// Estado do workspace: a API do dockview, o caminho da aba ativa, e a pilha de abas
// fechadas para o `Ctrl+Shift+T`. O layout em si mora no dockview e é serializado por
// layout/persistencia.ts.

import { create } from "zustand";
import type { DockviewApi, IDockviewPanel } from "dockview";

import { useDocumentosStore } from "./documentosStore";

function nomeCurto(path: string): string {
  const n = path.slice(path.lastIndexOf("/") + 1);
  return n.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
}

function pathDoPainel(p: IDockviewPanel | undefined | null): string | null {
  return (p?.params as { path?: string } | undefined)?.path ?? null;
}

export type DirecaoSplit = "right" | "below";

interface WorkspaceState {
  api: DockviewApi | null;
  caminhoAtivo: string | null;
  fechadosRecentes: string[];
  /** Grava o layout na hora, cancelando o debounce. Registrado pelo Workspace. */
  flushLayout: () => void;

  setApi(api: DockviewApi | null): void;
  setFlushLayout(fn: () => void): void;
  definirAtivo(path: string | null): void;
  abrirDocumento(path: string): void;
  renomearDocumento(antigo: string, novo: string): void;
  novaAbaVazia(): void;
  dividirAtivo(direcao: DirecaoSplit): void;
  fecharAtivo(): void;
  reabrirUltimo(): void;
  cicloAba(direcao: 1 | -1): void;
  ativarPorIndice(n: number): void;
  aoRemoverPainel(id: string, path: string | null): void;
}

/** Ids de painel que estão sendo renomeados: `aoRemoverPainel` os ignora. */
const renomeando = new Set<string>();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  api: null,
  caminhoAtivo: null,
  fechadosRecentes: [],
  flushLayout: () => {},

  setApi(api) {
    set({ api });
  },

  setFlushLayout(fn) {
    set({ flushLayout: fn });
  },

  definirAtivo(path) {
    set({ caminhoAtivo: path });
  },

  abrirDocumento(path) {
    const { api } = get();
    if (!api) return;
    void useDocumentosStore.getState().abrir(path);
    const existente = api.getPanel(path);
    if (existente) {
      existente.api.setActive();
      return;
    }
    api.addPanel({
      id: path,
      component: "documento",
      title: nomeCurto(path),
      params: { path },
    });
  },

  renomearDocumento(antigo, novo) {
    const { api } = get();
    useDocumentosStore.getState().renomearNoMapa(antigo, novo);
    if (!api) return;
    // Recria TODOS os painéis que apontam para o caminho antigo (o mesmo arquivo
    // pode estar aberto em vários painéis via split).
    const alvos = api.panels.filter((p) => pathDoPainel(p) === antigo);
    for (const painel of alvos) {
      const eraAtivo = api.activePanel === painel;
      const idNovo =
        painel.id === antigo ? novo : `${novo}::${crypto.randomUUID()}`;
      renomeando.add(painel.id);
      api.removePanel(painel);
      api.addPanel({
        id: idNovo,
        component: "documento",
        title: nomeCurto(novo),
        params: { path: novo },
      });
      if (eraAtivo) api.getPanel(idNovo)?.api.setActive();
    }
  },

  novaAbaVazia() {
    const { api } = get();
    if (!api) return;
    api.addPanel({
      id: `vazio:${crypto.randomUUID()}`,
      component: "vazio",
      title: "Sem título",
      params: {},
    });
  },

  dividirAtivo(direcao) {
    const { api } = get();
    const alvo = api?.activePanel;
    if (!api || !alvo) return;
    const path = pathDoPainel(alvo);
    api.addPanel({
      id: path ? `${path}::${direcao}::${crypto.randomUUID()}` : `vazio:${crypto.randomUUID()}`,
      component: path ? "documento" : "vazio",
      title: alvo.title,
      params: path ? { path } : {},
      position: { referencePanel: alvo.id, direction: direcao },
    });
  },

  fecharAtivo() {
    const { api } = get();
    api?.activePanel?.api.close();
  },

  reabrirUltimo() {
    const pilha = [...get().fechadosRecentes];
    const ultimo = pilha.pop();
    if (!ultimo) return;
    set({ fechadosRecentes: pilha });
    get().abrirDocumento(ultimo);
  },

  cicloAba(direcao) {
    const { api } = get();
    if (!api) return;
    const paineis = api.panels;
    if (paineis.length < 2) return;
    const i = paineis.findIndex((p) => p === api.activePanel);
    const prox = (i + direcao + paineis.length) % paineis.length;
    paineis[prox].api.setActive();
  },

  ativarPorIndice(n) {
    const { api } = get();
    if (!api) return;
    const paineis = api.panels;
    if (paineis.length === 0) return;
    // 1..8 → posição; 9 → último (convenção do Obsidian).
    const alvo = n >= 9 ? paineis[paineis.length - 1] : paineis[n - 1];
    alvo?.api.setActive();
  },

  aoRemoverPainel(id, path) {
    if (renomeando.has(id)) {
      renomeando.delete(id);
      return;
    }
    // Aba vazia ou clone de split sem caminho: nada a persistir.
    if (!path) return;
    // Só descarta o estado do documento se nenhum outro painel ainda o mostra.
    const api = get().api;
    const aindaAberto = api?.panels.some((p) => pathDoPainel(p) === path) ?? false;
    if (!aindaAberto) {
      void useDocumentosStore.getState().salvar(path);
      useDocumentosStore.getState().fechar(path);
    }
    set((s) => ({
      fechadosRecentes: [
        ...s.fechadosRecentes.filter((p) => p !== path),
        path,
      ].slice(-20),
    }));
  },
}));
