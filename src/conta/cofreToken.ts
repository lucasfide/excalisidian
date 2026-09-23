// O cofre de credenciais do sistema, para o token da conta. Nunca guarda serviço nem usuário
// — os comandos Rust usam sempre a mesma entrada (decisão 4 do plano), então esta interface
// não serve para ler outras credenciais do Windows.

import { invoke } from "@tauri-apps/api/core";

export interface CofreToken {
  ler(): Promise<string | null>;
  gravar(token: string): Promise<void>;
  apagar(): Promise<void>;
}

export class CofreTokenSistema implements CofreToken {
  async ler(): Promise<string | null> {
    return invoke<string | null>("ler_token_conta");
  }

  async gravar(token: string): Promise<void> {
    await invoke("gravar_token_conta", { token });
  }

  async apagar(): Promise<void> {
    await invoke("apagar_token_conta");
  }
}
