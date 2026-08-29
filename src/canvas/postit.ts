// Post-it: o Excalidraw não tem essa ferramenta. É um retângulo `fillStyle: "solid"` com
// texto vinculado, na cor do post-it e traço da mesma cor; o texto é sempre `tinta`
// (doc 06). Inserido via updateScene com CaptureUpdateAction.IMMEDIATELY para ser
// desfazível (doc 05 §5).

import {
  convertToExcalidrawElements,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const LARGURA = 180;
const ALTURA = 140;

export function inserirPostit(
  api: ExcalidrawImperativeAPI,
  corFundo: string,
  corTexto: string,
): void {
  const st = api.getAppState();
  // Centro da viewport atual, em coordenadas da cena.
  const x = -st.scrollX + st.width / 2 / st.zoom.value - LARGURA / 2;
  const y = -st.scrollY + st.height / 2 / st.zoom.value - ALTURA / 2;

  const novos = convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width: LARGURA,
      height: ALTURA,
      backgroundColor: corFundo,
      strokeColor: corFundo,
      fillStyle: "solid",
      roundness: null,
      label: { text: "", strokeColor: corTexto },
    },
  ]);

  api.updateScene({
    elements: [...api.getSceneElements(), ...novos],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
