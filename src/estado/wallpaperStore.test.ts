import { beforeEach, describe, expect, it, vi } from "vitest";

const { armazenado } = vi.hoisted(() => ({ armazenado: new Map<string, unknown>() }));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    async get<T>(chave: string) {
      return armazenado.get(chave) as T | undefined;
    },
    async set(chave: string, valor: unknown) {
      armazenado.set(chave, valor);
    },
    async save() {},
  }),
}));

import { WALLPAPERS } from "../data/wallpapers";
import { useWallpaperStore } from "./wallpaperStore";

beforeEach(() => {
  armazenado.clear();
  useWallpaperStore.setState({
    wallpaperAtual: WALLPAPERS[0],
    pausado: false,
    carregado: false,
  });
});

describe("wallpaperStore", () => {
  it("restaura o papel de parede e o estado de pausa salvos", async () => {
    armazenado.set("wallpaperId", WALLPAPERS[2].id);
    armazenado.set("wallpaperPausado", true);

    await useWallpaperStore.getState().carregar();

    expect(useWallpaperStore.getState().wallpaperAtual.id).toBe(WALLPAPERS[2].id);
    expect(useWallpaperStore.getState().pausado).toBe(true);
    expect(useWallpaperStore.getState().carregado).toBe(true);
  });

  it("ignora uma preferência de wallpaper que não existe", async () => {
    armazenado.set("wallpaperId", "invalido");

    await useWallpaperStore.getState().carregar();

    expect(useWallpaperStore.getState().wallpaperAtual.id).toBe(WALLPAPERS[0].id);
  });

  it("navega nos dois sentidos, volta ao início e persiste a escolha", async () => {
    useWallpaperStore.getState().definirWallpaper(WALLPAPERS[WALLPAPERS.length - 1].id);
    useWallpaperStore.getState().proximo();
    expect(useWallpaperStore.getState().wallpaperAtual.id).toBe(WALLPAPERS[0].id);
    useWallpaperStore.getState().anterior();
    expect(useWallpaperStore.getState().wallpaperAtual.id).toBe(
      WALLPAPERS[WALLPAPERS.length - 1].id,
    );

    await vi.waitFor(() => {
      expect(armazenado.get("wallpaperId")).toBe(WALLPAPERS[WALLPAPERS.length - 1].id);
    });
  });

  it("alterna e persiste a pausa", async () => {
    useWallpaperStore.getState().alternarPausa();
    expect(useWallpaperStore.getState().pausado).toBe(true);

    await vi.waitFor(() => expect(armazenado.get("wallpaperPausado")).toBe(true));
  });
});
