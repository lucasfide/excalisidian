// Textos do domínio "preferências": `DialogoPreferencias`. Fatia de `catalogo.ts` — ver o
// comentário de topo dele para as regras gerais (fonte da verdade, queda pro português,
// redação).

export const PT_BR_PREFS = {
  "prefs.idioma.rotulo": "Idioma",
  "prefs.idioma.descricao": "Muda o idioma da interface. Suas notas não são afetadas.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_PREFS: Partial<Record<keyof typeof PT_BR_PREFS, string>> = {
  "prefs.idioma.rotulo": "Language",
  "prefs.idioma.descricao": "Changes the interface language. Your notes are not affected.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
};
