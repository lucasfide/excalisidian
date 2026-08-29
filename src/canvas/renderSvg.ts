// SVG de um desenho, para o embed em nota (`![[Desenho.draw]]`, Fatia 7).
//
// Custo não medido de exportToSvg em nota com vários embeds (doc 09, Parte 3 item 13):
// cache em memória por mtime, morre com o processo. Sem persistência em disco — se o custo
// real se mostrar alto o bastante para justificar isso, é trabalho de outra fatia.

import { exportToSvg } from "@excalidraw/excalidraw";

import { useVaultStore } from "../estado/vaultStore";
import { parseDesenho } from "./formatoDesenho";
import { reidratarFiles } from "./reidratarFiles";
import { temaEscuroAtivo, converterElementosParaTema } from "./paletaCanvas";

interface Entrada {
  mtimeMs: number;
  svg: SVGSVGElement;
}

const cache = new Map<string, Entrada>();

function mtimeDe(caminho: string): number | null {
  const entrada = useVaultStore.getState().entradas.find((e) => e.path === caminho);
  return entrada?.mtimeMs ?? null;
}

/** Limpa o cache de um caminho (ou tudo, sem argumento). Usado pelos testes. */
export function limparCacheSvg(caminho?: string): void {
  if (caminho) {
    cache.delete(`${caminho}:claro`);
    cache.delete(`${caminho}:escuro`);
  } else {
    cache.clear();
  }
}

/**
 * Renderiza o SVG do desenho em `caminho`. Reaproveita o cache se o `mtime` do arquivo não
 * mudou desde a última renderização; senão lê, parseia, reidrata as imagens e exporta de novo.
 */
export async function renderizarSvg(caminho: string): Promise<SVGSVGElement> {
  const mtime = mtimeDe(caminho);
  const escuro = temaEscuroAtivo();
  const chaveCache = `${caminho}:${escuro ? "escuro" : "claro"}`;
  const emCache = cache.get(chaveCache);
  if (emCache && mtime !== null && emCache.mtimeMs === mtime) {
    return emCache.svg.cloneNode(true) as SVGSVGElement;
  }

  const adapter = useVaultStore.getState().adapter;
  if (!adapter) throw new Error("Nenhum vault aberto.");

  const texto = await adapter.lerTexto(caminho);
  const dados = parseDesenho(texto);
  const files = await reidratarFiles(dados);

  const vivos = dados.cena.elements.filter(
    (e) => !(e as { isDeleted?: boolean }).isDeleted,
  );
  const elementos = escuro ? converterElementosParaTema(vivos as never, "escuro") : vivos;

  const svg = await exportToSvg({
    elements: elementos as never,
    appState: {
      ...dados.cena.appState,
      theme: escuro ? "dark" : "light",
      exportWithDarkMode: escuro,
    } as never,
    files,
    exportPadding: 8,
  });

  if (mtime !== null) {
    cache.set(chaveCache, { mtimeMs: mtime, svg: svg.cloneNode(true) as SVGSVGElement });
  }
  return svg;
}
