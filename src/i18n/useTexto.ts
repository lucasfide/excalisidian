// Liga o idioma do prefsStore ao tradutor. Três linhas de propósito: toda a lógica mora em
// tradutor.ts, que é puro e testado. O useMemo evita recriar o tradutor a cada render.

import { useMemo } from "react";

import { usePrefsStore } from "../estado/prefsStore";
import { criarTradutor, type TradutorDoApp } from "./catalogo";

export function useTexto(): TradutorDoApp {
  const idioma = usePrefsStore((s) => s.idioma);
  return useMemo(() => criarTradutor(idioma), [idioma]);
}
