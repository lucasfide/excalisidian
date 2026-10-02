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
import type { CandidatoFato, Fato } from "../types/memoria-agente";
import {
  contarCodePoints,
  MAX_FATO_CHARS,
  normalizarFatoParaComparacao,
  ORCAMENTO_FATOS_PROMPT,
} from "./regras-memoria";

export { MAX_FATO_CHARS, ORCAMENTO_FATOS_PROMPT } from "./regras-memoria";

export type Participacao = "aceito" | "recusado" | "adiado";

export interface Resumo {
  mtimeMs: number;
  size: number;
  resumo: string;
}

export type { CandidatoFato, Fato } from "../types/memoria-agente";

export interface ConversaSalva {
  atualizadaEm: string;
  mensagens: import("../types/conversa-agente").MensagemConversaAgente[];
}

const VERSAO = 1;
/** Teto de resumos em cache (doc 11 §2.2): estourou, caem os mais antigos por inserção. */
const MAX_RESUMOS = 400;
/** Limite defensivo apenas para novos candidatos pendentes, sem podar fatos existentes. */
const MAX_FATOS_PENDENTES = 100;

function normalizarOrdemRecencia(criadoEm: string, indice: number): number {
  const data = Date.parse(criadoEm);
  return Number.isFinite(data) ? data : indice;
}

function termosRelevantes(texto: string): Set<string> {
  const comuns = new Set([
    "com", "como", "das", "dos", "ela", "ele", "eles", "elas", "essa", "esse",
    "isso", "mais", "mas", "para", "pela", "pelo", "que", "seu", "sua", "seus",
    "suas", "uma", "umas", "uns", "the", "and", "for", "with", "this", "that",
  ]);
  return new Set(
    texto
      .normalize("NFC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((termo) => Array.from(termo).length >= 3 && !comuns.has(termo)) ?? [],
  );
}

/**
 * Seleciona fatos inteiros para o contexto: relevância lexical local, recência em empate
 * e fatos recentes como fallback quando a nota não compartilha termos relevantes.
 */
export function selecionarFatosRelevantes(
  fatos: Fato[],
  textoAtual: string,
  orcamento = ORCAMENTO_FATOS_PROMPT,
  caminhoAtual?: string,
): string[] {
  const termosNota = termosRelevantes(textoAtual);
  const caminhoNormalizado = caminhoAtual?.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  const ordenados = fatos
    .map((fato, indice) => {
      const intersecao = [...termosRelevantes(fato.texto)].filter((termo) => termosNota.has(termo)).length;
      return {
        fato,
        indice,
        relevancia: intersecao,
        recencia: normalizarOrdemRecencia(fato.criadoEm, indice),
      };
    })
    .filter(({ fato }) => {
      if (fato.estado !== "confirmado") return false;
      if (fato.escopo === "vault") return true;
      if (fato.escopo !== "projeto" || !fato.caminhoProjeto || !caminhoNormalizado) return false;
      const projeto = fato.caminhoProjeto.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase().replace(/\/$/, "");
      return caminhoNormalizado === projeto || caminhoNormalizado.startsWith(`${projeto}/`);
    })
    .filter(({ fato }) => contarCodePoints(fato.texto) <= MAX_FATO_CHARS)
    .sort(
      (a, b) =>
        b.relevancia - a.relevancia ||
        b.recencia - a.recencia ||
        b.indice - a.indice,
    );

  const selecionados: string[] = [];
  let usados = 0;
  for (const { fato } of ordenados) {
    const tamanho = fato.texto.length + (selecionados.length > 0 ? 1 : 0);
    if (usados + tamanho > orcamento) continue;
    selecionados.push(fato.texto);
    usados += tamanho;
  }
  return selecionados;
}

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

/** @deprecated Strings do modelo não têm evidência estruturada e nunca devem ser gravadas. */
export function adicionarFatos(
  atuais: Fato[],
  _novos: string[],
  _notaOrigem: string | null,
  _agora = new Date(),
): Fato[] {
  return atuais;
}

function caminhoValido(categoria: unknown, escopo: unknown, caminhoProjeto: unknown): boolean {
  if (categoria !== "preferencia" && categoria !== "glossario" && categoria !== "convencao") return false;
  if (escopo === "vault") return caminhoProjeto === undefined || caminhoProjeto === null || caminhoProjeto === "";
  return escopo === "projeto" && typeof caminhoProjeto === "string" && caminhoProjeto.trim() !== "";
}

function projetoContemNota(caminhoProjeto: string, notaOrigem: string): boolean {
  const projeto = caminhoProjeto.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "").toLowerCase();
  const nota = notaOrigem.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return nota === projeto || nota.startsWith(`${projeto}/`);
}

function normalizarCaminhoProjeto(caminho: string | null | undefined): string | null {
  return caminho?.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "").toLowerCase() || null;
}

function mesmaChave(a: Fato, b: Fato): boolean {
  const caminhoA = normalizarCaminhoProjeto(a.caminhoProjeto);
  const caminhoB = normalizarCaminhoProjeto(b.caminhoProjeto);
  return a.categoria === b.categoria &&
    a.escopo === b.escopo &&
    caminhoA === caminhoB &&
    normalizarFatoParaComparacao(a.chave ?? "") === normalizarFatoParaComparacao(b.chave ?? "");
}

