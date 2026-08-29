// Persistência do layout de abas do dockview. Um arquivo por vault (doc 05 §6): trocar de
// vault não pode sobrescrever o layout do anterior. Guarda só o JSON serializado do
// dockview — que por sua vez guarda só o caminho de cada painel nos `params`, nunca o
// conteúdo.

import { load } from "@tauri-apps/plugin-store";

import { hashVault } from "../indice/cache";

function nomeArquivo(raiz: string): string {
  // Subpasta, um arquivo por vault (doc 02, doc 05 §6): trocar de vault não pode
  // sobrescrever o layout do anterior.
  return `workspace/${hashVault(raiz)}.json`;
}

export async function carregarLayout(raiz: string): Promise<unknown | null> {
  try {
    const store = await load(nomeArquivo(raiz), { autoSave: false });
    return (await store.get("layout")) ?? null;
  } catch {
    return null;
  }
}

export async function salvarLayout(raiz: string, layout: unknown): Promise<void> {
  const store = await load(nomeArquivo(raiz), { autoSave: false });
  await store.set("layout", layout);
  await store.save();
}

export async function limparLayout(raiz: string): Promise<void> {
  try {
    const store = await load(nomeArquivo(raiz), { autoSave: false });
    await store.delete("layout");
    await store.save();
  } catch {
    // sem problema: se não dá pra limpar, o boot seguinte trata o JSON inválido
  }
}
