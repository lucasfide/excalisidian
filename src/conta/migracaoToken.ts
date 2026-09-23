// Migração silenciosa do token legado (settings.json, texto puro) para o cofre do sistema.
// Roda uma vez, na primeira leitura de cada abertura do app (decisão 3 do plano).

import type { CofreToken } from "./cofreToken";

/** O que a migração precisa do lado legado: ler a chave antiga e apagá-la. Não importa se é
 * o `settings.json` de verdade ou um teste — só a forma. */
export interface TokenLegado {
  ler(): Promise<string | null>;
  apagar(): Promise<void>;
}

/**
 * Lê o token da sessão, migrando do legado quando necessário:
 * 1. lê o cofre — erro de leitura conta como "sem token no cofre", não interrompe a migração;
 * 2. lê o legado; se houver token e o cofre estava vazio, tenta gravar no cofre (erro engolido:
 *    a sessão desta abertura segue com o token em memória, a próxima pede login de novo);
 * 3. se havia legado, apaga o legado sempre — mesmo que a gravação no cofre acima tenha
 *    falhado. A promessa "o token nunca aparece em texto puro em disco" não tem exceção; o
 *    custo de apagar de qualquer jeito é só pedir login de novo na próxima abertura, nunca
 *    deixar o texto puro para trás;
 * 4. devolve o token do cofre, ou o do legado, ou `null`.
 */
export async function lerTokenComMigracao(
  cofre: CofreToken,
  legado: TokenLegado,
): Promise<string | null> {
  let tokenCofre: string | null;
  try {
    tokenCofre = await cofre.ler();
  } catch {
    tokenCofre = null;
  }

  const tokenLegado = await legado.ler();

  if (tokenLegado !== null) {
    if (tokenCofre === null) {
      try {
        await cofre.gravar(tokenLegado);
      } catch {
        // Erro engolido — ver comentário da função.
      }
    }
    await legado.apagar();
  }

  return tokenCofre ?? tokenLegado;
}
