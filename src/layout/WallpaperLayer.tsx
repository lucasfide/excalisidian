import { useEffect } from "react";

import { useWallpaperStore } from "../estado/wallpaperStore";
import { useWallpaperRotation } from "../hooks/useWallpaperRotation";

/** Fundo atmosférico abaixo da interface; superfícies do app mantêm sua opacidade normal. */
export default function WallpaperLayer() {
  const wallpaper = useWallpaperStore((state) => state.wallpaperAtual);
  const carregar = useWallpaperStore((state) => state.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useWallpaperRotation();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-[0.16]"
      style={{ backgroundImage: `url("${wallpaper.src}")` }}
    />
  );
}
