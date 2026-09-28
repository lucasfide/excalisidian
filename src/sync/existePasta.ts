// src/sync/existePasta.ts
// Confere se a pasta de um vault recente ainda existe no disco (plano 12 Task 6, lista "Seus
// vaults" — Review Focus 3: pasta apagada ou movida vira "Pasta não encontrada", nunca é
// recriada). NÃO é módulo puro: fala com o Tauri.
//
// Escolha de implementação: `exists()` do `@tauri-apps/plugin-fs` exige que o caminho esteja
// dentro do escopo de FS concedido a este processo, e esse escopo NÃO sobrevive entre execuções
// do app (`src-tauri/src/vault.rs`, comentário de topo) — um vault recente cuja janela nunca
// abriu nesta sessão pode não ter escopo nenhum ainda. Em vez de decidir aqui quando conceder
// (duplicando a lógica de escopo do lado Rust), reaproveita-se `TauriVaultAdapter.abrir`, que já
// concede o escopo (`permitir_vault`) e devolve um adaptador pronto — o mesmo caminho que a
// tela sem vault usa para abrir um recente. `permitir_vault` só registra o caminho na allowlist
// do plugin-fs (`allow_directory`); não falha se a pasta não existir, então este helper funciona
// tanto para "existe" quanto para "não existe mais" sem lançar por causa do escopo em si.
import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";

export async function existePasta(caminho: string): Promise<boolean> {
  try {
    const adaptador = await TauriVaultAdapter.abrir(caminho);
    return await adaptador.existe("");
  } catch {
    return false;
  }
}
