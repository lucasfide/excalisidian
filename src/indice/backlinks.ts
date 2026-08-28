// Índices derivados de links: backlinks e não resolvidos. Sempre reconstruídos a partir dos
// outLinks/embeds de todo mundo — nunca persistidos como verdade (doc 02 §6).

import type { FileMeta } from "./parser";
import type { LinkRef } from "./wikilink";
import { resolverLink, type IndiceResolucao } from "./resolucao";

export interface Backlink {
  /** Caminho do arquivo que contém o link. */
  origem: string;
  line: number;
  contexto: string;
  alias?: string;
  subpath?: string;
  embed: boolean;
}

export interface IndiceLinks {
  /** caminho alvo -> notas/desenhos que apontam para ele. */
  backlinks: Map<string, Backlink[]>;
  /** alvo de wikilink não resolvido (minúsculo) -> caminhos de origem. */
  naoResolvidos: Map<string, string[]>;
}

export function construirIndiceLinks(
  metas: Iterable<FileMeta>,
  resolucao: IndiceResolucao,
): IndiceLinks {
  const backlinks = new Map<string, Backlink[]>();
  const naoResolvidos = new Map<string, string[]>();

  const registrar = (origem: string, ref: LinkRef) => {
    const alvoPath = resolverLink(resolucao, ref.target, origem);
    if (alvoPath && alvoPath !== origem) {
      const lista = backlinks.get(alvoPath) ?? [];
      lista.push({
        origem,
        line: ref.line,
        contexto: ref.contexto,
        alias: ref.alias,
        subpath: ref.subpath,
        embed: ref.embed,
      });
      backlinks.set(alvoPath, lista);
    } else if (!alvoPath && ref.target !== "") {
      const chave = ref.target.toLowerCase();
      const lista = naoResolvidos.get(chave) ?? [];
      if (!lista.includes(origem)) lista.push(origem);
      naoResolvidos.set(chave, lista);
    }
  };

  for (const meta of metas) {
    for (const l of meta.outLinks) registrar(meta.path, l);
    for (const e of meta.embeds) registrar(meta.path, e);
  }

  for (const lista of backlinks.values()) {
    lista.sort((a, b) =>
      a.origem === b.origem ? a.line - b.line : a.origem.localeCompare(b.origem),
    );
  }
  return { backlinks, naoResolvidos };
}
