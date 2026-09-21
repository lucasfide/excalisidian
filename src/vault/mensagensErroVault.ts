// Erros de `criarVault` (doc 12 §2 / doc 04 §13), pelo código que o Rust devolve em
// `Error.message`. Desde a fundação de i18n este módulo devolve CHAVE, não texto: quem tem
// o tradutor é o componente. Compartilhado por `DialogoCriarVault` e `TelaBoasVindas`.

import type { ChaveTexto } from "../i18n/catalogo";

// Object.create(null): `codigo` vem do `Error.message` do Rust — string arbitrária. Um
// objeto literal comum devolveria `Object.prototype.constructor` ou `.toString` pra
// "constructor"/"toString", o `??` não dispararia, e uma FUNÇÃO chegaria até a tela. Sem
// protótipo, o índice só acha o que foi definido aqui embaixo.
const POR_CODIGO: Record<string, ChaveTexto> = Object.create(null);
POR_CODIGO.nome_vazio = "vault.erro.nomeVazio";
POR_CODIGO.nome_invalido = "vault.erro.nomeInvalido";
POR_CODIGO.existe = "vault.erro.existe";
POR_CODIGO.pai_indisponivel = "vault.erro.paiIndisponivel";

/** Código desconhecido cai em "não foi possível acessar o local": é verdade em qualquer
 * falha inesperada de criação, e é melhor que mostrar o código cru na tela. */
export function chaveDoErroVault(codigo: string): ChaveTexto {
  return POR_CODIGO[codigo] ?? "vault.erro.paiIndisponivel";
}
