// Coordenação entre janelas: quais vaults estão abertos e a trava de sincronização por vault
// (doc 17 §8.1, plano 12 Task 3). Wrappers finos dos três comandos Rust de `trava_sync.rs` —
// nenhuma decisão de sincronização aqui, mesmo padrão de `src/vault/janelas.ts`. Usado tanto
// pela janela do vault quanto pelo segundo plano (plano 12 Task 5).

import { invoke } from "@tauri-apps/api/core";

/** Mesma normalização de `normalizar_chave` (`src-tauri/src/janelas.rs`): minúsculas, `\` vira
 * `/`, sem barra final. Assim `C:\Vaults\Casa` e `c:/vaults/casa/` caem na mesma chave — usada
 * pelo lado TS para comparar um caminho com o que `vaultsAbertos()` devolve. */
export function chaveDeVault(caminho: string): string {
  let chave = caminho.trim().replace(/\\/g, "/").toLowerCase();
  while (chave.length > 1 && chave.endsWith("/")) {
    chave = chave.slice(0, -1);
  }
  return chave;
}

/** Chaves normalizadas dos vaults abertos em alguma janela (`vaults_abertos`). */
export async function vaultsAbertos(): Promise<string[]> {
  return invoke<string[]>("vaults_abertos");
}

/** Tenta travar `caminho` para esta janela (`tentar_travar_sync`). `false` se já travado por
 * outra janela. Reentrante: chamar de novo pela mesma janela continua devolvendo `true`. */
export async function tentarTravarSync(caminho: string): Promise<boolean> {
  return invoke<boolean>("tentar_travar_sync", { path: caminho });
}

/** Libera a trava de `caminho` (`liberar_trava_sync`) — só tem efeito se esta janela for a
 * dona; do contrário não faz nada. */
export async function liberarTravaSync(caminho: string): Promise<void> {
  await invoke("liberar_trava_sync", { path: caminho });
}
