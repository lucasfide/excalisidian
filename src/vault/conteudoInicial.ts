// Conteúdo de exemplo do primeiro vault (doc 15 §1.3, §2.2 — O2 do plano de onboarding). Dois
// arquivos gravados na raiz do vault recém-criado: a nota "Boas-vindas.md" e o desenho
// "Primeiro desenho.draw.md", este último linkado e embutido pela nota. `textoNotaBoasVindas`
// e `textoDesenhoExemplo` são puros (sem `Math.random`, sem tocar o vault) só para serem
// testáveis e determinísticos; quem grava em disco é `criarConteudoInicial`.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { useVaultStore } from "../estado/vaultStore";
import { caminhoLivre } from "./criar";
import {
  serializarDesenho,
  blockIdsDaCena,
  type DadosDesenho,
} from "../canvas/formatoDesenho";
import { lerPaletaCanvas, type PaletaCanvas } from "../canvas/paletaCanvas";

export const NOME_NOTA_BOAS_VINDAS = "Boas-vindas";
export const NOME_DESENHO_EXEMPLO = "Primeiro desenho";

/** Alvo canônico do wikilink para o desenho de exemplo (doc 02 §3.0: forma sem `.md`). */
const ALVO_DESENHO_EXEMPLO = `${NOME_DESENHO_EXEMPLO}.draw`;

export function textoNotaBoasVindas(): string {
  return `# ${NOME_NOTA_BOAS_VINDAS}

Este vault é só uma pasta com arquivos \`.md\` comuns: abra num editor de texto qualquer e o
conteúdo está todo lá, sem formato escondido.

Esta frase linka para um desenho de exemplo: [[${ALVO_DESENHO_EXEMPLO}]]. E aqui embaixo ele
aparece embutido, direto na nota:

![[${ALVO_DESENHO_EXEMPLO}]]

Para linkar outra nota, digite \`[[\` e escolha o nome. Para abrir qualquer arquivo pelo nome,
\`Ctrl+O\`. Para os comandos do app, \`Ctrl+P\`. Para o painel de tarefas, \`Ctrl+\\\`.

Uma lista de tarefas é markdown puro:

- [ ] Criar a primeira nota
- [ ] Abrir o desenho de exemplo
- [ ] Apagar esta nota quando não precisar mais dela

Esta nota e o desenho são só um ponto de partida: pode apagar os dois quando quiser.
`;
}

// --- desenho de exemplo -----------------------------------------------------------------

// Ids fixos (nunca gerados por nanoid/Math.random) para o desenho nascer sempre byte a byte
// igual: são o que vira blockId (doc 02 §3.1) e o que os bindings de seta referenciam.
const ID_RETANGULO = "retangulo-ideia";
const ID_TEXTO_RETANGULO = "texto-ideia";
const ID_ELIPSE = "elipse-nota";
const ID_TEXTO_ELIPSE = "texto-nota";
const ID_SETA = "seta-liga";
const ID_TEXTO_SOLTO = "texto-solto";

// Sementes do roughjs (doc 02 §3.3: `seed` é gravado, então precisa ser fixo para o
// desenho não mudar de aparência a cada geração).
const SEMENTES: Record<string, number> = {
  [ID_RETANGULO]: 1101,
  [ID_TEXTO_RETANGULO]: 1102,
  [ID_ELIPSE]: 1103,
  [ID_TEXTO_ELIPSE]: 1104,
  [ID_SETA]: 1105,
  [ID_TEXTO_SOLTO]: 1106,
};

// Mesmo valor de `FONT_FAMILY.Excalifont` do próprio `@excalidraw/excalidraw` (fixo no
// pacote pinado em 0.18.1). Não importamos o pacote em runtime aqui: seu index puxa
// `roughjs/bin/rough` de um jeito que o resolvedor ESM do Vitest (ambiente "node", sem DOM)
// não resolve, e este módulo precisa continuar puro e testável sem mock de canvas.
const FONTE_PADRAO = 5;

/** Campos comuns a todo `ExcalidrawElement` (doc 02 §3.3 e o shape real do pacote 0.18.1).
 * `version`/`versionNonce`/`updated` aqui não importam: `serializarDesenho` os descarta. */
function baseComum(id: string, cor: string) {
  return {
    id,
    strokeColor: cor,
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeWidth: 2,
    strokeStyle: "solid" as const,
    roundness: null,
    roughness: 1,
    opacity: 100,
    angle: 0,
    seed: SEMENTES[id],
    version: 1,
    versionNonce: 0,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null as { id: string; type: "arrow" | "text" }[] | null,
    updated: 0,
    link: null,
    locked: false,
  };
}

function criarTextoLigado(
  id: string,
  containerId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  texto: string,
  cor: string,
) {
  return {
    ...baseComum(id, cor),
    type: "text" as const,
    x,
    y,
    width,
    height,
    text: texto,
    originalText: texto,
    fontSize: 20,
    fontFamily: FONTE_PADRAO,
    textAlign: "center" as const,
    verticalAlign: "middle" as const,
    containerId,
    autoResize: true,
    lineHeight: 1.25,
  };
}

