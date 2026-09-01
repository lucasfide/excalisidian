// Alinhar e distribuir elementos selecionados no canvas (doc 06, doc 09 ADR-19).
//
// O Excalidraw 0.18.1 tem essa lógica por dentro (`alignElements`/`distributeElements`), mas
// não exporta nem uma nem outra — nem pelo índice público do pacote, nem por subpath import (o
// `package.json` do pacote só declara `"types"` nesse caminho, sem `"default"`, então nem
// compilaria), nem aparece em nenhum bundle de `dist/prod/*.js` (conferido por grep direto).
// Reimplementado por fora, mesma filosofia do ADR-17 (seleção de forma vazia): matemática
// própria sobre campos públicos do elemento (`x`, `y`, `width`, `height`, `angle`), nunca
// dependendo de internals do pacote.
//
// Mesmo contrato de aplicarPropriedades.ts: recebe o array de elementos da cena + o dicionário
// de selecionados (formato de `appState.selectedElementIds`), devolve um array novo — nunca
// `ExcalidrawImperativeAPI`. Quem chama (PropriedadesCanvas.tsx) passa o resultado direto pra
// `api.updateScene({ elements })`.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type ModoAlinhamento = "esquerda" | "centroH" | "direita" | "topo" | "centroV" | "base";
export type EixoDistribuicao = "horizontal" | "vertical";

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface FormaComGeometria {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

/**
 * Bounding box do elemento em coordenadas de cena, já considerando rotação — gira os 4 cantos
 * em torno do centro e tira o min/max. Mesma trigonometria de `pontoDentroDaForma`
 * (selecaoFormaVazia.ts), aplicada ao problema inverso (bounding box, não ponto-em-forma). Não
 * usa `getCommonBounds` do pacote pra isso: a API pública não documenta se ele já considera
 * rotação, e o ADR-17 já rejeitou confiar em comportamento não-documentado do Excalidraw uma
 * vez — não repetir.
 */
export function boundingBoxRotacionado(el: FormaComGeometria): BoundingBox {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const hw = el.width / 2;
  const hh = el.height / 2;
  const cos = Math.cos(el.angle);
  const sin = Math.sin(el.angle);

  const cantos: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of cantos) {
    const gx = cx + (lx * cos - ly * sin);
    const gy = cy + (lx * sin + ly * cos);
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gy < minY) minY = gy;
    if (gy > maxY) maxY = gy;
  }
  return { minX, minY, maxX, maxY };
}

function elementosSelecionados(
  elementos: readonly ExcalidrawElement[],
  idsSelecionados: Record<string, boolean>,
): ExcalidrawElement[] {
  return elementos.filter((el) => idsSelecionados[el.id]);
}

