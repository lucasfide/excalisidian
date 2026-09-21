// Liga o idioma do prefsStore ao tradutor. De propósito: toda a lógica mora em tradutor.ts,
// que é puro e testado. O useMemo evita recriar o tradutor a cada render.
//
// Regra do primeiro paint: prefsStore.carregar() roda depois do primeiro render, então
// enquanto usePrefsStore.getState().carregado for false o tradutor responde no padrão
// pt-BR. Uma tela que renderiza texto traduzido já no primeiro paint deve aguardar
// `carregado` antes de confiar no idioma escolhido pelo usuário.

import { useMemo } from "react";

import { usePrefsStore } from "../estado/prefsStore";
import { criarTradutor, type TradutorDoApp } from "./catalogo";

export function useTexto(): TradutorDoApp {
  const idioma = usePrefsStore((s) => s.idioma);
  return useMemo(() => criarTradutor(idioma), [idioma]);
}
