// Preferências do app que sobrevivem ao fechar (settings.json via plugin-store — mesmo
// arquivo que TauriVaultAdapter usa pro caminho do vault, chave diferente). Hoje só o tema:
// tamanho da janela e vaults recentes ficam para quando fizerem falta de verdade.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

export type Tema = "sistema" | "claro" | "escuro";

const CHAVE_TEMA = "tema";
const TEMAS_VALIDOS: readonly Tema[] = ["sistema", "claro", "escuro"];

function ehTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS_VALIDOS as readonly string[]).includes(v);
}

interface PrefsState {
  tema: Tema;
  /** true assim que `carregar()` terminou — antes disso `tema` é só o padrão local. */
  carregado: boolean;
  carregar(): Promise<void>;
  definirTema(tema: Tema): void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  tema: "sistema",
  carregado: false,

  async carregar() {
    try {
      const store = await load("settings.json", { autoSave: false });
      const salvo = await store.get<Tema>(CHAVE_TEMA);
      if (ehTema(salvo)) {
        set({ tema: salvo });
      }
    } catch {
      // Sem preferência salva ainda (primeira execução): fica no padrão "sistema".
    }
    set({ carregado: true });
  },

  definirTema(tema) {
    set({ tema });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_TEMA, tema);
      await store.save();
    })();
  },
}));
