// Registra o vault desta janela junto do Rust (doc 12 §3.3). Não chama `definirAdapter` — isso
// continua responsabilidade do App.tsx.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { TauriVaultAdapter } from "./TauriVaultAdapter";
import { nomeDoVault, registrarAbertura } from "./vaultsRecentes";

export type ResultadoAbrirNestaJanela = "ok" | { outraJanela: string };

/**
 * Registra o vault do `adapter` como pertencendo a esta janela. Se outra janela já tem esse
 * vault registrado, foca ela e devolve o label; senão registra a abertura nos recentes, ajusta
 * o título da janela e devolve `"ok"`.
 */
export async function abrirNestaJanela(
  adapter: TauriVaultAdapter,
): Promise<ResultadoAbrirNestaJanela> {
  const raiz = adapter.raiz();
  const outroLabel = await invoke<string | null>("registrar_janela_vault", {
    path: raiz,
  });
  if (outroLabel) {
    await invoke("focar_janela", { label: outroLabel });
    return { outraJanela: outroLabel };
  }
  await registrarAbertura(raiz);
  // Título é cosmético: se falhar (ex.: permissão faltando na capability), o vault abre mesmo
  // assim — antes, a falha aqui virava "Não foi possível abrir o vault".
  try {
    await getCurrentWindow().setTitle(nomeDoVault(raiz));
  } catch (erro) {
    console.warn("[abrirNestaJanela] não foi possível definir o título da janela:", erro);
  }
  return "ok";
}
