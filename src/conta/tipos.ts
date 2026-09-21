// Tipos da conta. Sem import: folha de dependências, igual src/agente/tipos.ts.

export type PlanoAssinatura = "gratis" | "premium";

export interface Sessao {
  token: string;
  email: string;
  plano: PlanoAssinatura;
  /** Epoch em ms. Passou disso, `renovar` é obrigatório antes de usar. */
  expiraEm: number;
}

export type ErroConta =
  | "credenciais" // email ou senha não conferem
  | "emailEmUso" // criação com email já cadastrado
  | "rede" // não deu para falar com o servidor
  | "servidor" // o servidor respondeu erro inesperado
  | "expirada"; // token não vale mais

/** Mesmo padrão de `FalhaAgente`: código normalizado aqui, texto da interface em quem mostra. */
export class FalhaConta extends Error {
  constructor(
    public readonly codigo: ErroConta,
    message?: string,
  ) {
    super(message ?? codigo);
    this.name = "FalhaConta";
  }
}
