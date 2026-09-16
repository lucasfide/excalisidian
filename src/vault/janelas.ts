// Wrappers finos dos comandos Rust de janela (doc 12 §2 e §3.2). Nenhuma decisão de UI aqui
// (toast, foco de tela) — isso é de quem chama.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type ResultadoAbrir = "ok" | "indisponivel";

/** Abre uma janela nova pro vault em `caminho`, ou foca a janela que já o tem aberto. */
export async function abrirVaultEmJanela(caminho: string): Promise<ResultadoAbrir> {
  try {
    await invoke("abrir_janela_vault", { path: caminho });
    return "ok";
  } catch (erro) {
    if (erro === "indisponivel") return "indisponivel";
    throw erro;
  }
}

/**
 * Cria a pasta do vault novo dentro de `pai`. Em caso de erro, lança `Error` cuja `message` é
 * o código vindo do Rust: `nome_vazio`, `nome_invalido`, `pai_indisponivel` ou `existe`.
 */
export async function criarVault(pai: string, nome: string): Promise<string> {
  try {
    return await invoke<string>("criar_vault", { pai, nome });
  } catch (erro) {
    throw new Error(typeof erro === "string" ? erro : String(erro));
  }
}

/** Diálogo nativo de pasta. Não concede escopo de FS — quem concede é o comando Rust chamado
 * depois (`permitir_vault`, `abrir_janela_vault` ou `criar_vault`). */
export async function escolherPasta(): Promise<string | null> {
  const escolhido = await open({ directory: true, multiple: false });
  return typeof escolhido === "string" ? escolhido : null;
}
