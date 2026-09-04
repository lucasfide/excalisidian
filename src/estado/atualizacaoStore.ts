// Estado do fluxo de atualização (spec 2026-09-04): guarda a oferta vinda do updater do
// Tauri e conduz a instalação. Textos do diálogo em docs/04, seção "Atualizações".

import { create } from "zustand";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

type Fase = "oculto" | "disponivel" | "baixando" | "reiniciar" | "erro";

interface AtualizacaoState {
  fase: Fase;
  versao: string | null;
  notas: string | null;
  /** 0..1, só relevante durante "baixando". */
  progresso: number;
  mensagemErro: string | null;
  oferecer(update: Update): void;
  aplicar(): Promise<void>;
  adiar(): void;
  fechar(): void;
}

// Guardado fora do zustand: é uma instância de classe do plugin, não um dado serializável de
// UI. Um só por vez — o app nunca oferece duas atualizações ao mesmo tempo.
let updateAtual: Update | null = null;

export const useAtualizacaoStore = create<AtualizacaoState>((set, get) => ({
  fase: "oculto",
  versao: null,
  notas: null,
  progresso: 0,
  mensagemErro: null,

  oferecer(update) {
    updateAtual = update;
    set({
      fase: "disponivel",
      versao: update.version,
      notas: update.body ?? null,
      mensagemErro: null,
    });
  },

  async aplicar() {
    const update = updateAtual;
    if (!update) return;

    set({ fase: "baixando", progresso: 0 });
    let total = 0;
    let baixado = 0;

    try {
      await update.downloadAndInstall((evento) => {
        switch (evento.event) {
          case "Started":
            total = evento.data.contentLength ?? 0;
            break;
          case "Progress":
            baixado += evento.data.chunkLength;
            set({
              progresso: total > 0 ? Math.min(baixado / total, 1) : get().progresso,
            });
            break;
          case "Finished":
            set({ progresso: 1 });
            break;
        }
      });
    } catch {
      set({
        fase: "erro",
        mensagemErro: "Não foi possível baixar a atualização. Tente de novo mais tarde.",
      });
      return;
    }

    // Reinício num try/catch separado: se falhar, a atualização já foi instalada com
    // sucesso, então não é um erro — mas o usuário não pode ficar preso no diálogo de
    // download para sempre. Fase "reiniciar" pede pra fechar e abrir o app de novo.
    try {
      await relaunch();
    } catch (erro) {
      console.warn("Falha ao reiniciar depois de instalar a atualização:", erro);
      set({ fase: "reiniciar" });
    }
  },

  adiar() {
    set({ fase: "oculto" });
  },

  fechar() {
    set({ fase: "oculto", mensagemErro: null });
  },
}));
