// Lista de vaults recentes (doc 12 §3.1). Guardada em `settings.json` — mesmo arquivo que
// TauriVaultAdapter usa pro "último vault usado" (`vaultPath`, RF1.2) — na chave
// `vaultsRecentes`. Várias janelas podem mexer nessa lista ao mesmo tempo: toda operação relê
// a lista imediatamente antes de gravar, porque o plugin-store mantém o estado no processo
// Rust, compartilhado entre janelas.
//
// A lógica pura (upsert, ordenação, corte, migração, nomeDoVault, mesmoVault) fica em funções
// exportadas separadas, testáveis sem Tauri.

import { load } from "@tauri-apps/plugin-store";

const CHAVE_RECENTES = "vaultsRecentes";
const CHAVE_VAULT = "vaultPath"; // mesma chave de TauriVaultAdapter.

export interface VaultRecente {
  caminho: string;
  abertoEm: number; // ms epoch
}

export const MAX_RECENTES = 20;

/** Caminho absoluto -> chave de comparação (barra normalizada, minúsculas). Só para comparar:
 * o caminho da pasta do vault nunca é reescrito antes de ir pro disco ou pro Rust. */
function chave(caminho: string): string {
  return caminho.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Nome de exibição do vault: último segmento do caminho, aceita "/" e "\". */
export function nomeDoVault(caminho: string): string {
  const semBarraFinal = caminho.replace(/[/\\]+$/, "");
  const i = Math.max(
    semBarraFinal.lastIndexOf("/"),
    semBarraFinal.lastIndexOf("\\"),
  );
  return i === -1 ? semBarraFinal : semBarraFinal.slice(i + 1);
}

/** Compara dois caminhos de vault ignorando separador e maiúsculas/minúsculas. */
export function mesmoVault(a: string, b: string): boolean {
  return chave(a) === chave(b);
}

/**
 * Upsert puro: remove qualquer entrada existente do mesmo vault, põe a nova no topo,
 * reordena por `abertoEm` desc e corta em `MAX_RECENTES`.
 */
export function upsertRecente(
  lista: VaultRecente[],
  caminho: string,
  abertoEm: number,
): VaultRecente[] {
  const sem = lista.filter((v) => !mesmoVault(v.caminho, caminho));
  return [{ caminho, abertoEm }, ...sem]
    .sort((a, b) => b.abertoEm - a.abertoEm)
    .slice(0, MAX_RECENTES);
}

/**
 * Migração pura: se já existe uma lista salva, é ela. Senão, se existe um `vaultPath` antigo
 * (versão anterior a múltiplos vaults), a lista nasce com ele dentro.
 */
export function migrarDeVaultPath(
  listaSalva: VaultRecente[] | undefined,
  vaultPathAntigo: string | undefined,
  agora: number,
): VaultRecente[] {
  if (listaSalva) return listaSalva;
  if (vaultPathAntigo) return [{ caminho: vaultPathAntigo, abertoEm: agora }];
  return [];
}

async function lerLista(): Promise<VaultRecente[]> {
  const store = await load("settings.json", { autoSave: false });
  const salva = await store.get<VaultRecente[]>(CHAVE_RECENTES);
  const antigo = salva ? undefined : await store.get<string>(CHAVE_VAULT);
  return migrarDeVaultPath(salva, antigo, Date.now());
}

/** Lista os vaults recentes, do mais recente pro mais antigo. */
export async function listarRecentes(): Promise<VaultRecente[]> {
  const lista = await lerLista();
  return [...lista].sort((a, b) => b.abertoEm - a.abertoEm);
}

/** Upsert + corta em MAX_RECENTES + grava; também atualiza `vaultPath` (último vault usado). */
export async function registrarAbertura(caminho: string): Promise<void> {
  const store = await load("settings.json", { autoSave: false });
  const atual = await lerLista();
  const nova = upsertRecente(atual, caminho, Date.now());
  await store.set(CHAVE_RECENTES, nova);
  await store.set(CHAVE_VAULT, caminho);
  await store.save();
}

/** Esquece o vault na lista. Nunca mexe em pasta ou arquivo (decisão do usuário, doc 12). */
export async function removerDosRecentes(caminho: string): Promise<void> {
  const store = await load("settings.json", { autoSave: false });
  const atual = await lerLista();
  const nova = atual.filter((v) => !mesmoVault(v.caminho, caminho));
  await store.set(CHAVE_RECENTES, nova);
  await store.save();
}
