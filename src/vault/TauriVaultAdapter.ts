// Implementação da VaultAdapter sobre os comandos Rust e o @tauri-apps/plugin-fs.
//
// O watcher (observar) entra na Fatia 5. Escrita passa sempre por escritaAtomica.ts.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  readTextFile,
  readFile,
  mkdir,
  exists,
  rename,
  remove,
  readDir,
} from "@tauri-apps/plugin-fs";
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
import { registrarAbertura } from "./vaultsRecentes";

const CHAVE_VAULT = "vaultPath";

/** Falha de `doBoot` ao conceder o escopo do último vault salvo: carrega o caminho tentado
 * (só `doBoot` sabe resolvê-lo, entre a URL `?vault=` e o `vaultPath` salvo) pra quem trata o
 * erro conseguir montar uma mensagem com o nome do vault (doc 04 — textos de vault/abertura),
 * sem repetir aqui a lógica de qual dos dois caminhos venceu. */
export class ErroAberturaVault extends Error {
  constructor(
    message: string,
    public readonly caminho: string,
  ) {
    super(message);
    this.name = "ErroAberturaVault";
  }
}

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
   * Boot: se a URL da janela tem `?vault=`, usa esse caminho (janela nova de
   * `abrir_janela_vault`, doc 12 §1); senão usa o último vault salvo (`vaultPath`, RF1.2).
   * Reaplica o escopo de FS (não persiste entre execuções) e devolve o adapter pronto. Se não
   * há nenhum dos dois, devolve null — a UI pede a pasta.
   */
  static async doBoot(): Promise<TauriVaultAdapter | null> {
    const daUrl = new URLSearchParams(window.location.search).get("vault");
    let caminho = daUrl ?? undefined;
    if (!caminho) {
      const store = await load("settings.json", { autoSave: false });
      caminho = (await store.get<string>(CHAVE_VAULT)) ?? undefined;
    }
    if (!caminho) return null;
    try {
      await invoke("permitir_vault", { path: caminho });
    } catch (e) {
      throw new ErroAberturaVault(e instanceof Error ? e.message : String(e), caminho);
    }
    return new TauriVaultAdapter(caminho);
  }

  /**
   * Concede o escopo de FS pra `caminho` e devolve o adapter, sem mexer em recentes nem em
   * `vaultPath` — usado pela tela sem vault pra abrir na própria janela; quem chama decide se
   * registra (via `abrirNestaJanela`).
   */
  static async abrir(caminho: string): Promise<TauriVaultAdapter> {
    await invoke("permitir_vault", { path: caminho });
    return new TauriVaultAdapter(caminho);
  }

  /** Abre o diálogo de pasta, concede o escopo, registra a abertura e devolve o adapter. */
  static async escolher(): Promise<TauriVaultAdapter | null> {
    // O diálogo do Tauri v2 não concede escopo de FS; quem concede é o comando Rust.
    const escolhido = await open({ directory: true, multiple: false });
    if (typeof escolhido !== "string") return null;
    await invoke("permitir_vault", { path: escolhido });
    await registrarAbertura(escolhido);
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

  async remover(path: string): Promise<void> {
    await remove(absoluto(this.caminhoRaiz, path), { recursive: true });
  }

  async listarPasta(path: string): Promise<{ nome: string; isDir: boolean }[]> {
    try {
      const entradas = await readDir(absoluto(this.caminhoRaiz, path));
      return entradas.map((e) => ({ nome: e.name, isDir: e.isDirectory }));
    } catch {
      return []; // pasta não existe ainda (lixeira nunca usada) — lista vazia, não erro
    }
  }

  async existe(path: string): Promise<boolean> {
    return exists(absoluto(this.caminhoRaiz, path));
  }

  observar(cb: (eventos: EventoArquivo[]) => void): () => void {
    let cancelar = () => {};
    void invoke("observar_vault", { path: this.caminhoRaiz }).catch(() => {});
    // getCurrentWebviewWindow().listen registra com target { kind: "WebviewWindow", label },
    // que o backend do plugin-event só entrega a eventos emitidos com emit_to(label, …) pra
    // esse label — o `listen` global de @tauri-apps/api/event usa target "Any" e receberia os
    // eventos de vault de TODAS as janelas (doc 12 §2, watcher por janela).
    void getCurrentWebviewWindow()
      .listen<EventoArquivo[]>("vault://eventos", (e) => {
        const norm = e.payload.map((ev) => ({
          ...ev,
          path: ev.path.normalize("NFC"),
        }));
        cb(norm);
      })
      .then((un) => {
        cancelar = un;
      });
    return () => cancelar();
  }

  aoPerderSincronia(cb: () => void): () => void {
    let cancelar = () => {};
    // Mesmo motivo do `observar`: só o evento desta janela.
    void getCurrentWebviewWindow()
      .listen("vault://ressincronizar", () => cb())
      .then((un) => {
        cancelar = un;
      });
    return () => cancelar();
  }
}
