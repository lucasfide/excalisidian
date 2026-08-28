// Spike de risco da Fatia 0 (HANDOFF 5.4): montar o Excalidraw, gerar 500 retângulos e
// medir pan e zoom no WebView2. O resultado — fluido / aceitável / travando + FPS — vai
// anotado no doc 09. Isto NÃO é o editor de desenho do produto; é descartável.

import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

const QTD = 500;

function gerarRetangulos() {
  const brutos = [];
  const colunas = 25;
  for (let i = 0; i < QTD; i++) {
    const col = i % colunas;
    const lin = Math.floor(i / colunas);
    brutos.push({
      type: "rectangle" as const,
      x: col * 90,
      y: lin * 70,
      width: 70,
      height: 50,
      strokeColor: "#1c1917",
      backgroundColor: i % 3 === 0 ? "#cfdbd1" : "transparent",
    });
  }
  return convertToExcalidrawElements(brutos);
}

export function SpikeCanvas() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let marca = performance.now();
    const laco = () => {
      frames++;
      const agora = performance.now();
      if (agora - marca >= 500) {
        setFps(Math.round((frames * 1000) / (agora - marca)));
        frames = 0;
        marca = agora;
      }
      raf = requestAnimationFrame(laco);
    };
    raf = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div className="meta absolute right-3 top-3 z-10 rounded-controle border border-regua-forte bg-superficie px-3 py-1 text-tinta">
        {QTD} elementos · {fps} fps
      </div>
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
          api.updateScene({ elements: gerarRetangulos() });
          api.scrollToContent(undefined, { fitToContent: true });
        }}
      />
    </div>
  );
}
