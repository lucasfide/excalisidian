import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";

import type { RegistroVaultsMobile, VaultAbertoMobile, VaultMobile } from "../types/vault-mobile";
import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import type { EntradaArquivo, EventoArquivo, VaultAdapter } from "../vault/VaultAdapter";
import { traduzirAgora } from "../i18n/traduzirAgora";

const NOME_REGISTRO = "mobile-vaults.json";
const CHAVE_REGISTRO = "registro";
let filaMutacoes: Promise<void> = Promise.resolve();

function serializarMutacao<T>(operacao: () => Promise<T>): Promise<T> {
  const resultado = filaMutacoes.then(operacao);
  filaMutacoes = resultado.then(() => undefined, () => undefined);
  return resultado;
}

export function validarRegistroVaultsMobile(value: unknown): value is RegistroVaultsMobile {
  if (typeof value !== "object" || value === null) return false;
  const registro = value as Record<string, unknown>;
  if (registro.versao !== 1 || !Array.isArray(registro.vaults)) return false;
  if (registro.ultimoId !== null && typeof registro.ultimoId !== "string") return false;
  const ids = new Set<string>();
  for (const item of registro.vaults) {
    if (typeof item !== "object" || item === null) return false;
    const vault = item as Record<string, unknown>;
    if (
      typeof vault.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(vault.id) ||
      typeof vault.nome !== "string" ||
      vault.nome.trim() === "" ||
      /[\\/:*?"<>|\u0000-\u001f]/.test(vault.nome) ||
      vault.nome.startsWith(".") ||
      ids.has(vault.id)
    ) return false;
    ids.add(vault.id);
  }
  return registro.ultimoId === null || ids.has(registro.ultimoId);
}

async function storeRegistro() {
  return load(NOME_REGISTRO, { autoSave: false });
}

export async function carregarVaultsMobile(): Promise<RegistroVaultsMobile> {
  const store = await storeRegistro();
  const bruto: unknown = await store.get(CHAVE_REGISTRO);
  if (bruto === null || bruto === undefined) {
    return { versao: 1, vaults: [], ultimoId: null };
  }
  if (!validarRegistroVaultsMobile(bruto)) {
    throw new Error(traduzirAgora("mobile.registroCorrompido"));
  }
  return bruto;
}

async function salvarRegistro(registro: RegistroVaultsMobile): Promise<void> {
  const store = await storeRegistro();
  const anterior: unknown = await store.get(CHAVE_REGISTRO);
  try {
    await store.set(CHAVE_REGISTRO, registro);
    await store.save();
  } catch (erro) {
    try {
      if (anterior === undefined) await store.delete(CHAVE_REGISTRO);
      else await store.set(CHAVE_REGISTRO, anterior);
      await store.save();
    } catch {
      throw new Error(`${erro instanceof Error ? erro.message : String(erro)}; rollback-incompleto`);
    }
    throw erro;
  }
}

async function abrirVault(vault: VaultMobile, raiz: string): Promise<VaultAbertoMobile> {
  const adapter = await TauriVaultAdapter.abrir(`${raiz}/${vault.id}`);
  return { vault, adapter: new VaultAdapterMobile(adapter) };
}

/** Encaminha o acesso ao diretório privado e desliga os watchers exclusivos do desktop. */
class VaultAdapterMobile implements VaultAdapter {
  constructor(private readonly base: TauriVaultAdapter) {}

  raiz(): string { return this.base.raiz(); }
  listar(): Promise<EntradaArquivo[]> { return this.base.listar(); }
  lerTexto(path: string): Promise<string> { return this.base.lerTexto(path); }
  lerBinario(path: string): Promise<Uint8Array> { return this.base.lerBinario(path); }
  escreverTexto(path: string, conteudo: string): Promise<void> { return this.base.escreverTexto(path, conteudo); }
  escreverBinario(path: string, dados: Uint8Array): Promise<void> { return this.base.escreverBinario(path, dados); }
  criarPasta(path: string): Promise<void> { return this.base.criarPasta(path); }
  mover(de: string, para: string): Promise<void> { return this.base.mover(de, para); }
  remover(path: string): Promise<void> { return this.base.remover(path); }
  listarPasta(path: string): Promise<{ nome: string; isDir: boolean }[]> { return this.base.listarPasta(path); }
  existe(path: string): Promise<boolean> { return this.base.existe(path); }
  observar(_cb: (eventos: EventoArquivo[]) => void): () => void { return () => undefined; }
  aoPerderSincronia(_cb: () => void): () => void { return () => undefined; }
}

export async function listarVaultsMobile(): Promise<RegistroVaultsMobile> {
  return carregarVaultsMobile();
}

async function criarVaultMobileSerializado(nomeBruto: string): Promise<VaultAbertoMobile> {
  let caminhoCriado: string | null = null;
  let preservarPasta = false;
  try {
    const nome = nomeBruto.trim().normalize("NFC");
    if (!nome || nome.length > 80 || /[\\/:*?"<>|\u0000-\u001f]/.test(nome) || nome.startsWith(".")) {
      throw new Error(traduzirAgora("mobile.nomeVaultInvalido"));
    }
    const [raizBruta, registro] = await Promise.all([
      invoke<string>("preparar_vaults_mobile"),
      carregarVaultsMobile(),
    ]);
    const raiz = raizBruta.replace(/[/\\]+$/, "");
    const chaveNome = nome.toLocaleLowerCase("pt-BR");
    if (registro.vaults.some((item) => item.nome.normalize("NFC").toLocaleLowerCase("pt-BR") === chaveNome)) {
      throw new Error(traduzirAgora("mobile.nomeVaultInvalido"));
    }
    const vault: VaultMobile = { id: crypto.randomUUID().toLowerCase(), nome };
    const caminho = `${raiz}/${vault.id}`;
    if (await exists(caminho)) throw new Error(traduzirAgora("mobile.nomeVaultInvalido"));
    await mkdir(caminho);
    caminhoCriado = caminho;
    const aberto = await abrirVault(vault, raiz);
    const proximo: RegistroVaultsMobile = {
      versao: 1,
      vaults: [...registro.vaults, vault],
      ultimoId: vault.id,
    };
    try {
      await salvarRegistro(proximo);
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes("rollback-incompleto")) {
        preservarPasta = true;
      } else {
        await remove(caminho, { recursive: true }).catch(() => undefined);
        caminhoCriado = null;
      }
      throw erro;
    }
    caminhoCriado = null;
    return aberto;
  } finally {
    if (caminhoCriado && !preservarPasta) await remove(caminhoCriado, { recursive: true }).catch(() => undefined);
  }
}

export function criarVaultMobile(nomeBruto: string): Promise<VaultAbertoMobile> {
  return serializarMutacao(() => criarVaultMobileSerializado(nomeBruto));
}

async function selecionarVaultMobileSerializado(id: string): Promise<VaultAbertoMobile> {
  const [raiz, registro] = await Promise.all([
    invoke<string>("preparar_vaults_mobile"),
    carregarVaultsMobile(),
  ]);
  const vault = registro.vaults.find((item) => item.id === id);
  if (!vault) throw new Error(traduzirAgora("mobile.vaultNaoEncontrado"));
  const aberto = await abrirVault(vault, raiz.replace(/[/\\]+$/, ""));
  await salvarRegistro({ ...registro, ultimoId: vault.id });
  return aberto;
}

export function selecionarVaultMobile(id: string): Promise<VaultAbertoMobile> {
  return serializarMutacao(() => selecionarVaultMobileSerializado(id));
}

export async function ultimoVaultMobile(): Promise<VaultAbertoMobile | null> {
  const registro = await carregarVaultsMobile();
  return registro.ultimoId ? selecionarVaultMobile(registro.ultimoId) : null;
}
