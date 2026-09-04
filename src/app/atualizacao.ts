// Orquestra a checagem de atualização (spec 2026-09-04): chama o updater do Tauri e decide
// o que mostrar dependendo de ser a checagem silenciosa do boot ou o comando manual.

import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

import { useAtualizacaoStore } from "../estado/atualizacaoStore";

export async function verificarAtualizacao(opcoes: { silencioso: boolean }): Promise<void> {
  try {
    const update = await check();
    if (update) {
      useAtualizacaoStore.getState().oferecer(update);
      return;
    }
    if (!opcoes.silencioso) {
      toast("Você já está na versão mais recente.");
    }
  } catch (erro) {
    if (opcoes.silencioso) {
      console.warn("Falha ao verificar atualizações:", erro);
      return;
    }
    toast.error("Não foi possível verificar atualizações.");
  }
}
