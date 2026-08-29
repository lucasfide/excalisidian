// Lê os tokens de cor do canvas do CSS (--color-traco-* / --color-fundo-* / --color-postit-*)
// no tema ativo e monta a paleta que vai para o Excalidraw. Nunca hex literal aqui — a fonte
// da verdade é src/estilos/globals.css (doc 06). Recalcular ao trocar de tema.

export interface CorNomeada {
  nome: string;
  hex: string;
}

export interface PaletaCanvas {
  /** 5 cores de traço. */
  tracos: CorNomeada[];
  /** 5 opções de preenchimento (a primeira é "transparent"). */
  fundos: CorNomeada[];
  /** 4 cores de post-it. */
  postits: CorNomeada[];
  /** Cor dos pontos da grade de fundo. */
  grade: string;
}

const NOMES_TRACO = [
  "traco-tinta",
  "traco-musgo",
  "traco-ocre",
  "traco-bordo",
  "traco-suave",
];
const NOMES_FUNDO = ["fundo-neutro", "fundo-musgo", "fundo-ocre", "fundo-bordo"];
const NOMES_POSTIT = [
  "postit-ocre",
  "postit-musgo",
  "postit-bordo",
  "postit-neutro",
];

/** Tamanhos de fonte do desenho (doc 06). Se a 0.18.1 não tiver o GG, o editor cai para 3. */
export const TAMANHOS_FONTE = { P: 16, M: 20, G: 28, GG: 36 } as const;

function lerToken(nome: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${nome}`)
    .trim();
}

export function lerPaletaCanvas(): PaletaCanvas {
  return {
    tracos: NOMES_TRACO.map((n) => ({ nome: n, hex: lerToken(n) })),
    fundos: [
      { nome: "fundo-nenhum", hex: "transparent" },
      ...NOMES_FUNDO.map((n) => ({ nome: n, hex: lerToken(n) })),
    ],
    postits: NOMES_POSTIT.map((n) => ({ nome: n, hex: lerToken(n) })),
    grade: lerToken("regua"),
  };
}

/** true quando o tema escuro está ativo (classe `dark` no <html>, alternada por App.tsx). */
export function temaEscuroAtivo(): boolean {
  return document.documentElement.classList.contains("dark");
}
