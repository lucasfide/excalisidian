// Busca por título para a busca unificada (doc 13 §1.3 item 1 e §2.1). Casa H1 (`title`),
// nome do arquivo sem extensão e aliases — sem acento e sem caixa, usando `dobrar`. Só
// notas e desenhos: anexo não tem título pra buscar por ele (vira resultado do "Explorer",
// não desta busca). Puro e testável, índice por parâmetro opcional — mesmo molde de
// `buscarSugestoesLink` (src/indice/sugestoesLink.ts), que resolve o mesmo tipo de consulta
// pro autocomplete de link.

import { useVaultStore } from "../estado/vaultStore";
import type { FileMeta } from "../indice/parser";
import { dobrar } from "./normalizacao";

export interface ResultadoTitulo {
  path: string;
  titulo: string;
  kind: "note" | "drawing";
  /** Caminho da pasta pai, sem o nome do arquivo; "" na raiz. */
  pasta: string;
}

const LIMITE_TITULOS = 6;
const LIMITE_RECENTES = 8;

function pastaDe(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function nomeSemExtensao(path: string): string {
  return path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/\.draw\.md$/i, "")
    .replace(/\.md$/i, "");
}

function paraResultado(m: FileMeta): ResultadoTitulo {
  return { path: m.path, titulo: m.title, kind: m.kind as "note" | "drawing", pasta: pastaDe(m.path) };
}

/** Só nota e desenho — o mesmo filtro de `buscarSugestoesLink` pra anexo, mas sem a exceção
 * de imagem (aqui não existe "consulta pedindo anexo": título de anexo não é um conceito). */
function itensBuscaveis(indice?: Map<string, FileMeta>): FileMeta[] {
  return [...(indice ?? useVaultStore.getState().indice).values()].filter(
    (m) => m.kind !== "attachment",
  );
}

/** Pontuação de UM rótulo (título, nome de arquivo ou alias) contra a consulta — os dois já
 * dobrados. Ordem do doc 13 §1.3: igual > começa com > contém palavra que começa com >
 * contém. Quanto maior, melhor; -1 é "este rótulo não casou". */
function pontuarRotulo(rotulo: string, consulta: string): number {
  if (rotulo === consulta) return 5;
  if (rotulo.startsWith(consulta)) return 4;
  if (rotulo.split(/\s+/).some((palavra) => palavra.startsWith(consulta))) return 3;
  if (rotulo.includes(consulta)) return 2;
  return -1;
}

/** Melhor pontuação entre título, nome do arquivo e aliases; cai pro "caminho contém"
 * (último critério do doc 13 §1.3) só quando nenhum rótulo casou. Isto é o que garante "um
 * resultado por arquivo, o melhor rótulo": um FileMeta vira uma única pontuação aqui. */
function melhorPontuacao(m: FileMeta, consulta: string): number {
  const rotulos = [m.title, nomeSemExtensao(m.path), ...m.aliases].map(dobrar);
  const melhor = Math.max(-1, ...rotulos.map((r) => pontuarRotulo(r, consulta)));
  if (melhor >= 0) return melhor;
  return dobrar(m.path).includes(consulta) ? 1 : -1;
}

export function buscarTitulos(
  consulta: string,
  limite = LIMITE_TITULOS,
  indice?: Map<string, FileMeta>,
): ResultadoTitulo[] {
  const q = dobrar(consulta.trim());
  if (!q) return [];
  return itensBuscaveis(indice)
    .map((m) => ({ m, pontos: melhorPontuacao(m, q) }))
    .filter((x) => x.pontos >= 0)
    .sort((a, b) => b.pontos - a.pontos || a.m.title.localeCompare(b.m.title, "pt-BR"))
    .slice(0, limite)
    .map((x) => paraResultado(x.m));
}

/** Seção "Modificados recentemente" (doc 13 §1.2): campo vazio, por `mtimeMs` decrescente. */
export function modificadosRecentemente(
  limite = LIMITE_RECENTES,
  indice?: Map<string, FileMeta>,
): ResultadoTitulo[] {
  return itensBuscaveis(indice)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limite)
    .map(paraResultado);
}

/** Consulta casa em cheio (título, nome do arquivo ou algum alias) — usado pra decidir se
 * mostra "Criar nota «consulta»" (doc 13 §1.3 item 3: só aparece quando NENHUM título casa
 * exatamente). */
export function temTituloExato(consulta: string, indice?: Map<string, FileMeta>): boolean {
  const q = dobrar(consulta.trim());
  if (!q) return false;
  return itensBuscaveis(indice).some((m) =>
    [m.title, nomeSemExtensao(m.path), ...m.aliases].some((r) => dobrar(r) === q),
  );
}
