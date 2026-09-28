// Tipos da conta. Sem import: folha de dependências, igual src/agente/tipos.ts.

/**
 * Mínimo de caracteres da senha ao CRIAR conta (decisão 7 do plano ADR-39). Não no
 * `entrar`: quem já tem conta não pode ficar trancado por uma regra nova. Contada depois
 * de `normalize("NFC")` — ver comentário em `ServicoContaHttp.criar` sobre por que a
 * contagem usa `[...senha].length` e não `senha.length`.
 */
export const SENHA_MINIMA = 12;

export type PlanoAssinatura = "gratis" | "premium";

export interface Sessao {
  token: string;
  email: string;
  plano: PlanoAssinatura;
  /** Epoch em ms. Passou disso, `renovar` é obrigatório antes de usar. */
  expiraEm: number;
}

/** O que `entrar`/`criar` devolvem (plano 12 Task 2, ADR-39 "Mudança de 27/09/2026"): a
 * `chaveDeEnvelope` nasce junto da sessão, porque é o único momento em que o app tem a
 * senha em mãos — nunca duas derivações por login, a mesma chamada que produz a prova de
 * identidade também produz esta chave. Quem chama grava no cofre (`contaStore`); este tipo
 * só carrega os dois valores juntos até lá. */
export interface ResultadoLogin {
  sessao: Sessao;
  chaveDeEnvelope: Uint8Array;
}

export type ErroConta =
  | "credenciais" // email ou senha não conferem
  | "emailEmUso" // criação com email já cadastrado
  | "senhaCurta" // criação com senha menor que SENHA_MINIMA
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
