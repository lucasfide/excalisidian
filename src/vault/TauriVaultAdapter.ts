// Implementação da VaultAdapter sobre os comandos Rust e o @tauri-apps/plugin-fs.
//
// Fatia 0: só o que a fatia exige — escolher o vault, reaplicar o escopo no boot e listar
// os arquivos. Escrita atômica, mover e watcher entram na Fatia 1 (escritaAtomica.ts) e na
// Fatia 5 (watcher.rs); por enquanto lançam erro explícito.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, readFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";

import type {
  EntradaArquivo,
  EventoArquivo,
  VaultAdapter,
} from "./VaultAdapter";

const CHAVE_VAULT = "vaultPath";

/** Junta a raiz absoluta com um caminho relativo do vault (sempre com "/"). */
function absoluto(raiz: string, rel: string): string {
  const limpo = rel.replace(/^\/+/, "");
  return `${raiz.replace(/[/\\]+$/, "")}/${limpo}`;
}

function naoImplementado(o: string): never {
  throw new Error(`${o}: ainda não implementado (entra na Fatia 1).`);
}

export class TauriVaultAdapter implements VaultAdapter {
  private constructor(private readonly caminhoRaiz: string) {}

  raiz(): string {
    return this.caminhoRaiz;
  }

  /**
   * Boot: se há um vault salvo, reaplica o escopo de FS (não persiste entre execuções)
   * e devolve o adapter pronto. Se não há, devolve null — a UI pede a pasta.
   */
  static async doBoot(): Promise<TauriVaultAdapter | null> {
    const store = await load("settings.json", { autoSave: false });
    const salvo = await store.get<string>(CHAVE_VAULT);
    if (!salvo) return null;
    await invoke("permitir_vault", { path: salvo });
    return new TauriVaultAdapter(salvo);
  }

  /** Abre o diálogo de pasta, concede o escopo, salva o caminho e devolve o adapter. */
  static async escolher(): Promise<TauriVaultAdapter | null> {
    // O diálogo do Tauri v2 não concede escopo de FS; quem concede é o comando Rust.
    const escolhido = await open({ directory: true, multiple: false });
    if (typeof escolhido !== "string") return null;
    await invoke("permitir_vault", { path: escolhido });
    const store = await load("settings.json", { autoSave: false });
    await store.set(CHAVE_VAULT, escolhido);
    await store.save();
    return new TauriVaultAdapter(escolhido);
  }

  async listar(): Promise<EntradaArquivo[]> {
    const brutas = await invoke<EntradaArquivo[]>("walk_vault", {
      path: this.caminhoRaiz,
    });
    // Normaliza o caminho em NFC na fronteira (doc 05, seção 9).
    return brutas.map((e) => ({ ...e, path: e.path.normalize("NFC") }));
  }

  async lerTexto(path: string): Promise<string> {
    const bruto = await readTextFile(absoluto(this.caminhoRaiz, path));
    // Remove BOM na leitura e não o reescreve (doc 05, seção 9).
    return bruto.startsWith("﻿") ? bruto.slice(1) : bruto;
  }

  async lerBinario(path: string): Promise<Uint8Array> {
    return readFile(absoluto(this.caminhoRaiz, path));
  }

  async escreverTexto(): Promise<void> {
    naoImplementado("escreverTexto");
  }

  async escreverBinario(): Promise<void> {
    naoImplementado("escreverBinario");
  }

  async criarPasta(path: string): Promise<void> {
    await mkdir(absoluto(this.caminhoRaiz, path), { recursive: true });
  }

  async mover(): Promise<void> {
    naoImplementado("mover");
  }

  async existe(path: string): Promise<boolean> {
    return exists(absoluto(this.caminhoRaiz, path));
  }

  observar(_cb: (eventos: EventoArquivo[]) => void): () => void {
    // Watcher entra na Fatia 5. No-op por enquanto.
    return () => {};
  }
}
