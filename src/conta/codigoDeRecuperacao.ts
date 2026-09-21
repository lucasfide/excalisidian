// O código que o usuário guarda ou imprime na criação da conta.
//
// Existe porque o sync não é legível pelo servidor: não há "esqueci minha senha", e este
// código é a única volta atrás. A derivação da chave de criptografia a partir dele mora no
// plano de sync; aqui é só geração e forma, que são puras e testáveis hoje.
//
// Alfabeto sem 0, O, 1, I e L: o código vai ser copiado à mão de um papel.

export const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const TAMANHO = 24;
const GRUPO = 4;

function aleatorioPadrao(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function gerarCodigoDeRecuperacao(
  aleatorio: (n: number) => Uint8Array = aleatorioPadrao,
): string {
  const bytes = aleatorio(TAMANHO);
  let codigo = "";
  for (let i = 0; i < TAMANHO; i++) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return codigo;
}

/** Grupos de quatro com hífen: é assim que fica legível num papel. */
export function formatarCodigo(codigo: string): string {
  const grupos: string[] = [];
  for (let i = 0; i < codigo.length; i += GRUPO) {
    grupos.push(codigo.slice(i, i + GRUPO));
  }
  return grupos.join("-");
}

/** Aceita o que a pessoa digitar: caixa baixa, hífen, espaço. Descarta o que não é do
 * alfabeto em vez de recusar — quem digitou "O" quis dizer alguma coisa, e recusar a
 * colagem inteira por causa de um caractere seria hostil. A validação de tamanho pega o
 * erro de verdade. */
export function normalizarCodigo(entrada: string): string {
  return entrada
    .toUpperCase()
    .split("")
    .filter((c) => ALFABETO.includes(c))
    .join("");
}

export function codigoValido(entrada: string): boolean {
  return normalizarCodigo(entrada).length === TAMANHO;
}
