// Estado da sincronização por computador (doc 17 §5, §7). Fora do vault, em %APPDATA%
// (doc 17 §4.4 — senão o próprio estado seria sincronizado), num arquivo por vault via
// plugin-store, igual ao padrão de `src/indice/cache.ts`.

import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

import { hashVault } from "../indice/cache";

const VERSAO_ESTADO_SYNC = 1;

/** Chave de `settings.json` para o nome do computador (doc 17 §7) — não colide com nenhuma
 * chave existente (`tema`, `idioma`, `larguraNota`, `sidebarColapsada`,
 * `barraFormatacaoAcoplada`, `nomeUsuario`, `asciiPeaksHabilitado`, `tokenConta`, `agente`,
 * `painelTarefasAberto`, `larguraPainelTarefas`). */
const CHAVE_NOME_DO_COMPUTADOR = "nomeDoComputador";

export interface EstadoSync {
  idDoVault: string;
  cursor: number;
  bases: Record<string, string>;
  hashesConhecidos: Record<string, { mtimeMs: number; size: number; hash: string }>;
  conflitosPendentes: Record<
    string,
    { hashRemoto: string; conteudo: string; dispositivo: string; criadoEm: string }
  >;
}

interface FormatoEstadoSync {
  version: number;
  estado: EstadoSync;
}

function nomeArquivo(raiz: string): string {
  return `sync-${hashVault(raiz)}.json`;
}

/** Lê o estado de sincronização deste computador para o vault. Devolve `null` se nunca foi
 * gravado ou se a versão do formato não bate (formato mudou, estado antigo é descartado). */
export async function carregarEstadoSync(raiz: string): Promise<EstadoSync | null> {
  try {
    const store = await load(nomeArquivo(raiz), { autoSave: false });
    const dados = await store.get<FormatoEstadoSync>("estado");
    if (!dados || dados.version !== VERSAO_ESTADO_SYNC) return null;
    return dados.estado;
  } catch {
    return null;
  }
}

export async function salvarEstadoSync(raiz: string, estado: EstadoSync): Promise<void> {
  const store = await load(nomeArquivo(raiz), { autoSave: false });
  const dados: FormatoEstadoSync = { version: VERSAO_ESTADO_SYNC, estado };
  await store.set("estado", dados);
  await store.save();
}

/** "Parar de sincronizar" (doc 17 §7): apaga o estado deste computador para o vault. Os
 * arquivos do vault não são tocados. */
export async function esquecer(raiz: string): Promise<void> {
  const store = await load(nomeArquivo(raiz), { autoSave: false });
  await store.clear();
  await store.save();
}

/** Nome do computador (doc 17 §7), editável em Configurações → Sincronização. Vive em
 * `settings.json`, mesmo arquivo das preferências (`src/estado/prefsStore.ts`), chave
 * própria — não é por vault, é um só por computador. */
export async function lerNomeDoComputador(): Promise<string> {
  try {
    const store = await load("settings.json", { autoSave: false });
    const salvo = await store.get<string>(CHAVE_NOME_DO_COMPUTADOR);
    if (typeof salvo === "string" && salvo.trim() !== "") return salvo;
  } catch {
    // Sem preferência salva ainda: cai no padrão abaixo.
  }
  return await nomePadraoDoComputador();
}

export async function gravarNomeDoComputador(nome: string): Promise<void> {
  const store = await load("settings.json", { autoSave: false });
  await store.set(CHAVE_NOME_DO_COMPUTADOR, nome.trim());
  await store.save();
}

/** Padrão: o nome de usuário do Windows (comando Rust `nome_usuario`, o mesmo que a tela
 * Início usa via `sugerirNomeUsuario` em `src/app/sistemaOperacional.ts`) seguido de
 * " (este computador)", até alguém mudar (doc 17 §7). */
async function nomePadraoDoComputador(): Promise<string> {
  try {
    const bruto = await invoke<string>("nome_usuario");
    const nome = bruto.trim();
    if (!nome) return "(este computador)";
    return `${nome} (este computador)`;
  } catch {
    return "(este computador)";
  }
}
