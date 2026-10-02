import type { Sessao } from "../conta/tipos";
import type { SaldoCreditos } from "../servico/creditos";

export type EstadoCreditosConta =
  | "inativo"
  | "verificando"
  | "sem-sessao"
  | "plano-insuficiente"
  | "consultando"
  | "disponivel"
  | "indisponivel-rede"
  | "acesso-nao-confirmado";

export interface EstadoSaldoCreditosConta {
  estado: EstadoCreditosConta;
  saldo: SaldoCreditos | null;
  /** Identidade técnica para impedir que uma resposta de outra sessão libere saldo ou ação. */
  identidadeSessao: string | null;
}

export interface ContaAtualCreditos {
  carregado: boolean;
  sessao: Sessao | null;
}

export type ResultadoRecuperacaoSessao =
  | { estado: "expirada" }
  | { estado: "token-atualizado"; sessao: Sessao }
  | { estado: "acesso-nao-confirmado"; sessao: Sessao | null };

export type EstadoCreditoApresentacao = EstadoSaldoCreditosConta;
