// Resolução de texto: chave → idioma pedido → português → a própria chave.
//
// A queda para o português é deliberada: uma tradução faltando mostra o texto certo em
// português, o que é feio mas legível. Mostrar a chave crua na tela seria pior. A chave só
// aparece quando ela não existe em lugar nenhum, e aí é bug de quem escreveu o JSX.

import type { Idioma } from "./idioma";

export type Tradutor = (chave: string, params?: Record<string, string | number>) => string;

const MARCADOR = /\{(\w+)\}/g;

/** Troca `{nome}` pelos parâmetros. Marcador sem parâmetro fica literal de propósito. */
export function interpolar(texto: string, params?: Record<string, string | number>): string {
  if (!params) return texto;
  return texto.replace(MARCADOR, (literal, nome: string) =>
    nome in params ? String(params[nome]) : literal,
  );
}

export function criarTradutorDe(
  catalogos: Record<Idioma, Record<string, string>>,
  idioma: Idioma,
): Tradutor {
  const escolhido = catalogos[idioma] ?? {};
  const fonte = catalogos["pt-BR"] ?? {};
  return (chave, params) => {
    const texto = escolhido[chave] ?? fonte[chave] ?? chave;
    return interpolar(texto, params);
  };
}
