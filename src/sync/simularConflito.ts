// src/sync/simularConflito.ts
// Fabrica um conflito de sincronização de teste, para o dono do produto conseguir abrir a
// tela de resolução de conflitos (FaixaConflitos + comparadores) sem que a sincronização em
// si já exista (task-7). Só é chamado por um comando de paleta que existe apenas em
// desenvolvimento — este módulo não sabe disso, não importa `import.meta`, e por isso é puro
// e testável sem mock de ambiente.
//
// REGRA DE SEGURANÇA (task-7-brief): o vault é o vault REAL do usuário. Este módulo NUNCA
// escreve nem registra conflito sobre um caminho que não seja um dos dois abaixo — são
// constantes, nunca vêm de entrada do usuário nem da nota aberta. "Ficar com a versão do
// outro computador" SOBRESCREVE o arquivo com a remota: se o caminho fosse de uma nota de
// verdade, o teste apagaria trabalho do usuário.
//
// SEGUNDA REGRA: "ficar com a desta máquina" (conflitosStore.resolver) não escreve nada —
// assume que a versão local já está no disco. Por isso o conteúdo gravado aqui tem de ser
// IDÊNTICO, caractere por caractere, ao `local.conteudo` de cada conflito registrado.
//
// TERCEIRA REGRA (achado 23/09): as duas constantes acima não bastam — se o usuário tiver,
// por coincidência, um arquivo de verdade com um desses dois nomes exatos, "escrever só
// nesses dois caminhos" ainda apagaria o arquivo dele. Por isso `simularConflito` nunca
// sobrescreve um caminho existente sem antes confirmar que o conteúdo já lá foi gerado por
// este mesmo comando (ver a marca em `temMarcaDeNotaTeste`/`temMarcaDeDesenhoTeste` abaixo).
// Um caminho existente sem a marca bloqueia a simulação inteira: nada é escrito em nenhum dos
// dois arquivos, nenhum conflito é registrado, e quem chamou recebe o bloqueio para avisar o
// usuário.
//
// NADA neste módulo roda no carregamento (nenhuma chamada de função no nível do módulo — só
// declarações e literais): quem chama `simularConflito`/`conflitosDeTeste` é sempre o comando
// de paleta, que só existe com `import.meta.env.DEV`. Sem uma chamada de verdade acontecendo
// ao importar o módulo, o bundler consegue provar que ele não tem efeito colateral e eliminar
// o módulo inteiro do build de produção quando o único lugar que o importa está atrás do
// `import.meta.env.DEV ? … : []` morto (confirmado com grep em dist/assets depois do build).

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { serializarDesenho, parseDesenho, type CenaDesenho } from "../canvas/formatoDesenho";
import type { Conflito } from "./tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

/** Únicos dois caminhos que este módulo toca. Nome inconfundível de propósito: ninguém cria
 * sem querer uma nota de verdade com este título. */
export const CAMINHO_NOTA_TESTE = "Excalisidian - conflito de teste.md";
export const CAMINHO_DESENHO_TESTE = "Excalisidian - conflito de teste.draw.md";

// --- marca de "gerado por este comando" ----------------------------------------------------
//
// O vault tocado é o REAL do usuário. Antes de escrever num dos dois caminhos acima, o
// comando precisa provar que quem está lá — se algo estiver lá — foi ele mesmo quem escreveu,
// nunca uma nota ou desenho de verdade que por coincidência tenha o mesmo nome. Cada tipo de
// arquivo carrega sua marca de um jeito que sobrevive à leitura e gravação do formato:
// - nota: uma linha fixa no corpo (comentário HTML, invisível na visualização).
// - desenho: uma chave no frontmatter, que `parseDesenho`/`serializarDesenho` preservam
//   byte a byte porque o frontmatter inteiro é copiado (`...fm`) e não filtrado.

/** Linha inconfundível gravada como primeira linha da nota de teste. */
export const MARCA_NOTA_TESTE = "<!-- excalisidian: conflito de teste gerado automaticamente -->";

/** Chave de frontmatter gravada em `CAMINHO_DESENHO_TESTE`. */
export const CHAVE_FRONTMATTER_MARCA_TESTE = "excalisidian-conflito-teste";

function temMarcaDeNotaTeste(conteudo: string): boolean {
  return conteudo.includes(MARCA_NOTA_TESTE);
}

