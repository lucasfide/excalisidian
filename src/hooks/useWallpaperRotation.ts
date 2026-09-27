import { useEffect } from "react";

import { WALLPAPER_INTERVAL_MS } from "../data/wallpapers";
import { useWallpaperStore } from "../estado/wallpaperStore";

/** Rotaciona o papel de parede a cada dez minutos enquanto não estiver pausado. */
export function useWallpaperRotation(): void {
  const carregado = useWallpaperStore((state) => state.carregado);
  const pausado = useWallpaperStore((state) => state.pausado);
  const proximo = useWallpaperStore((state) => state.proximo);

  useEffect(() => {
    if (!carregado || pausado) return;
    const timer = window.setInterval(proximo, WALLPAPER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [carregado, pausado, proximo]);
}
