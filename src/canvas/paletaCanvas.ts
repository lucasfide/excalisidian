// Lê os tokens de cor do canvas do CSS (--color-traco-* / --color-fundo-* / --color-postit-*)
// no tema ativo e monta a paleta que vai para o Excalidraw. Nunca hex literal aqui — a fonte
// da verdade é src/estilos/globals.css (doc 06). Recalcular ao trocar de tema.
//
// Também provê o hook reativo `useTemaEscuro()` (doc 09 ADR-11: o Excalidraw não recolore
// elemento nenhum no tema escuro, ele inverte o canvas inteiro via CSS — desligamos esse
// filtro e assumimos a coloração por conta própria) e as funções de conversão de cor entre
// temas `converterElementoParaTema`/`converterElementosParaTema` (doc 09 ADR-12: o disco
// grava sempre na paleta do tema claro; a leitura converte para o tema ativo).

import { useSyncExternalStore } from "react";

export interface CorNomeada {
  nome: string;
  hex: string;
}

export interface PaletaCanvas {
  /** 5 cores de traço. */
  tracos: CorNomeada[];
  /** 5 opções de preenchimento (a primeira é "transparent"). */
  fundos: CorNomeada[];
  /** 4 cores de post-it. */
  postits: CorNomeada[];
  /** Cor dos pontos da grade de fundo. */
  grade: string;
  /** Cor do texto do post-it — sempre `tinta`, nos dois temas (doc 06). */
  textoPostit: string;
}

const NOMES_TRACO = ["traco-tinta", "traco-musgo", "traco-ocre", "traco-bordo", "traco-suave"] as const;
const NOMES_FUNDO = ["fundo-neutro", "fundo-musgo", "fundo-ocre", "fundo-bordo"] as const;
const NOMES_POSTIT = ["postit-ocre", "postit-musgo", "postit-bordo", "postit-neutro"] as const;

export const TAMANHOS_FONTE = { P: 16, M: 20, G: 28, GG: 36 } as const;

function lerVar(nomeCompleto: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(nomeCompleto).trim();
}

function lerToken(nome: string): string {
  return lerVar(`--color-${nome}`);
}

export function lerPaletaCanvas(): PaletaCanvas {
  return {
    tracos: NOMES_TRACO.map((n) => ({ nome: n, hex: lerToken(n) })),
    fundos: [
      { nome: "fundo-nenhum", hex: "transparent" },
      ...NOMES_FUNDO.map((n) => ({ nome: n, hex: lerToken(n) })),
    ],
    postits: NOMES_POSTIT.map((n) => ({ nome: n, hex: lerToken(n) })),
    grade: lerToken("regua"),
    textoPostit: lerToken("tinta"),
  };
}

