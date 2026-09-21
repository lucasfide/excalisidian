// Os textos da interface. Chave plana, com ponto separando o domínio: "vault.erro.existe".
//
// PT_BR é a FONTE DA VERDADE e define o tipo ChaveTexto — uma chave só existe se estiver
// aqui. EN é `Partial` para não travar a edição: uma tradução faltando cai no português
// (tradutor.ts), que é garantia de execução — nunca mostra chave crua na tela. A regra do
// projeto é cobrar a tradução em si por teste antes do commit, mas essa trava de
// completude ainda não existe neste módulo — entra na tarefa 7 deste plano.
//
// Regras de redação valem para os dois idiomas: sentence case, sem emoji, sem ponto final
// em rótulo de botão. O teste deste módulo cobre as invariantes, não a redação.

import type { Idioma } from "./idioma";
import { criarTradutorDe } from "./tradutor";

export const PT_BR = {
  // Criação de vault — doc 12 §2 / doc 04 §13.
  "vault.erro.nomeVazio": "Dê um nome ao vault.",
  "vault.erro.nomeInvalido":
    'O nome não pode ter / \\ : * ? " < > | nem começar com ponto.',
  "vault.erro.existe": "Já existe uma pasta com esse nome nesse local.",
  "vault.erro.paiIndisponivel": "Não foi possível acessar o local escolhido.",

  // Preferências.
  "prefs.idioma.rotulo": "Idioma",
  "prefs.idioma.descricao": "Muda o idioma da interface. Suas notas não são afetadas.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
} as const;

export type ChaveTexto = keyof typeof PT_BR;

export const EN: Partial<Record<ChaveTexto, string>> = {
  "vault.erro.nomeVazio": "Give the vault a name.",
  "vault.erro.nomeInvalido":
    'The name cannot contain / \\ : * ? " < > | or start with a dot.',
  "vault.erro.existe": "A folder with this name already exists here.",
  "vault.erro.paiIndisponivel": "Could not access the chosen location.",

  "prefs.idioma.rotulo": "Language",
  "prefs.idioma.descricao": "Changes the interface language. Your notes are not affected.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
};

export const CATALOGOS: Record<Idioma, Record<string, string>> = {
  "pt-BR": PT_BR,
  en: EN as Record<string, string>,
};

/** Tradutor do app: chaveado por `ChaveTexto`, não por `string` solta — `t("chave.errada")`
 * (com typo) não compila. `tradutor.ts` continua genérico com `string` de propósito, porque é
 * isso que permite testar `criarTradutorDe` com um catálogo inventado. */
export type TradutorDoApp = (
  chave: ChaveTexto,
  params?: Record<string, string | number>,
) => string;

/** O tradutor do app, já amarrado no catálogo real. */
export function criarTradutor(idioma: Idioma): TradutorDoApp {
  return criarTradutorDe(CATALOGOS, idioma);
}
