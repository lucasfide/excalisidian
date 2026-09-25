// Cofre da `chaveDeEnvelope` da sincronização (doc 17 §2), irmão de `cofreToken.ts`. Mesma
// entrada do cofre do Windows, segredo diferente: `{ segredo: "chave-de-envelope" }`, também um
// enum fechado do lado Rust — a tela não escolhe qual credencial do Windows ler (decisão 4 do
// plano `docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`).
//
// A `chaveDeEnvelope` é bytes (32, doc 06 `derivarDaSenha`); o cofre do Windows só guarda
// string, então os bytes viajam em base64 — mesma conversão usada pelo resto da sincronização
// (`src/sync/base64.ts`), reaproveitada aqui em vez de duplicada.

import { invoke } from "@tauri-apps/api/core";

import { deBase64, paraBase64 } from "../sync/base64";

export interface CofreChaveDeEnvelope {
  ler(): Promise<Uint8Array | null>;
  gravar(chave: Uint8Array): Promise<void>;
  apagar(): Promise<void>;
}

export class CofreChaveDeEnvelopeSistema implements CofreChaveDeEnvelope {
  async ler(): Promise<Uint8Array | null> {
    const base64 = await invoke<string | null>("ler_token_conta", {
      segredo: "chave-de-envelope",
    });
    return base64 === null ? null : deBase64(base64);
  }

  async gravar(chave: Uint8Array): Promise<void> {
    await invoke("gravar_token_conta", {
      segredo: "chave-de-envelope",
      token: paraBase64(chave),
    });
  }

  async apagar(): Promise<void> {
    await invoke("apagar_token_conta", { segredo: "chave-de-envelope" });
  }
}