function bboxCombinado(elementos: readonly ExcalidrawElement[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elementos) {
    const bb = boundingBoxRotacionado(el);
    if (bb.minX < minX) minX = bb.minX;
    if (bb.maxX > maxX) maxX = bb.maxX;
    if (bb.minY < minY) minY = bb.minY;
    if (bb.maxY > maxY) maxY = bb.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/** Deslocamento em X/Y pra alinhar o bounding box de `el` ao alvo, no modo pedido. Desloca
 * `x`/`y` direto (não recalcula via bounding box) — translação pura preserva ângulo e forma. */
function deslocamentoParaAlinhar(
  el: ExcalidrawElement,
  alvo: BoundingBox,
  modo: ModoAlinhamento,
): { dx: number; dy: number } {
  const bb = boundingBoxRotacionado(el);
  switch (modo) {
    case "esquerda":
      return { dx: alvo.minX - bb.minX, dy: 0 };
    case "centroH": {
      const centroAlvo = (alvo.minX + alvo.maxX) / 2;
      const centroEl = (bb.minX + bb.maxX) / 2;
      return { dx: centroAlvo - centroEl, dy: 0 };
    }
    case "direita":
      return { dx: alvo.maxX - bb.maxX, dy: 0 };
    case "topo":
      return { dx: 0, dy: alvo.minY - bb.minY };
    case "centroV": {
      const centroAlvo = (alvo.minY + alvo.maxY) / 2;
      const centroEl = (bb.minY + bb.maxY) / 2;
      return { dx: 0, dy: centroAlvo - centroEl };
    }
    case "base":
      return { dx: 0, dy: alvo.maxY - bb.maxY };
  }
}

/**
 * Alinha os elementos selecionados entre si, no modo pedido. Com menos de 2 selecionados não há
 * o que alinhar — devolve os elementos sem mudança (não é erro).
 *
 * Escopo v1, limitação aceita: cada elemento é tratado independente — `groupIds` não é
 * respeitado (um grupo pode "esticar" em vez de mover inteiro). Sem suporte a grupo em nenhum
 * outro lugar do app hoje; registrado no ADR-19.
 */
export function alinhar(
  elementos: readonly ExcalidrawElement[],
  idsSelecionados: Record<string, boolean>,
  modo: ModoAlinhamento,
): ExcalidrawElement[] {
  const selecionados = elementosSelecionados(elementos, idsSelecionados);
  if (selecionados.length < 2) return elementos as ExcalidrawElement[];

  const alvo = bboxCombinado(selecionados);
  return elementos.map((el) => {
    if (!idsSelecionados[el.id]) return el;
    const { dx, dy } = deslocamentoParaAlinhar(el, alvo, modo);
    if (dx === 0 && dy === 0) return el;
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
}

/**
 * Distribui os elementos selecionados no eixo pedido, de forma que o espaço vazio entre
 * bounding boxes consecutivos fique igual (convenção padrão de Figma/Illustrator/PowerPoint —
 * "distribuir espaçamento", não "distribuir centros"). Primeiro e último (na ordem do eixo)
 * ficam fixos; só os do meio se movem. Exige 3+ selecionados — com menos, não há espaçamento
 * pra igualar, devolve sem mudança (não é erro).
 */
export function distribuir(
  elementos: readonly ExcalidrawElement[],
  idsSelecionados: Record<string, boolean>,
  eixo: EixoDistribuicao,
): ExcalidrawElement[] {
  const selecionados = elementosSelecionados(elementos, idsSelecionados);
  if (selecionados.length < 3) return elementos as ExcalidrawElement[];

  const bboxes = new Map<string, BoundingBox>();
  for (const el of selecionados) bboxes.set(el.id, boundingBoxRotacionado(el));

  const eixoMin = eixo === "horizontal" ? "minX" : "minY";
  const eixoMax = eixo === "horizontal" ? "maxX" : "maxY";

  const ordenados = [...selecionados].sort(
    (a, b) => bboxes.get(a.id)![eixoMin] - bboxes.get(b.id)![eixoMin],
  );

  const primeiro = bboxes.get(ordenados[0].id)!;
  const ultimo = bboxes.get(ordenados[ordenados.length - 1].id)!;

  // Soma das larguras/alturas dos elementos do meio: o espaço ocupado por eles não faz parte
  // do "vazio" a distribuir.
  let somaTamanhoMeio = 0;
  for (let i = 1; i < ordenados.length - 1; i++) {
    const bb = bboxes.get(ordenados[i].id)!;
    somaTamanhoMeio += bb[eixoMax] - bb[eixoMin];
  }

  const espacoTotal = ultimo[eixoMax] - primeiro[eixoMin];
  const gaps = ordenados.length - 1;
  const espacoVazio = espacoTotal - (primeiro[eixoMax] - primeiro[eixoMin]) - somaTamanhoMeio
    - (ultimo[eixoMax] - ultimo[eixoMin]);
  const gapIgual = espacoVazio / gaps;

  const deslocamentos = new Map<string, number>();
  let cursor = primeiro[eixoMax] + gapIgual;
  for (let i = 1; i < ordenados.length - 1; i++) {
    const id = ordenados[i].id;
    const bb = bboxes.get(id)!;
    deslocamentos.set(id, cursor - bb[eixoMin]);
    cursor += bb[eixoMax] - bb[eixoMin] + gapIgual;
  }

  return elementos.map((el) => {
    const delta = deslocamentos.get(el.id);
    if (delta === undefined) return el;
    return eixo === "horizontal" ? { ...el, x: el.x + delta } : { ...el, y: el.y + delta };
  });
}
