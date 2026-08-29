// Normalização de caminhos: sempre "/" como separador, sempre NFC antes de comparar, e a
// chave canônica é o caminho em minúsculas (o Windows compara caminho case-insensitive).
// Validação de nome de arquivo do Windows vive aqui também.

/** Normaliza para uso interno: "/" como separador, sem "/" no fim, NFC. */
export function normalizarCaminho(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .normalize("NFC");
}

/** Chave para comparação e índice: normalizada e em minúsculas. */
export function chaveCanonica(p: string): string {
  return normalizarCaminho(p).toLowerCase();
}

export function nomeBase(p: string): string {
  const n = normalizarCaminho(p);
  const i = n.lastIndexOf("/");
  return i === -1 ? n : n.slice(i + 1);
}

export function pastaDe(p: string): string {
  const n = normalizarCaminho(p);
  const i = n.lastIndexOf("/");
  return i === -1 ? "" : n.slice(0, i);
}

/** Separa um nome de arquivo (não caminho) em base e extensão. `.draw.md` conta como uma
 * extensão só (doc 02 §3.0); um nome sem ponto, ou que começa com ponto (dotfile), não tem
 * extensão nenhuma. */
export function dividirExtensao(nome: string): { base: string; ext: string } {
  if (/\.draw\.md$/i.test(nome)) {
    return { base: nome.slice(0, -".draw.md".length), ext: ".draw.md" };
  }
  const i = nome.lastIndexOf(".");
  if (i <= 0) return { base: nome, ext: "" };
  return { base: nome.slice(0, i), ext: nome.slice(i) };
}

const RE_PROIBIDOS = /[<>:"/\\|?*]/;

const NOMES_RESERVADOS = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

function ehReservado(nome: string): boolean {
  return NOMES_RESERVADOS.has(nome.replace(/\.[^.]*$/, "").toLowerCase());
}

/** True se a string tem algum caractere de controle (código < 32). */
function temControle(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 32) return true;
  }
  return false;
}

function semControle(s: string): string {
  let saida = "";
  for (const c of s) if (c.charCodeAt(0) >= 32) saida += c;
  return saida;
}

/**
 * Sanitização visível para criar nota a partir de link (doc 02 §9 / doc 04 §4): os
 * caracteres proibidos viram `-`, controles somem, não termina em ponto nem espaço.
 * Devolve `null` se sobrar um nome vazio ou reservado.
 */
export function sanitizarNome(nome: string): string | null {
  const s = semControle(nome.replace(new RegExp(RE_PROIBIDOS.source, "g"), "-"))
    .replace(/[.\s]+$/g, "")
    .trim();
  if (s.length === 0 || ehReservado(s)) return null;
  return s;
}

/** Valida um nome de arquivo (não caminho) contra as regras do Windows. Doc 02 §9. */
export function validarNomeArquivo(nome: string): { ok: boolean; motivo?: string } {
  if (nome.trim().length === 0) {
    return { ok: false, motivo: "O nome não pode ser vazio." };
  }
  if (RE_PROIBIDOS.test(nome)) {
    return { ok: false, motivo: 'O nome não pode conter < > : " / \\ | ? *.' };
  }
  if (temControle(nome)) {
    return { ok: false, motivo: "O nome não pode conter caracteres de controle." };
  }
  if (/[.\s]$/.test(nome)) {
    return { ok: false, motivo: "O nome não pode terminar em ponto ou espaço." };
  }
  if (ehReservado(nome)) {
    return { ok: false, motivo: `"${nome}" é um nome reservado do Windows.` };
  }
  return { ok: true };
}
