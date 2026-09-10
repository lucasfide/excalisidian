// Parse e serialize do .excalisidian/tarefas.json (doc 10 §2.3).
// parseTarefas nunca lança: JSON inválido ou schema fora do esperado vira lista vazia,
// e quem chama (o store) decide não sobrescrever o arquivo até o usuário criar uma tarefa.
// serializarTarefas é estável: chaves em ordem fixa, tarefas ordenadas por id, idempotente.

import type { DadosTarefas, Tarefa, Comentario } from "./tipos";

export const TAREFAS_VAZIO: DadosTarefas = { versao: 1, tarefas: [] };

function ehString(v: unknown): v is string {
  return typeof v === "string";
}
function stringOuNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function sanearComentario(v: unknown): Comentario | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!ehString(o.id) || !ehString(o.texto) || !ehString(o.criadoEm)) return null;
  return {
    id: o.id,
    texto: o.texto,
    criadoEm: o.criadoEm,
    editadoEm: stringOuNull(o.editadoEm),
  };
}

function sanearTarefa(v: unknown): Tarefa | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!ehString(o.id) || !ehString(o.titulo) || !ehString(o.vencimento) || !ehString(o.criadaEm)) {
    return null;
  }
  const comentarios = Array.isArray(o.comentarios)
    ? o.comentarios.map(sanearComentario).filter((c): c is Comentario => c !== null)
    : [];
  return {
    id: o.id,
    titulo: o.titulo,
    vencimento: o.vencimento,
    ordem: typeof o.ordem === "number" && Number.isFinite(o.ordem) ? o.ordem : 0,
    concluida: o.concluida === true,
    concluidaEm: stringOuNull(o.concluidaEm),
    criadaEm: o.criadaEm,
    comentarios,
  };
}

export function parseTarefas(texto: string): DadosTarefas {
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { versao: 1, tarefas: [] };
  }
  if (!obj || typeof obj !== "object") return { versao: 1, tarefas: [] };
  const bruto = (obj as Record<string, unknown>).tarefas;
  const tarefas = Array.isArray(bruto)
    ? bruto.map(sanearTarefa).filter((t): t is Tarefa => t !== null)
    : [];
  return { versao: 1, tarefas };
}

/** True quando `texto` tem conteúdo mas não representa um arquivo de tarefas válido — o store
 * usa isto pra avisar de corrupção e NÃO sobrescrever o arquivo até o usuário criar algo. */
export function tarefasIlegivel(texto: string): boolean {
  if (texto.trim() === "") return false;
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch {
    return true;
  }
  if (!obj || typeof obj !== "object") return true;
  return !Array.isArray((obj as Record<string, unknown>).tarefas);
}

// Reconstrói cada objeto com as chaves na ordem da tabela do doc 10 §2.1 — JSON.stringify
// respeita a ordem de inserção, então isto fixa o layout do arquivo.
function comentarioEstavel(c: Comentario) {
  return { id: c.id, texto: c.texto, criadoEm: c.criadoEm, editadoEm: c.editadoEm };
}
function tarefaEstavel(t: Tarefa) {
  return {
    id: t.id,
    titulo: t.titulo,
    vencimento: t.vencimento,
    ordem: t.ordem,
    concluida: t.concluida,
    concluidaEm: t.concluidaEm,
    criadaEm: t.criadaEm,
    comentarios: t.comentarios.map(comentarioEstavel),
  };
}

export function serializarTarefas(dados: DadosTarefas): string {
  const tarefas = [...dados.tarefas]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(tarefaEstavel);
  return JSON.stringify({ versao: 1, tarefas }, null, 2) + "\n";
}
