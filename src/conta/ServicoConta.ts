// A fronteira com o servidor de conta. Quatro métodos e nada mais: tudo que o app precisa
// saber sobre autenticação cabe aqui. Duas implementações — Fake (memória) e Http (real).

import type { Sessao } from "./tipos";

export interface ServicoConta {
  entrar(email: string, senha: string): Promise<Sessao>;
  criar(email: string, senha: string): Promise<Sessao>;
  /** Troca um token ainda válido por outro com validade esticada. */
  renovar(token: string): Promise<Sessao>;
  /** Invalida o token no servidor. Token já inválido não é erro. */
  sair(token: string): Promise<void>;
}
