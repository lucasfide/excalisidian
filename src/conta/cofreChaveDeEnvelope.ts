// Cofre da `chaveDeEnvelope` da sincronização (doc 17 §2), irmão de `cofreToken.ts`. Mesma
// entrada do cofre do Windows, segredo diferente: `{ segredo: "chave-de-envelope" }`, também um
// enum fechado do lado Rust — a tela não escolhe qual credencial do Windows ler (decisão 4 do
// plano `docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`).
//
// A `chaveDeEnvelope` é bytes (32, doc 06 `derivarDaSenha`); o cofre do Windows só guarda
// string, então os bytes viajam em base64 — mesma conversão usada pelo resto da sincronização
// (`src/sync/base64.ts`), reaproveitada aqui em vez de duplicada.
//
// Plano 12 Task 2 / ADR-39 "Mudança de 27/09/2026": a chave passou a nascer no login e a
// pertencer a UMA conta — o defeito que motivou isto foi a chave da conta de teste sendo
// reaproveitada ao entrar com a conta de verdade. A partir de agora a entrada carrega também o
// e-mail normalizado da conta dona da chave (`{"v":1,"email":...,"chave":...}`); `ler` só
// devolve a chave se o e-mail guardado bater com o e-mail da sessão atual. Se for diferente —
// ou se a entrada for do formato antigo (base64 puro, sem e-mail, de antes desta mudança) — a
// leitura APAGA a entrada e devolve `null`: nunca entrega a chave de uma conta para outra.

import { invoke } from "@tauri-apps/api/core";

import { normalizarEmail } from "./derivacaoSenha";
import { deBase64, paraBase64 } from "../sync/base64";

/** Formato gravado no cofre (v1). `v` existe para uma migração futura poder reconhecer versões
 * — não é lido por ninguém ainda, só gravado. */
interface EntradaChaveDeEnvelope {
  v: 1;
  email: string;
  chave: string; // base64
}

function ehEntradaValida(v: unknown): v is EntradaChaveDeEnvelope {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && typeof o.email === "string" && typeof o.chave === "string";
}

export interface CofreChaveDeEnvelope {
  /** Devolve a chave só se o e-mail guardado (normalizado) for igual ao `emailDaSessao`
   * (também normalizado); caso contrário — inclusive entrada do formato antigo, sem e-mail —
   * apaga a entrada e devolve `null`. */
  ler(emailDaSessao: string): Promise<Uint8Array | null>;
  gravar(email: string, chave: Uint8Array): Promise<void>;
  apagar(): Promise<void>;
}

export class CofreChaveDeEnvelopeSistema implements CofreChaveDeEnvelope {
  async ler(emailDaSessao: string): Promise<Uint8Array | null> {
    const bruto = await invoke<string | null>("ler_token_conta", {
      segredo: "chave-de-envelope",
    });
    if (bruto === null) return null;

    let entrada: unknown;
    try {
      entrada = JSON.parse(bruto);
    } catch {
      entrada = null; // formato antigo: base64 puro, não é JSON — cai no descarte abaixo
    }

    if (!ehEntradaValida(entrada) || normalizarEmail(entrada.email) !== normalizarEmail(emailDaSessao)) {
      await this.apagar();
      return null;
    }

    return deBase64(entrada.chave);
  }

  async gravar(email: string, chave: Uint8Array): Promise<void> {
    const entrada: EntradaChaveDeEnvelope = {
      v: 1,
      email: normalizarEmail(email),
      chave: paraBase64(chave),
    };
    await invoke("gravar_token_conta", {
      segredo: "chave-de-envelope",
      token: JSON.stringify(entrada),
    });
  }

  async apagar(): Promise<void> {
    await invoke("apagar_token_conta", { segredo: "chave-de-envelope" });
  }
}