/** true quando o tema escuro está ativo (classe `dark` no <html>, alternada por App.tsx). */
export function temaEscuroAtivo(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Hook reativo que escuta a classe `dark` do `<html>` via MutationObserver, para os
 * componentes de canvas recalcularem paleta/tema sem esperar um re-render por outro motivo.
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

// --- conversão de cor entre temas (doc 09 ADR-12) ----------------------------------------

interface ParTema {
  claro: string;
  escuro: string;
}

/** As duas paletas normativas lado a lado, por nome de token. `globals.css` mantém os 14
 * tokens de cada tema sempre acessíveis via `--canvas-claro-*`/`--canvas-escuro-*` em :root,
 * independente de qual tema está ativo — é daí que isto lê, nunca de hex fixado aqui. */
export interface MapasTema {
  tracos: Record<string, ParTema>;
  fundos: Record<string, ParTema>;
  postits: Record<string, ParTema>;
}

function lerParTema(nome: string): ParTema {
  return { claro: lerVar(`--canvas-claro-${nome}`), escuro: lerVar(`--canvas-escuro-${nome}`) };
}

let mapasCache: MapasTema | null = null;

/**
 * Lê as duas paletas ao mesmo tempo do CSS. Memoizado: os pares claro/escuro são fixos por
 * token (`globals.css`), não dependem de qual tema está ativo agora — só precisam ser lidos
 * uma vez por sessão do app.
 */
export function lerMapasDeTema(): MapasTema {
  if (mapasCache) return mapasCache;
  const paraNomes = (nomes: readonly string[]): Record<string, ParTema> =>
    Object.fromEntries(nomes.map((n) => [n, lerParTema(n)]));
  mapasCache = {
    tracos: paraNomes(NOMES_TRACO),
    fundos: paraNomes(NOMES_FUNDO),
    postits: paraNomes(NOMES_POSTIT),
  };
  return mapasCache;
}

function construirDicionario(
  tabela: Record<string, ParTema>,
  destino: "claro" | "escuro",
): Record<string, string> {
  const dicionario: Record<string, string> = {};
  for (const par of Object.values(tabela)) {
    if (!par.claro || !par.escuro) continue;
    const origem = destino === "escuro" ? par.claro : par.escuro;
    const alvo = destino === "escuro" ? par.escuro : par.claro;
    dicionario[origem.toLowerCase()] = alvo;
  }
  return dicionario;
}

/**
 * Identifica se um elemento Excalidraw é um post-it (criado por `postit.ts`): retângulo sem
 * cantos arredondados, preenchimento sólido, traço e fundo na mesma cor, e essa cor batendo
 * com uma das 4 cores de post-it normativas (claro OU escuro). Necessário porque, no tema
 * claro, `fundo-*` e `postit-*` coincidem em hex (doc 06 §332) — sem essa desambiguação,
 * converter um post-it usaria a tabela errada.
 */
export function ehPostit(
  el: {
    type?: string;
    fillStyle?: string;
    roundness?: unknown;
    strokeColor?: string;
    backgroundColor?: string;
  },
  mapas: MapasTema = lerMapasDeTema(),
): boolean {
  if (el.type !== "rectangle") return false;
  if (el.fillStyle !== "solid") return false;
  if (el.roundness !== null && el.roundness !== undefined) return false;
  if (!el.strokeColor || !el.backgroundColor) return false;

  const sc = el.strokeColor.toLowerCase();
  if (sc !== el.backgroundColor.toLowerCase()) return false;

  const hexesPostit = new Set<string>();
  for (const par of Object.values(mapas.postits)) {
    if (par.claro) hexesPostit.add(par.claro.toLowerCase());
    if (par.escuro) hexesPostit.add(par.escuro.toLowerCase());
  }
  return hexesPostit.has(sc);
}

/**
 * Converte as cores de um elemento Excalidraw para o tema alvo ("claro" ou "escuro").
 * Cores desconhecidas / customizadas (fora da paleta normativa) são preservadas intactas.
 */
export function converterElementoParaTema<T extends Record<string, unknown>>(
  el: T,
  destino: "claro" | "escuro",
  mapas: MapasTema = lerMapasDeTema(),
): T {
  const copia = { ...el } as Record<string, unknown>;
  const dicTraco = construirDicionario(mapas.tracos, destino);

  if (ehPostit(copia, mapas)) {
    const dicPostit = construirDicionario(mapas.postits, destino);
    const atual = String(copia.backgroundColor ?? copia.strokeColor ?? "").toLowerCase();
    const nova = dicPostit[atual];
    if (nova) {
      copia.backgroundColor = nova;
      copia.strokeColor = nova;
    }
  } else {
    if (typeof copia.strokeColor === "string") {
      const nova = dicTraco[copia.strokeColor.toLowerCase()];
      if (nova) copia.strokeColor = nova;
    }
    if (typeof copia.backgroundColor === "string") {
      const dicFundo = construirDicionario(mapas.fundos, destino);
      const nova = dicFundo[copia.backgroundColor.toLowerCase()];
      if (nova) copia.backgroundColor = nova;
    }
  }

  // Label aninhado (post-it e formas com legenda nativa do Excalidraw).
  if (copia.label && typeof copia.label === "object") {
    const labelObj = { ...(copia.label as Record<string, unknown>) };
    if (typeof labelObj.strokeColor === "string") {
      const nova = dicTraco[labelObj.strokeColor.toLowerCase()];
      if (nova) labelObj.strokeColor = nova;
    }
    copia.label = labelObj;
  }

  return copia as T;
}

/** Converte todos os elementos de uma cena para o tema alvo. */
export function converterElementosParaTema<T extends Record<string, unknown>>(
  elementos: readonly T[],
  destino: "claro" | "escuro",
  mapas: MapasTema = lerMapasDeTema(),
): T[] {
  return elementos.map((el) => converterElementoParaTema(el, destino, mapas));
}
