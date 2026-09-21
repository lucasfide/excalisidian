// Erros de `criarVault` (doc 12 §2 / doc 04 §13), pelo código que o Rust devolve em
// `Error.message`. Desde a fundação de i18n este módulo devolve CHAVE, não texto: quem tem
// o tradutor é o componente. Compartilhado por `DialogoCriarVault` e `TelaBoasVindas`.

import type { ChaveTexto } from "../i18n/catalogo";

const POR_CODIGO: Record<string, ChaveTexto> = {
  nome_vazio: "vault.erro.nomeVazio",
  nome_invalido: "vault.erro.nomeInvalido",
  existe: "vault.erro.existe",
  pai_indisponivel: "vault.erro.paiIndisponivel",
};

/** Código desconhecido cai em "não foi possível acessar o local": é verdade em qualquer
 * falha inesperada de criação, e é melhor que mostrar o código cru na tela. */
export function chaveDoErroVault(codigo: string): ChaveTexto {
  return POR_CODIGO[codigo] ?? "vault.erro.paiIndisponivel";
}
