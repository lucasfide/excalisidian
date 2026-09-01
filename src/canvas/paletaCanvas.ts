// Estado de tema do canvas (doc 09, ADR de migração para a UI nativa do Excalidraw). O
// ADR-12 (conversão de cor de elemento por tema) foi aposentado: o seletor de cor nativo do
// Excalidraw não é customizável — as paletas dele são hardcoded nas próprias actions e as
// constantes não são exportadas publicamente — então manter uma paleta de tokens própria só
// produzia cena mista (parte acompanhando o tema, parte não) e um vetor real de corrupção de
// cor (falso positivo da heurística de "isto é post-it"). O modo escuro do canvas volta a ser
// o filtro de inversão nativo do Excalidraw (doc 09 ADR-11, agora também aposentado).
//
// O que sobra: saber se o tema escuro está ativo (pra passar em `theme=`/`exportWithDarkMode`)
// e a cor dos pontos do fundo pontilhado — que não é do Excalidraw, é elemento do app por
// baixo do canvas (`EditorDesenho.tsx`), então continua um token normal de UI (`--color-regua`).

import { useSyncExternalStore } from "react";

export interface PaletaCanvas {
  /** Cor dos pontos da grade de fundo. */
  grade: string;
}

function lerToken(nome: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${nome}`).trim();
}

export function lerPaletaCanvas(): PaletaCanvas {
  return { grade: lerToken("regua") };
}

/** true quando o tema escuro está ativo (classe `dark` no <html>, alternada por App.tsx). */
export function temaEscuroAtivo(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Hook reativo que escuta a classe `dark` do `<html>` via MutationObserver, para os
 * componentes de canvas recalcularem sem esperar um re-render por outro motivo.
 */
export function useTemaEscuro(): boolean {
  return useSyncExternalStore(
    (notificar) => {
      if (typeof window === "undefined" || typeof MutationObserver === "undefined") {
        return () => {};
      }
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "attributes" && m.attributeName === "class") {
            notificar();
            return;
          }
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () => temaEscuroAtivo(),
    () => false,
  );
}
