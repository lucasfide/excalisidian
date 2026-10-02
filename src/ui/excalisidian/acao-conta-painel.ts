import type { Sessao } from "../../conta/tipos";
import type { ResultadoRecuperacaoSessao } from "../../types/creditos-conta";

export interface CondicaoContaPainel {
  usaProvedorComConta: boolean;
  contaCarregada: boolean;
  sessaoPresente: boolean;
  erroDeSessao: boolean;
}

export type AcaoDepoisRecuperacaoSessao = "abrir-conta" | "continuar" | "tentar-novamente";

export function deveMostrarBotaoContaPainel(condicao: CondicaoContaPainel): boolean {
  return (
    condicao.usaProvedorComConta &&
    condicao.contaCarregada &&
    (!condicao.sessaoPresente || condicao.erroDeSessao)
  );
}

export function acaoDepoisRecuperacaoSessao(
  resultado: ResultadoRecuperacaoSessao,
): AcaoDepoisRecuperacaoSessao {
  if (resultado.estado === "expirada") return "abrir-conta";
  if (resultado.estado === "token-atualizado") return "continuar";
  return "tentar-novamente";
}

export function tokenMudouDuranteRecuperacao(tokenEsperado: string, sessaoAtual: Sessao | null): boolean {
  return sessaoAtual !== null && sessaoAtual.token !== tokenEsperado;
}