/**
 * Cena de exemplo: um retângulo com o texto "Ideia" dentro, uma seta ligando o retângulo a
 * uma elipse com o texto "Nota" dentro (bindings nos dois lados) e um texto solto "Desenhe à
 * vontade". Cor sai só de `paleta` — nunca hex literal aqui (CLAUDE.md).
 */
export function textoDesenhoExemplo(paleta: PaletaCanvas): string {
  const cor = paleta.traco;

  const retangulo = {
    ...baseComum(ID_RETANGULO, cor),
    type: "rectangle" as const,
    x: 100,
    y: 140,
    width: 220,
    height: 100,
    boundElements: [
      { id: ID_TEXTO_RETANGULO, type: "text" as const },
      { id: ID_SETA, type: "arrow" as const },
    ],
  };
  const textoRetangulo = criarTextoLigado(
    ID_TEXTO_RETANGULO,
    ID_RETANGULO,
    175,
    177,
    70,
    25,
    "Ideia",
    cor,
  );

  const elipse = {
    ...baseComum(ID_ELIPSE, cor),
    type: "ellipse" as const,
    x: 520,
    y: 140,
    width: 220,
    height: 100,
    boundElements: [
      { id: ID_TEXTO_ELIPSE, type: "text" as const },
      { id: ID_SETA, type: "arrow" as const },
    ],
  };
  const textoElipse = criarTextoLigado(
    ID_TEXTO_ELIPSE,
    ID_ELIPSE,
    720,
    177,
    65,
    25,
    "Nota",
    cor,
  );

  const seta = {
    ...baseComum(ID_SETA, cor),
    type: "arrow" as const,
    x: 320,
    y: 190,
    width: 200,
    height: 0,
    points: [
      [0, 0],
      [200, 0],
    ],
    lastCommittedPoint: null,
    startBinding: { elementId: ID_RETANGULO, focus: 0, gap: 8 },
    endBinding: { elementId: ID_ELIPSE, focus: 0, gap: 8 },
    startArrowhead: null,
    endArrowhead: "arrow" as const,
  };

  const textoSolto = {
    ...baseComum(ID_TEXTO_SOLTO, cor),
    type: "text" as const,
    x: 100,
    y: 340,
    width: 260,
    height: 25,
    text: "Desenhe à vontade",
    originalText: "Desenhe à vontade",
    fontSize: 20,
    fontFamily: FONTE_PADRAO,
    textAlign: "left" as const,
    verticalAlign: "top" as const,
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
  };

  const elements = [
    retangulo,
    textoRetangulo,
    elipse,
    textoElipse,
    seta,
    textoSolto,
  ] as unknown as ExcalidrawElement[];

  const blockIds = blockIdsDaCena(elements);
  const dados: DadosDesenho = {
    frontmatter: {},
    verso: "",
    textElements: new Map([
      [blockIds.get(ID_TEXTO_RETANGULO)!, "Ideia"],
      [blockIds.get(ID_TEXTO_ELIPSE)!, "Nota"],
      [blockIds.get(ID_TEXTO_SOLTO)!, "Desenhe à vontade"],
    ]),
    elementLinks: new Map(),
    embeddedFiles: new Map(),
    cena: { elements, appState: {} },
  };

  return serializarDesenho(dados);
}

// --- gravação no vault -------------------------------------------------------------------

/**
 * Grava a nota de boas-vindas e o desenho de exemplo na raiz do vault aberto e devolve o
 * caminho da nota. Usa `caminhoLivre` só por robustez (doc 15 §1.3: a pasta é nova, na
 * prática não colide); se o nome do desenho mudar por colisão, o link e o embed na nota
 * acompanham o nome real.
 */
export async function criarConteudoInicial(): Promise<string> {
  const vault = useVaultStore.getState();
  const adapter = vault.adapter;
  if (!adapter) throw new Error("Nenhum vault aberto.");

  const caminhoDesenho = await caminhoLivre(NOME_DESENHO_EXEMPLO, ".draw.md");
  const paleta = lerPaletaCanvas();
  await adapter.escreverTexto(caminhoDesenho, textoDesenhoExemplo(paleta));

  const nomeDesenhoReal = caminhoDesenho.slice(0, -".draw.md".length);
  let textoNota = textoNotaBoasVindas();
  if (nomeDesenhoReal !== NOME_DESENHO_EXEMPLO) {
    textoNota = textoNota.split(ALVO_DESENHO_EXEMPLO).join(`${nomeDesenhoReal}.draw`);
  }

  const caminhoNota = await caminhoLivre(NOME_NOTA_BOAS_VINDAS, ".md");
  await adapter.escreverTexto(caminhoNota, textoNota);

  await vault.recarregarArvore();
  await vault.reindexarArquivo(caminhoDesenho);
  await vault.reindexarArquivo(caminhoNota);

  return caminhoNota;
}
