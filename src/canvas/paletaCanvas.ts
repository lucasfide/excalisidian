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
  /** Cor de traço para cenas geradas pelo app (desenho de exemplo do onboarding, doc 15):
   * a tinta do tema CLARO, sempre. O escuro do canvas é o filtro de inversão do Excalidraw
   * sobre as cores gravadas na cena — gravar a tinta do tema escuro (clara) viraria traço
   * escuro sobre fundo escuro depois da inversão. */
  traco: string;
}

function lerToken(nome: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${nome}`).trim();
}

/** Valor do token no tema claro, lido da regra `:root` das folhas de estilo (onde o `@theme`
 * do Tailwind declara os tokens) — o `getComputedStyle` devolveria o do tema ativo. Cai no
 * valor computado se não achar (folha de outra origem, ambiente sem CSSOM). */
function lerTokenTemaClaro(nome: string): string {
  const prop = `--color-${nome}`;
  if (typeof document === "undefined") return "";
  for (const folha of Array.from(document.styleSheets)) {
    let regras: CSSRuleList;
    try {
      regras = folha.cssRules;
    } catch {
      continue;
    }
    const valor = procurarEmRoot(regras, prop);
    if (valor) return valor;
  }
  return lerToken(nome);
}

function procurarEmRoot(regras: CSSRuleList, prop: string): string {
  for (const regra of Array.from(regras)) {
    // `@layer theme { :root, :host { … } }`: desce nas regras agrupadas.
    if ("cssRules" in regra && !(regra instanceof CSSStyleRule)) {
      const valor = procurarEmRoot((regra as CSSGroupingRule).cssRules, prop);
      if (valor) return valor;
      continue;
    }
    if (!(regra instanceof CSSStyleRule)) continue;
    const seletor = regra.selectorText;
    if (!seletor.includes(":root") || seletor.includes(".dark")) continue;
    const valor = regra.style.getPropertyValue(prop).trim();
    if (valor) return valor;
  }
  return "";
}

export function lerPaletaCanvas(): PaletaCanvas {
  return { grade: lerToken("regua"), traco: lerTokenTemaClaro("tinta") };
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
