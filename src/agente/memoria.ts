// Memória do agente (doc 11 §2.2): arquivos por vault em %APPDATA%, no mesmo padrão do
// layout de abas (`layout/persistencia.ts`) — via plugin-store, que resolve caminho e
// permissão; o plugin-fs tem escopo só do vault. Tudo aqui é descartável: apagar a pasta
// `agente/<hash>/` não perde dado do usuário.
//
// Conversas: um único `conversas.json` keyed pelo caminho da nota (uma conversa por nota
// na v1) — o doc 11 previa uma pasta com um arquivo por conversa; um arquivo com índice
// embutido simplifica "limpar memória" e a restauração no boot sem ganho perceptível.

import { load } from "@tauri-apps/plugin-store";

import { hashVault } from "../indice/cache";

export type Participacao = "aceito" | "recusado" | "adiado";

export interface Resumo {
  mtimeMs: number;
  size: number;
  resumo: string;
}

export interface Fato {
  id: string;
  texto: string;
  notaOrigem: string | null;
  criadoEm: string;
}

export interface ConversaSalva {
  atualizadaEm: string;
  mensagens: { papel: "usuario" | "assistente"; texto: string }[];
}

const VERSAO = 1;
/** Teto de resumos em cache (doc 11 §2.2): estourou, caem os mais antigos por inserção. */
const MAX_RESUMOS = 400;
/** Teto de fatos (doc 11 §2.2): FIFO — o mais antigo sai. */
const MAX_FATOS = 100;

function arquivo(nome: string, raiz: string): string {
  return `agente/${hashVault(raiz)}/${nome}.json`;
}

async function ler<T>(nome: string, raiz: string): Promise<T | null> {
  try {
    const store = await load(arquivo(nome, raiz), { autoSave: false });
    const dados = await store.get<{ version: number; dados: T }>("dados");
    if (!dados || dados.version !== VERSAO) return null;
    return dados.dados;
  } catch {
    return null;
  }
}

async function gravar<T>(nome: string, raiz: string, dados: T): Promise<void> {
  try {
    const store = await load(arquivo(nome, raiz), { autoSave: false });
    await store.set("dados", { version: VERSAO, dados });
    await store.save();
  } catch {
    // memória é cache: falhou, a próxima tentativa grava
  }
}

/** path → decisão do convite. `recusado` é definitivo por nota (RF11.4). */
export async function carregarParticipacao(
  raiz: string,
): Promise<Record<string, Participacao>> {
  return (await ler<Record<string, Participacao>>("participacao", raiz)) ?? {};
}

export function salvarParticipacao(
  raiz: string,
  mapa: Record<string, Participacao>,
): Promise<void> {
  return gravar("participacao", raiz, mapa);
}

/** path → resumo com a chave de invalidação (mtimeMs+size, doc 11 §2.2). */
export async function carregarResumos(raiz: string): Promise<Record<string, Resumo>> {
  return (await ler<Record<string, Resumo>>("resumos", raiz)) ?? {};
}

export function salvarResumos(raiz: string, mapa: Record<string, Resumo>): Promise<void> {
  const chaves = Object.keys(mapa);
  const podado: Record<string, Resumo> = {};
  if (chaves.length > MAX_RESUMOS) {
    // ordem de inserção: os mais novos ficam
    for (const k of chaves.slice(chaves.length - MAX_RESUMOS)) podado[k] = mapa[k];
  } else {
    Object.assign(podado, mapa);
  }
  return gravar("resumos", raiz, podado);
}

export async function carregarFatos(raiz: string): Promise<Fato[]> {
  return (await ler<Fato[]>("fatos", raiz)) ?? [];
}

export function salvarFatos(raiz: string, fatos: Fato[]): Promise<void> {
  return gravar("fatos", raiz, fatos);
}

let proximoIdFato = 1;

/**
 * Anexa fatos propostos pelo modelo: dedupe por texto idêntico, FIFO no teto (doc 11 §2.2).
 * Pura o suficiente para testar; recebe o relógio por parâmetro.
 */
export function adicionarFatos(
  atuais: Fato[],
  novos: string[],
  notaOrigem: string | null,
  agora = new Date(),
): Fato[] {
  const vistos = new Set(atuais.map((f) => f.texto));
  const adicionados: string[] = [];
  for (const bruto of novos) {
    const t = bruto.trim();
    if (t === "" || vistos.has(t)) continue;
    vistos.add(t);
    adicionados.push(t);
  }
  if (adicionados.length === 0) return atuais;
  const criados = adicionados.map((texto) => ({
    id: `f-${agora.getTime().toString(16)}-${proximoIdFato++}`,
    texto,
    notaOrigem,
    criadoEm: agora.toISOString(),
  }));
  return [...atuais, ...criados].slice(-MAX_FATOS);
}

export async function carregarConversas(
  raiz: string,
): Promise<Record<string, ConversaSalva>> {
  return (await ler<Record<string, ConversaSalva>>("conversas", raiz)) ?? {};
}

export function salvarConversas(
  raiz: string,
  mapa: Record<string, ConversaSalva>,
): Promise<void> {
  return gravar("conversas", raiz, mapa);
}

/** "Limpar memória" (doc 11 §6.3): esvazia os quatro arquivos, sem apagar nada do vault. */
export async function limparMemoria(raiz: string): Promise<void> {
  await Promise.all([
    salvarParticipacao(raiz, {}),
    salvarResumos(raiz, {}),
    salvarFatos(raiz, []),
    salvarConversas(raiz, {}),
  ]);
}

/** Caminho humano da pasta, para "Abrir pasta do agente" (doc 11 §6.3). */
export function pastaAgenteRelativa(raiz: string): string {
  return `agente/${hashVault(raiz)}`;
}
