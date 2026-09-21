// src/servico/sessao.ts
// O token de sessão em memória.
//
// Módulo com estado em vez de store zustand porque `cliente.ts` roda fora de componente e
// não pode chamar hook. Quem escreve aqui é o contaStore (plano 03), em todo login,
// logout e carga inicial. Nunca é persistido por este módulo: quem persiste é o contaStore,
// no settings.json.

let token: string | null = null;

export function tokenDaSessaoAtual(): string | null {
  return token;
}

export function definirTokenDaSessao(novo: string | null): void {
  const limpo = novo?.trim();
  token = limpo ? limpo : null;
}
