// Implementação da VaultAdapter sobre os comandos Rust e o @tauri-apps/plugin-fs.
//
// O watcher (observar) entra na Fatia 5. Escrita passa sempre por escritaAtomica.ts.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, readFile, mkdir, exists, rename } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";

import type {
  EntradaArquivo,
  EventoArquivo,
  VaultAdapter,
} from "./VaultAdapter";
import {
  escreverTextoAtomico,
  escreverBinarioAtomico,
} from "./escritaAtomica";

const CHAVE_VAULT = "vaultPath";

/** Junta a raiz absoluta com um caminho relativo do vault (sempre com "/"). */
function absoluto(raiz: string, rel: string): string {
  const limpo = rel.replace(/^\/+/, "");
  return `${raiz.replace(/[/\\]+$/, "")}/${limpo}`;
}

export class TauriVaultAdapter implements VaultAdapter {
  private constructor(private readonly caminhoRaiz: string) {}

  raiz(): string {
    return this.caminhoRaiz;
  }

  /** Caminho absoluto no disco para um caminho relativo do vault. */
  absoluto(path: string): string {
    return absoluto(this.caminhoRaiz, path);
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

  async escreverTexto(path: string, conteudo: string): Promise<void> {
    await escreverTextoAtomico(absoluto(this.caminhoRaiz, path), conteudo);
  }

  async escreverBinario(path: string, dados: Uint8Array): Promise<void> {
    await escreverBinarioAtomico(absoluto(this.caminhoRaiz, path), dados);
  }

  async criarPasta(path: string): Promise<void> {
    await mkdir(absoluto(this.caminhoRaiz, path), { recursive: true });
  }

  async mover(de: string, para: string): Promise<void> {
    await rename(absoluto(this.caminhoRaiz, de), absoluto(this.caminhoRaiz, para));
  }

  async existe(path: string): Promise<boolean> {
    return exists(absoluto(this.caminhoRaiz, path));
  }

  observar(cb: (eventos: EventoArquivo[]) => void): () => void {
    let cancelar = () => {};
    void invoke("observar_vault", { path: this.caminhoRaiz }).catch(() => {});
    void listen<EventoArquivo[]>("vault://eventos", (e) => {
      const norm = e.payload.map((ev) => ({
        ...ev,
        path: ev.path.normalize("NFC"),
      }));
      cb(norm);
    }).then((un) => {
      cancelar = un;
    });
    return () => cancelar();
  }
}
