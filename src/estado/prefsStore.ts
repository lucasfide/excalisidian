// Preferências do app que sobrevivem ao fechar (settings.json via plugin-store — mesmo
// arquivo que TauriVaultAdapter usa pro caminho do vault, chave diferente). Tema e largura da
// coluna de texto; tamanho da janela e vaults recentes ficam para quando fizerem falta de
// verdade.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

export type Tema = "sistema" | "claro" | "escuro";
export type LarguraNota = "pequena" | "media" | "full";

const CHAVE_TEMA = "tema";
const CHAVE_LARGURA_NOTA = "larguraNota";
const CHAVE_SIDEBAR_COLAPSADA = "sidebarColapsada";
const TEMAS_VALIDOS: readonly Tema[] = ["sistema", "claro", "escuro"];
const LARGURAS_VALIDAS: readonly LarguraNota[] = ["pequena", "media", "full"];

function ehTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS_VALIDOS as readonly string[]).includes(v);
}

function ehLarguraNota(v: unknown): v is LarguraNota {
  return typeof v === "string" && (LARGURAS_VALIDAS as readonly string[]).includes(v);
}

interface PrefsState {
  tema: Tema;
  larguraNota: LarguraNota;
  sidebarColapsada: boolean;
  /** true assim que `carregar()` terminou — antes disso os campos acima são só o padrão local. */
  carregado: boolean;
  carregar(): Promise<void>;
  definirTema(tema: Tema): void;
  definirLarguraNota(largura: LarguraNota): void;
  alternarSidebar(): void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  tema: "sistema",
  larguraNota: "media",
  sidebarColapsada: false,
  carregado: false,

  async carregar() {
    try {
      const store = await load("settings.json", { autoSave: false });
      const [temaSalvo, larguraSalva, sidebarColapsadaSalva] = await Promise.all([
        store.get<Tema>(CHAVE_TEMA),
        store.get<LarguraNota>(CHAVE_LARGURA_NOTA),
        store.get<boolean>(CHAVE_SIDEBAR_COLAPSADA),
      ]);
      if (ehTema(temaSalvo)) set({ tema: temaSalvo });
      if (ehLarguraNota(larguraSalva)) set({ larguraNota: larguraSalva });
      if (typeof sidebarColapsadaSalva === "boolean") set({ sidebarColapsada: sidebarColapsadaSalva });
    } catch {
      // Sem preferência salva ainda (primeira execução): fica nos padrões locais.
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

  definirLarguraNota(largura) {
    set({ larguraNota: largura });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_LARGURA_NOTA, largura);
      await store.save();
    })();
  },

  alternarSidebar() {
    const sidebarColapsada = !usePrefsStore.getState().sidebarColapsada;
    set({ sidebarColapsada });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_SIDEBAR_COLAPSADA, sidebarColapsada);
      await store.save();
    })();
  },
}));
