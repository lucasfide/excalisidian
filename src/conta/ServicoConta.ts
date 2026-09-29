// A fronteira com o servidor de conta. Quatro métodos e nada mais: tudo que o app precisa
// saber sobre autenticação cabe aqui. Duas implementações — Fake (memória) e Http (real).

import type { ResultadoLogin, Sessao } from "./tipos";

export interface ServicoConta {
  /** A senha em mãos deriva, na mesma chamada, a prova de identidade (vai ao servidor) e a
   * `chaveDeEnvelope` (nunca sai do computador) — uma derivação só por login (doc 17 §2,
   * ADR-39 "Mudança de 27/09/2026"). Quem grava a chave no cofre é `contaStore`. */
  entrar(email: string, senha: string): Promise<ResultadoLogin>;
  criar(email: string, senha: string): Promise<ResultadoLogin>;
  /** Troca um token ainda válido por outro com validade esticada. */
  renovar(token: string): Promise<Sessao>;
  /** Lê a sessão do token SEM trocá-lo (`GET /sessoes/atual`). É como uma janela adota o token
   * que outra janela gravou no cofre: `renovar` trocaria o token e derrubaria as outras.
   * 401 vira `FalhaConta("expirada")`. */
  consultar(token: string): Promise<Omit<Sessao, "token">>;
  /** Invalida o token no servidor. Token já inválido não é erro. */
  sair(token: string): Promise<void>;
}