/** Cria sugestões estruturadas pendentes somente quando o trecho é citação literal da nota. */
export function proporFatos(
  atuais: Fato[],
  candidatos: CandidatoFato[],
  notaOrigem: string,
  textoEvidencia: string,
  agora = new Date(),
): Fato[] {
  const restantes = atuais.filter((fato) => fato.estado === "pendente").length;
  const adicionar: Fato[] = [];
  for (const candidato of candidatos) {
    const texto = candidato.texto.trim();
    const evidencia = candidato.trechoEvidencia.trim();
    const chave = candidato.chave.trim();
    if (!caminhoValido(candidato.categoria, candidato.escopo, candidato.caminhoProjeto)) continue;
    if (candidato.escopo === "projeto" && candidato.caminhoProjeto && !projetoContemNota(candidato.caminhoProjeto, notaOrigem)) continue;
    if (!texto || !chave || !evidencia || contarCodePoints(texto) > MAX_FATO_CHARS) continue;
    if (!textoEvidencia.includes(evidencia)) continue;
    if (atuais.concat(adicionar).some((fato) =>
      (fato.escopo === undefined ||
        (fato.escopo === candidato.escopo &&
          normalizarCaminhoProjeto(fato.caminhoProjeto) === normalizarCaminhoProjeto(candidato.caminhoProjeto))) &&
      normalizarFatoParaComparacao(fato.texto) === normalizarFatoParaComparacao(texto),
    )) continue;
    if (restantes + adicionar.length >= MAX_FATOS_PENDENTES) break;
    adicionar.push({
      id: `f-${agora.getTime().toString(16)}-${proximoIdFato++}`,
      texto,
      chave,
      categoria: candidato.categoria,
      escopo: candidato.escopo,
      caminhoProjeto: candidato.escopo === "projeto" ? candidato.caminhoProjeto?.trim() ?? null : null,
      trechoEvidencia: evidencia,
      notaOrigem,
      fonte: "nota",
      criadoEm: agora.toISOString(),
      estado: "pendente",
    });
  }
  return adicionar.length > 0 ? [...atuais, ...adicionar] : atuais;
}

/** Confirma explicitamente; uma lembrança anterior só é substituída aqui. */
export function confirmarFato(atuais: Fato[], id: string, agora = new Date()): Fato[] {
  const alvo = atuais.find((fato) => fato.id === id);
  if (!alvo || alvo.estado === "confirmado" || alvo.estado === "substituido" || alvo.estado === "rejeitado") return atuais;
  if (contarCodePoints(alvo.texto) > MAX_FATO_CHARS) return atuais;
  const promovido: Fato = alvo.estado === undefined
    ? {
        ...alvo,
        categoria: "convencao",
        escopo: "vault",
        caminhoProjeto: null,
        chave: normalizarFatoParaComparacao(alvo.texto),
        trechoEvidencia: null,
        fonte: "usuario",
        estado: "confirmado",
        atualizadoEm: agora.toISOString(),
      }
    : { ...alvo, estado: "confirmado", atualizadoEm: agora.toISOString() };
  return atuais.map((fato) => {
    if (fato.id === id) return promovido;
    if (fato.estado === "confirmado" && mesmaChave(fato, promovido)) return { ...fato, estado: "substituido", atualizadoEm: agora.toISOString() };
    return fato;
  });
}

/** Edição manual é uma declaração do usuário e substitui a evidência da nota. */
export function atualizarFato(atuais: Fato[], id: string, texto: string, agora = new Date()): Fato[] {
  const novoTexto = texto.trim();
  if (!novoTexto || contarCodePoints(novoTexto) > MAX_FATO_CHARS) return atuais;
  if (!atuais.some((fato) => fato.id === id && fato.estado !== "substituido" && fato.estado !== "rejeitado")) return atuais;
  return atuais.map((fato) => fato.id === id && fato.estado !== "substituido" && fato.estado !== "rejeitado"
    ? {
        ...fato,
        texto: novoTexto,
        notaOrigem: null,
        fonte: "usuario",
        trechoEvidencia: null,
        categoria: fato.categoria ?? "convencao",
        escopo: fato.escopo ?? "vault",
        caminhoProjeto: fato.caminhoProjeto ?? null,
        chave: fato.chave ?? normalizarFatoParaComparacao(novoTexto),
        atualizadoEm: agora.toISOString(),
      }
    : fato);
}

export function rejeitarFato(atuais: Fato[], id: string, agora = new Date()): Fato[] {
  return atuais.map((fato) => fato.id === id && (fato.estado === "pendente" || fato.estado === undefined)
    ? { ...fato, estado: "rejeitado", atualizadoEm: agora.toISOString() }
    : fato);
}

/** Registra uma preferência declarada diretamente pelo usuário, sem inferência do modelo. */
export function criarPreferenciaUsuario(atuais: Fato[], texto: string, agora = new Date()): Fato[] {
  const valor = texto.trim();
  if (!valor || contarCodePoints(valor) > MAX_FATO_CHARS) return atuais;
  const chave = normalizarFatoParaComparacao(valor);
  if (atuais.some((fato) => fato.estado === "confirmado" && fato.escopo === "vault" && normalizarFatoParaComparacao(fato.texto) === chave)) return atuais;
  return [...atuais, {
    id: `f-${agora.getTime().toString(16)}-${proximoIdFato++}`,
    texto: valor,
    chave,
    categoria: "preferencia",
    escopo: "vault",
    caminhoProjeto: null,
    trechoEvidencia: valor,
    fonte: "usuario",
    estado: "confirmado",
    notaOrigem: null,
    criadoEm: agora.toISOString(),
  }];
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
