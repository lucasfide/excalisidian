// Tradução para uso FORA de componente React — transporte do agente, store de conflitos,
// toast disparado por store, qualquer código que não tem hook. Dentro de componente use
// `useTexto()` em vez disto: só o hook re-renderiza quando o idioma muda; `traduzirAgora`
// lê o idioma corrente uma vez e não avisa ninguém se ele mudar depois.
//
// Importa `usePrefsStore` e `criarTradutor` — não o contrário: `catalogo.ts` não pode
// depender do estado do app, senão vira impossível testar com catálogo inventado.

import { usePrefsStore } from "../estado/prefsStore";
import { criarTradutor, type TradutorDoApp } from "./catalogo";

/** Traduz uma chave no idioma corrente do app, lido direto do prefsStore. */
export const traduzirAgora: TradutorDoApp = (chave, params) =>
  criarTradutor(usePrefsStore.getState().idioma)(chave, params);
