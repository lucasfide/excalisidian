// Aplicação de propriedades e transformações em elementos da cena do canvas (doc 06).
// Trata formas geométricas, textos soltos, textos vinculados a contêineres e post-its.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface MudancaPropriedades {
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  currentItemStrokeWidth?: number;
  currentItemStrokeStyle?: "solid" | "dashed" | "dotted";
  currentItemRoughness?: number;
  currentItemOpacity?: number;
  currentItemFontSize?: number;
  currentItemFontFamily?: number;
  currentItemTextAlign?: "left" | "center" | "right";
  corTexto?: string;
}

/**
 * Atualiza os elementos da cena aplicando as alterações de propriedades aos elementos
 * selecionados e a quaisquer elementos de texto vinculados a contêineres selecionados.
 */
export function aplicarPropriedadesNaCena(
  elementos: readonly ExcalidrawElement[],
  selecionados: Record<string, boolean>,
  mudanca: MudancaPropriedades,
): ExcalidrawElement[] {
  // Mapa de containerId -> textElement
  const containerParaTexto = new Map<string, ExcalidrawElement>();
  for (const el of elementos) {
    const contId = (el as unknown as { containerId?: string | null }).containerId;
    if (el.type === "text" && contId) {
      containerParaTexto.set(contId, el);
    }
  }

  // Mapa de ID do contêiner por ID do elemento
  const contIdMap = new Map<string, ExcalidrawElement>();
  for (const el of elementos) {
    contIdMap.set(el.id, el);
  }

  return elementos.map((el) => {
    const estaSelecionado = !!selecionados[el.id];
    const contId = (el as unknown as { containerId?: string | null }).containerId;
    const ehTextoVinculadoDeSelecionado =
      el.type === "text" && !!contId && !!selecionados[contId];

    // 1. Atualizações em Elementos de Texto (soltos ou vinculados a contêiner selecionado)
    if (el.type === "text" && (estaSelecionado || ehTextoVinculadoDeSelecionado)) {
      let textoAtualizado = { ...el };

      if (mudanca.currentItemFontSize !== undefined) {
        const novoTamanho = mudanca.currentItemFontSize;
        const tamanhoAntigo = (el as unknown as { fontSize?: number }).fontSize || 20;
        const ratio = novoTamanho / tamanhoAntigo;
        const larguraAntiga = el.width || 50;
        const alturaAntiga = el.height || 25;
        const novaLargura = larguraAntiga * ratio;
        const novaAltura = alturaAntiga * ratio;

        let novoX = el.x;
        let novoY = el.y;

        // Se estiver dentro de um contêiner, mantém recentralizado dentro dele
        if (contId) {
          const container = contIdMap.get(contId);
          if (container) {
            novoX = container.x + (container.width - novaLargura) / 2;
            novoY = container.y + (container.height - novaAltura) / 2;
          }
        }

        textoAtualizado = {
          ...textoAtualizado,
          fontSize: novoTamanho,
          width: novaLargura,
          height: novaAltura,
          x: novoX,
          y: novoY,
        } as typeof el;
      }

      if (mudanca.corTexto !== undefined) {
        textoAtualizado = {
          ...textoAtualizado,
          strokeColor: mudanca.corTexto,
        };
      }

      if (mudanca.currentItemFontFamily !== undefined) {
        textoAtualizado = {
          ...textoAtualizado,
          fontFamily: mudanca.currentItemFontFamily,
        } as typeof el;
      }

      if (mudanca.currentItemTextAlign !== undefined) {
        textoAtualizado = {
          ...textoAtualizado,
          textAlign: mudanca.currentItemTextAlign,
        } as typeof el;
      }

      if (mudanca.currentItemOpacity !== undefined) {
        textoAtualizado = {
          ...textoAtualizado,
          opacity: mudanca.currentItemOpacity,
        };
      }

      // Se for texto solto selecionado diretamente e mudou a cor do traço
      if (estaSelecionado && mudanca.currentItemStrokeColor !== undefined) {
        textoAtualizado = {
          ...textoAtualizado,
          strokeColor: mudanca.currentItemStrokeColor,
        };
      }

      return textoAtualizado;
    }

    // 2. Atualizações em Formas Geométricas Selecionadas (não-texto)
    if (estaSelecionado && el.type !== "text") {
      const patch: Record<string, unknown> = {};

      if (mudanca.currentItemStrokeColor !== undefined) {
        patch.strokeColor = mudanca.currentItemStrokeColor;
        // Post-it: strokeColor e backgroundColor são idênticos
        if (
          (el as unknown as { fillStyle?: string }).fillStyle === "solid" &&
          el.strokeColor === el.backgroundColor
        ) {
          patch.backgroundColor = mudanca.currentItemStrokeColor;
        }
      }

      if (mudanca.currentItemBackgroundColor !== undefined) {
        patch.backgroundColor = mudanca.currentItemBackgroundColor;
        // Post-it: strokeColor e backgroundColor são idênticos
        if (
          (el as unknown as { fillStyle?: string }).fillStyle === "solid" &&
          el.strokeColor === el.backgroundColor
        ) {
          patch.strokeColor = mudanca.currentItemBackgroundColor;
        }
      }

      if (mudanca.currentItemStrokeWidth !== undefined) {
        patch.strokeWidth = mudanca.currentItemStrokeWidth;
      }

      if (mudanca.currentItemStrokeStyle !== undefined) {
        patch.strokeStyle = mudanca.currentItemStrokeStyle;
      }

      if (mudanca.currentItemRoughness !== undefined) {
        patch.roughness = mudanca.currentItemRoughness;
      }

      if (mudanca.currentItemOpacity !== undefined) {
        patch.opacity = mudanca.currentItemOpacity;
      }

      return { ...el, ...patch };
    }

    return el;
  });
}