function temMarcaDeDesenhoTeste(conteudo: string): boolean {
  try {
    return parseDesenho(conteudo).frontmatter[CHAVE_FRONTMATTER_MARCA_TESTE] === true;
  } catch {
    // Conteúdo que nem chega a ter frontmatter reconhecível: definitivamente não é nosso.
    return false;
  }
}

const DISPOSITIVO_REMOTO_TESTE = "Notebook de teste";
const DISPOSITIVO_LOCAL_TESTE = "Esta máquina";

// --- nota de teste ------------------------------------------------------------------------
//
// Três formas de diferença, uma de cada, para a tela exercitar as três: uma linha ALTERADA
// (o comparador pareia removido+adicionado lado a lado), uma linha que só existe na remota
// (adicionado isolado) e uma que só existe na local (removido isolado). As linhas "Âncora…"
// entre elas dão ao diff de LCS um ponto comum pra ancorar em cada lado — sem isso as três
// diferenças colapsariam num bloco só de removido+adicionado.
//
// DENTRO de funções, não em consts de nível do módulo (achado 23/09): a marca precisa entrar
// por interpolação (`${MARCA_NOTA_TESTE}`), e um template literal com expressão no nível do
// módulo deixa de ser um literal puro aos olhos do tree-shaker — ele não consegue mais provar
// que o `const` é seguro de descartar quando não usado, e o texto vaza pro build de produção
// mesmo com o comando morto. Uma função não usada é sempre removível inteira, corpo incluído,
// então a interpolação só pode morar aqui dentro.

function conteudoNotaLocalDeTeste(): string {
  return `${MARCA_NOTA_TESTE}
# Excalisidian - conflito de teste

Este é um arquivo de teste gerado pelo Excalisidian. Pode apagar quando quiser.

Âncora um.
Versão local desta linha.
Âncora dois.
Linha que existe só nesta máquina.
Âncora três.
Fim do arquivo de teste.
`;
}

function conteudoNotaRemotaDeTeste(): string {
  return `${MARCA_NOTA_TESTE}
# Excalisidian - conflito de teste

Este é um arquivo de teste gerado pelo Excalisidian. Pode apagar quando quiser.

Âncora um.
Versão remota desta linha.
Âncora dois.
Âncora três.
Linha que existe só no notebook de teste.
Fim do arquivo de teste.
`;
}

// --- desenho de teste ---------------------------------------------------------------------
//
// Local: um retângulo. Remoto: o mesmo retângulo mais um elemento — cena mínima válida nos
// dois lados, pro leitor de cena (`cenaDeConflito.ts`, que usa `parseDesenho`) provar que lê
// sem erro. Campos além de `id`/`type`/posição não importam pro parser, mas um elemento
// "de verdade" evita qualquer suposição escondida sobre forma mínima. Tudo montado DENTRO de
// funções, nunca no nível do módulo — só assim `serializarDesenho` (e o resto) não roda ao
// simplesmente importar o arquivo.

function elementoDeTeste(id: string, tipo: string, x: number, seed: number): ExcalidrawElement {
  return {
    id,
    type: tipo,
    x,
    y: 100,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce: 0,
    isDeleted: false,
    boundElements: null,
    updated: 0,
    link: null,
    locked: false,
  } as unknown as ExcalidrawElement;
}

function cenaLocalDeTeste(): CenaDesenho {
  return { elements: [elementoDeTeste("retangulo-teste-1", "rectangle", 100, 1)], appState: {} };
}

function cenaRemotaDeTeste(): CenaDesenho {
  return {
    elements: [
      elementoDeTeste("retangulo-teste-1", "rectangle", 100, 1),
      elementoDeTeste("elipse-teste-1", "ellipse", 260, 2),
    ],
    appState: {},
  };
}

function serializarCenaDeTeste(cena: CenaDesenho): string {
  return serializarDesenho({
    frontmatter: { [CHAVE_FRONTMATTER_MARCA_TESTE]: true },
    verso: "",
    textElements: new Map(),
    elementLinks: new Map(),
    embeddedFiles: new Map(),
    cena,
  });
}

function conteudoDesenhoLocalDeTeste(): string {
  return serializarCenaDeTeste(cenaLocalDeTeste());
}

function conteudoDesenhoRemotoDeTeste(): string {
  return serializarCenaDeTeste(cenaRemotaDeTeste());
}

// --- montagem dos conflitos -----------------------------------------------------------------

