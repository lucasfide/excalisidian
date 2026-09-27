import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

import { encontrarWallpaper, WALLPAPERS } from "../data/wallpapers";
import type { Wallpaper } from "../types/wallpaper";

const CHAVE_WALLPAPER = "wallpaperId";
const CHAVE_PAUSADO = "wallpaperPausado";

interface WallpaperState {
  wallpaperAtual: Wallpaper;
  pausado: boolean;
  carregado: boolean;
  carregar(): Promise<void>;
  definirWallpaper(id: string): void;
  proximo(): void;
  anterior(): void;
  alternarPausa(): void;
}

async function salvar(chave: string, valor: string | boolean): Promise<void> {
  try {
    const store = await load("settings.json", { autoSave: false });
    await store.set(chave, valor);
    await store.save();
  } catch {
    // Em preview/web sem o plugin Tauri, a seleção continua ativa até fechar a página.
  }
}

function obterVizinho(id: string, direcao: -1 | 1): Wallpaper {
  const indiceAtual = WALLPAPERS.findIndex((wallpaper) => wallpaper.id === id);
  const indiceSeguro = indiceAtual < 0 ? 0 : indiceAtual;
  const indiceSeguinte = (indiceSeguro + direcao + WALLPAPERS.length) % WALLPAPERS.length;
  return WALLPAPERS[indiceSeguinte];
}

export const useWallpaperStore = create<WallpaperState>((set, get) => ({
  wallpaperAtual: WALLPAPERS[0],
  pausado: false,
  carregado: false,

  async carregar() {
    try {
      const store = await load("settings.json", { autoSave: false });
      const [idSalvo, pausadoSalvo] = await Promise.all([
        store.get<string>(CHAVE_WALLPAPER),
        store.get<boolean>(CHAVE_PAUSADO),
      ]);
      set({
        wallpaperAtual: encontrarWallpaper(idSalvo),
        pausado: typeof pausadoSalvo === "boolean" ? pausadoSalvo : false,
      });
    } catch {
      // Sem preferências salvas (ou fora do Tauri): usar o primeiro wallpaper.
    }
    set({ carregado: true });
  },

  definirWallpaper(id) {
    const wallpaper = WALLPAPERS.find((item) => item.id === id);
    if (!wallpaper || wallpaper.id === get().wallpaperAtual.id) return;
    set({ wallpaperAtual: wallpaper });
    void salvar(CHAVE_WALLPAPER, wallpaper.id);
  },

  proximo() {
    const seguinte = obterVizinho(get().wallpaperAtual.id, 1);
    set({ wallpaperAtual: seguinte });
    void salvar(CHAVE_WALLPAPER, seguinte.id);
  },

  anterior() {
    const anterior = obterVizinho(get().wallpaperAtual.id, -1);
    set({ wallpaperAtual: anterior });
    void salvar(CHAVE_WALLPAPER, anterior.id);
  },

  alternarPausa() {
    const pausado = !get().pausado;
    set({ pausado });
    void salvar(CHAVE_PAUSADO, pausado);
  },
}));
