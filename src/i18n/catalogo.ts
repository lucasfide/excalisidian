// Os textos da interface. Chave plana, com ponto separando o domínio: "vault.erro.existe".
//
// PT_BR é a FONTE DA VERDADE e define o tipo ChaveTexto — uma chave só existe se estiver
// aqui. EN é `Partial` para não travar a edição: uma tradução faltando cai no português
// (tradutor.ts), que é garantia de execução — nunca mostra chave crua na tela. A regra do
// projeto é cobrar a tradução em si por teste antes do commit (cobertura.test.ts).
//
// Regras de redação valem para os dois idiomas: sentence case, sem emoji, sem ponto final
// em rótulo de botão. O teste deste módulo cobre as invariantes, não a redação.
//
// O catálogo em si mora em `catalogo/<domínio>.ts` — um arquivo de milhares de linhas com
// tudo junto vira ingovernável assim que passar de algumas dezenas de chaves. Este arquivo é
// só o ponto de montagem: continua sendo a ÚNICA porta de entrada — quem importa `PT_BR`,
// `EN`, `ChaveTexto`, `CATALOGOS` ou `criarTradutor` importa daqui, nunca de dentro da pasta
// `catalogo/`.

import type { Idioma } from "./idioma";
import { criarTradutorDe } from "./tradutor";
import { PT_BR_VAULT, EN_VAULT } from "./catalogo/vault";
import { PT_BR_PREFS, EN_PREFS } from "./catalogo/prefs";

export const PT_BR = {
  ...PT_BR_VAULT,
  ...PT_BR_PREFS,
} as const;

export type ChaveTexto = keyof typeof PT_BR;

export const EN: Partial<Record<ChaveTexto, string>> = {
  ...EN_VAULT,
  ...EN_PREFS,
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
