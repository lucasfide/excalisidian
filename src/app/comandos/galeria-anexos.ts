import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { comandoExcluir } from "./exclusao";
import {
  criarUrlBlobImagem,
  embedMarkdownDoAnexo,
} from "../../vault/galeria-anexos";
import { mimeDaImagem } from "../../vault/anexos";

function adapterAtual() {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) throw new Error("Nenhum vault aberto.");
  return adapter;
}

export async function comandoCopiarEmbedMarkdown(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(embedMarkdownDoAnexo(path));
    toast.success("Embed Markdown copiado");
  } catch {
    toast.error("Não foi possível copiar o embed Markdown.");
  }
}

/** Copia os pixels, para uso no menu de contexto da galeria. */
export async function comandoCopiarImagem(path: string): Promise<void> {
  try {
    const ClipboardItemCtor = globalThis.ClipboardItem;
    if (!ClipboardItemCtor || !navigator.clipboard?.write) {
      throw new Error("A cópia de imagens não está disponível neste ambiente.");
    }
    const bytes = await adapterAtual().lerBinario(path);
    const item = new ClipboardItemCtor({
      [mimeDaImagem(path)]: new Blob([bytes], { type: mimeDaImagem(path) }),
    });
    await navigator.clipboard.write([item]);
    toast.success("Imagem copiada");
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Não foi possível copiar a imagem.";
    toast.error(mensagem);
  }
}

export async function comandoAbrirPastaAnexos(): Promise<void> {
  try {
    const adapter = adapterAtual();
    await invoke("revelar_pasta", { path: adapter.absoluto("anexos") });
  } catch {
    toast.error("Não foi possível abrir a pasta de anexos.");
  }
}

export async function comandoIrParaNotaDoAnexo(path: string): Promise<void> {
  const referencias = useVaultStore
    .getState()
    .backlinksDe(path)
    .map((backlink) => backlink.origem)
    .filter((origem, indice, lista) => lista.indexOf(origem) === indice);

  if (referencias.length === 0) {
    toast.info("Nenhuma nota referencia este anexo.");
    return;
  }
  if (referencias.length > 1) {
    toast.info(`Este anexo é usado por ${referencias.length} notas. Abrindo a primeira.`);
  }
  useWorkspaceStore.getState().abrirDocumento(referencias[0]);
}

export async function comandoExcluirAnexo(path: string): Promise<void> {
  await comandoExcluir(path, "attachment");
}

/** Utilitário para consumidores que carregam a prévia e precisam liberar a URL. */
export function criarUrlTemporariaDaImagem(bytes: Uint8Array, path: string) {
  return criarUrlBlobImagem(bytes, mimeDaImagem(path));
}
