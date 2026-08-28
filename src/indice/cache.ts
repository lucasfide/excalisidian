// Persistência do índice de metadados. Um arquivo de store por vault, em %APPDATA%
// (via plugin-store, que já resolve caminho e permissão). No boot, o índice é lido e só os
// arquivos com mtimeMs+size diferentes são reparseados (doc 02 §6).
//
// A reconciliação incremental em si fica no vaultStore; aqui é só ler e gravar o Map.

import { load } from "@tauri-apps/plugin-store";

import type { FileMeta } from "./parser";

const VERSAO_CACHE = 1;

/** Hash curto e estável do caminho do vault, para o nome do arquivo de cache. */
export function hashVault(raiz: string): string {
  let h = 0x811c9dc5;
  const s = raiz.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function nomeArquivo(raiz: string): string {
  return `cache-${hashVault(raiz)}.json`;
}

interface FormatoCache {
  version: number;
  metas: FileMeta[];
}

/** Lê o índice em cache. Devolve null se não existe ou a versão não bate. */
export async function carregarIndice(
  raiz: string,
): Promise<Map<string, FileMeta> | null> {
  try {
    const store = await load(nomeArquivo(raiz), { autoSave: false });
    const dados = await store.get<FormatoCache>("indice");
    if (!dados || dados.version !== VERSAO_CACHE) return null;
    return new Map(dados.metas.map((m) => [m.path, m]));
  } catch {
    return null;
  }
}

export async function salvarIndice(
  raiz: string,
  metas: Iterable<FileMeta>,
): Promise<void> {
  const store = await load(nomeArquivo(raiz), { autoSave: false });
  const dados: FormatoCache = {
    version: VERSAO_CACHE,
    metas: [...metas],
  };
  await store.set("indice", dados);
  await store.save();
}
