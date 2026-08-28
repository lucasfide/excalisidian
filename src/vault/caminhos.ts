// Normalização de caminhos: sempre "/" como separador, sempre NFC antes de comparar, e a
// chave canônica é o caminho em minúsculas (o Windows compara caminho case-insensitive).
// Validação de nome de arquivo do Windows vive aqui também (usada a partir da Fatia 1).

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

const NOMES_RESERVADOS = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

function temCaractereDeControle(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 32) return true;
  }
  return false;
}

/** Valida um nome de arquivo (não caminho) contra as regras do Windows. Doc 02, seção 9. */
export function validarNomeArquivo(nome: string): { ok: boolean; motivo?: string } {
  const limpo = nome.trim();
  if (limpo.length === 0) return { ok: false, motivo: "O nome não pode ser vazio." };
  if (/[<>:"/\\|?*]/.test(nome)) return { ok: false, motivo: 'O nome não pode conter < > : " / \\ | ? *.' };
  if (temCaractereDeControle(nome)) return { ok: false, motivo: "O nome não pode conter caracteres de controle." };
  if (/[. ]$/.test(nome)) return { ok: false, motivo: "O nome não pode terminar em ponto ou espaço." };
  const semExt = nome.replace(/\.[^.]*$/, "").toLowerCase();
  if (NOMES_RESERVADOS.has(semExt)) return { ok: false, motivo: `"${nome}" é um nome reservado do Windows.` };
  return { ok: true };
}
