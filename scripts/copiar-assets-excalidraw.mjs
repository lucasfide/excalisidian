// Copia as fontes do Excalidraw para a raiz de public/ para o app funcionar offline (RNF5).
// Sem isso, as fontes vêm de CDN e o canvas quebra em silêncio sem rede.
// Copia o CONTEUDO de dist/prod/fonts, nao a pasta: os arquivos ficam em /Excalifont... e
// window.EXCALIDRAW_ASSET_PATH = "/" resolve. Copiar a pasta poria tudo em /fonts/ e exigiria "/fonts/".
import { cp, access } from "node:fs/promises";

const origem = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const destino = "public";

try {
  await access(origem);
  await cp(origem, destino, { recursive: true });
  console.log("[excalisidian] fontes do Excalidraw copiadas para public/");
} catch (erro) {
  console.warn(
    "[excalisidian] nao foi possivel copiar as fontes do Excalidraw (" +
      erro.code +
      "). O canvas pode quebrar offline ate rodar npm install de novo.",
  );
}