/** Monta os dois conflitos de teste (nota e desenho). Pura — não toca disco nem store. */
export function conflitosDeTeste(quando: Date = new Date()): [Conflito, Conflito] {
  const mtimeRemoto = quando.getTime();
  const mtimeLocal = mtimeRemoto - 60_000;

  const conflitoNota: Conflito = {
    caminho: CAMINHO_NOTA_TESTE,
    tipo: "nota",
    local: {
      origem: "local",
      conteudo: conteudoNotaLocalDeTeste(),
      mtimeMs: mtimeLocal,
      dispositivo: DISPOSITIVO_LOCAL_TESTE,
    },
    remoto: {
      origem: "remoto",
      conteudo: conteudoNotaRemotaDeTeste(),
      mtimeMs: mtimeRemoto,
      dispositivo: DISPOSITIVO_REMOTO_TESTE,
    },
  };

  const conflitoDesenho: Conflito = {
    caminho: CAMINHO_DESENHO_TESTE,
    tipo: "desenho",
    local: {
      origem: "local",
      conteudo: conteudoDesenhoLocalDeTeste(),
      mtimeMs: mtimeLocal,
      dispositivo: DISPOSITIVO_LOCAL_TESTE,
    },
    remoto: {
      origem: "remoto",
      conteudo: conteudoDesenhoRemotoDeTeste(),
      mtimeMs: mtimeRemoto,
      dispositivo: DISPOSITIVO_REMOTO_TESTE,
    },
  };

  return [conflitoNota, conflitoDesenho];
}

export interface BloqueioSimulacao {
  tipo: "nota" | "desenho";
  caminho: string;
}

export interface ResultadoSimulacao {
  /** `false` quando algum dos dois caminhos já tinha um arquivo estranho ao comando — nesse
   * caso NADA foi escrito e NENHUM conflito foi registrado, nos dois caminhos. */
  ok: boolean;
  bloqueios: BloqueioSimulacao[];
}

/**
 * Grava os dois arquivos de teste pelo `VaultAdapter` — só nos dois caminhos acima, com o
 * conteúdo LOCAL (idêntico ao `local.conteudo` do conflito registrado, doc da regra no topo
 * do arquivo) — e registra os dois conflitos.
 *
 * Antes de gravar, confere os dois caminhos: um caminho que não existe pode ser criado; um
 * caminho que existe só pode ser sobrescrito se o conteúdo já lá tiver a marca deste comando
 * (rodada anterior do próprio teste). Um caminho existente SEM a marca é um arquivo do
 * usuário (ou de outra coisa) que por coincidência tem esse nome — nesse caso o comando não
 * escreve em NENHUM dos dois caminhos nem registra conflito nenhum, e devolve o bloqueio para
 * quem chamou avisar o usuário.
 *
 * `registrar` é injetado (em vez de importar `useConflitosStore` direto) pra este módulo
 * continuar puro e testável com um adaptador falso, sem tocar o store do Zustand.
 */
export async function simularConflito(
  adaptador: VaultAdapter,
  registrar: (conflito: Conflito) => void,
  quando: Date = new Date(),
): Promise<ResultadoSimulacao> {
  const [conflitoNota, conflitoDesenho] = conflitosDeTeste(quando);

  const bloqueios: BloqueioSimulacao[] = [];

  if (await adaptador.existe(CAMINHO_NOTA_TESTE)) {
    const existente = await adaptador.lerTexto(CAMINHO_NOTA_TESTE);
    if (!temMarcaDeNotaTeste(existente)) {
      bloqueios.push({ tipo: "nota", caminho: CAMINHO_NOTA_TESTE });
    }
  }

  if (await adaptador.existe(CAMINHO_DESENHO_TESTE)) {
    const existente = await adaptador.lerTexto(CAMINHO_DESENHO_TESTE);
    if (!temMarcaDeDesenhoTeste(existente)) {
      bloqueios.push({ tipo: "desenho", caminho: CAMINHO_DESENHO_TESTE });
    }
  }

  if (bloqueios.length > 0) {
    return { ok: false, bloqueios };
  }

  await adaptador.escreverTexto(CAMINHO_NOTA_TESTE, conflitoNota.local.conteudo);
  await adaptador.escreverTexto(CAMINHO_DESENHO_TESTE, conflitoDesenho.local.conteudo);

  registrar(conflitoNota);
  registrar(conflitoDesenho);

  return { ok: true, bloqueios: [] };
}
