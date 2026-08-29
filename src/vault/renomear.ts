// Renomear um arquivo e atualizar, na mesma transação lógica, todos os wikilinks que
// apontavam para ele (doc 02 §4, doc 04 §3).
//
//   - flush de tudo que está aberto antes de qualquer coisa (doc 04 §2);
//   - lê todos os arquivos afetados, calcula todos os novos conteúdos, e só então grava;
//   - um link escrito com caminho completo continua com caminho completo;
//   - se uma gravação falhar, as anteriores não são revertidas, mas o erro diz quais
//     arquivos ficaram inconsistentes.
//
// Rename dentro de desenho (Fatia 7): um .draw.md não é markdown comum na hora de reescrever
// links — o corpo inteiro do arquivo é o bloco `%%…%%`, e regex direta sobre o texto bruto
// corrompe a seção `## Scene` quando ela está comprimida (`draw-json-lz`). Por isso a mesma
// `atualizarLinksNoTexto` é aplicada aos VALORES de `textElements`/`elementLinks` do
// `parseDesenho`, nunca ao texto do arquivo inteiro, e o resultado é regravado com
// `serializarDesenho` — a `cena` sai intacta, sem passar pelo caminho de texto.

import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { analisarMiolo } from "../indice/wikilink";
import { validarNomeArquivo, pastaDe } from "./caminhos";
import { tipoDoArquivo } from "./arvore";
import {
  parseDesenho,
  serializarDesenho,
  blockIdsDaCena,
} from "../canvas/formatoDesenho";

const RE_WIKILINK_G = /(!?)\[\[([^\][]+)\]\]/g;

function semExtensao(nomeOuCaminho: string): string {
  return nomeOuCaminho.replace(/\.draw\.md$/i, ".draw").replace(/\.md$/i, "");
}
function baseNome(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Reescreve, num texto, os wikilinks cujo alvo resolve para `pathAntigo`.
 * Devolve `[textoNovo, quantosLinks]`.
 */
export function atualizarLinksNoTexto(
  texto: string,
  resolver: (alvoEscrito: string) => string | null,
  pathAntigo: string,
  novoAlvoEscrito: (alvoEscritoAntigo: string) => string,
): [string, number] {
  let n = 0;
  const novo = texto.replace(RE_WIKILINK_G, (inteiro, bang: string, miolo: string) => {
    const { target, subpath, alias, invalido } = analisarMiolo(miolo);
    if (invalido || target === "") return inteiro;
    if (resolver(target) !== pathAntigo) return inteiro;
    n++;
    const alvo = novoAlvoEscrito(target);
    return `${bang}[[${alvo}${subpath ?? ""}${alias !== undefined ? "|" + alias : ""}]]`;
  });
  return [novo, n];
}

export interface ResultadoRename {
  ok: boolean;
  pathNovo?: string;
  motivo?: string;
  notasAtualizadas?: number;
  linksAtualizados?: number;
  inconsistentes?: string[];
}

export async function renomearArquivo(
  pathAntigo: string,
  nomeNovoBruto: string,
): Promise<ResultadoRename> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  const nomeAntigo = baseNome(pathAntigo);
  const ehDesenho = nomeAntigo.toLowerCase().endsWith(".draw.md");
  const ext = ehDesenho ? ".draw.md" : ".md";
  const nomeNovo = nomeNovoBruto.replace(/\.(draw\.)?md$/i, "").trim() + ext;

  const v = validarNomeArquivo(nomeNovo);
  if (!v.ok) return { ok: false, motivo: v.motivo };

  const dir = pastaDe(pathAntigo);
  const pathNovo = dir ? `${dir}/${nomeNovo}` : nomeNovo;
  if (pathNovo === pathAntigo) {
    return { ok: true, pathNovo, notasAtualizadas: 0, linksAtualizados: 0 };
  }

  if (await vault.adapter.existe(pathNovo)) {
    return { ok: false, motivo: `Já existe «${semExtensao(nomeNovo)}» nesta pasta.` };
  }

  return aplicarMovimentacao(pathAntigo, pathNovo);
}

/**
 * O miolo comum entre renomear (mesma pasta, nome novo) e mover (pasta nova, mesmo nome —
 * `src/vault/mover.ts`): reescreve os wikilinks de quem aponta para `pathAntigo`, move o
 * arquivo, e reindexa. Quem chama já validou nome e checou colisão em `pathNovo`.
 */
export async function aplicarMovimentacao(
  pathAntigo: string,
  pathNovo: string,
): Promise<ResultadoRename> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  // Flush de tudo antes de mexer no arquivo (doc 04 §2).
  await useDocumentosStore.getState().flushTudo();

  const novoBaseSemExt = semExtensao(baseNome(pathNovo));
  const novoPathSemExt = semExtensao(pathNovo);
  const calcularNovoAlvo = (alvoEscritoAntigo: string) =>
    alvoEscritoAntigo.includes("/") ? novoPathSemExt : novoBaseSemExt;

  const origens = [
    ...new Set((vault.links.backlinks.get(pathAntigo) ?? []).map((b) => b.origem)),
  ];

  // Fase 1: ler tudo do disco (já flushado) e calcular os novos conteúdos.
  const gravacoes: { path: string; conteudo: string }[] = [];
  let linksAtualizados = 0;
  for (const origem of origens) {
    let texto: string;
    try {
      texto = await vault.adapter.lerTexto(origem);
    } catch {
      continue;
    }
    const resolver = (alvo: string) => vault.resolver(alvo, origem);

    if (tipoDoArquivo(origem) === "drawing") {
      // `serializarDesenho` deriva `## Text Elements` do `text` vivo de cada elemento da
      // cena (não do mapa `textElements` — esse é só espelho de leitura) e usa o mapa
      // `elementLinks` como a fonte real do `## Element Links`. Editar só os mapas não
      // muda nada: é preciso reescrever `element.text`/`element.link` na cena e depois
      // recompor os dois mapas a partir dela, exatamente como o EditorDesenho faz ao salvar.
      const dados = parseDesenho(texto);
      let n = 0;
      const elementos = dados.cena.elements.map((el) => {
        const e = el as unknown as {
          id: string;
          type: string;
          text?: string;
          link?: string | null;
        };
        if (e.type === "text" && e.text) {
          const [novoTexto, nEste] = atualizarLinksNoTexto(
            e.text,
            resolver,
            pathAntigo,
            calcularNovoAlvo,
          );
          n += nEste;
          if (nEste > 0) return { ...el, text: novoTexto } as typeof el;
        } else if (e.link) {
          const [novoLink, nEste] = atualizarLinksNoTexto(
            e.link,
            resolver,
            pathAntigo,
            calcularNovoAlvo,
          );
          n += nEste;
          if (nEste > 0) return { ...el, link: novoLink } as typeof el;
        }
        return el;
      });

      if (n > 0) {
        const idPorEl = blockIdsDaCena(elementos);
        const textElements = new Map<string, string>();
        const elementLinks = new Map<string, string>();
        for (const el of elementos as unknown as {
          id: string;
          type: string;
          text?: string;
          link?: string | null;
        }[]) {
          if (el.type === "text") {
            textElements.set(idPorEl.get(el.id)!, el.text ?? "");
          } else if (el.link) {
            elementLinks.set(el.id, el.link);
          }
        }
        gravacoes.push({
          path: origem,
          conteudo: serializarDesenho({
            ...dados,
            textElements,
            elementLinks,
            cena: { ...dados.cena, elements: elementos },
          }),
        });
        linksAtualizados += n;
      }
      continue;
    }

    const [novo, n] = atualizarLinksNoTexto(
      texto,
      resolver,
      pathAntigo,
      calcularNovoAlvo,
    );
    if (n > 0) {
      gravacoes.push({ path: origem, conteudo: novo });
      linksAtualizados += n;
    }
  }

  // Fase 2: gravar. Primeiro o rename do próprio arquivo, depois as notas.
  const inconsistentes: string[] = [];
  try {
    await vault.adapter.mover(pathAntigo, pathNovo);
  } catch (e) {
    return { ok: false, motivo: `Não foi possível renomear: ${String(e)}` };
  }
  const docs = useDocumentosStore.getState();
  for (const g of gravacoes) {
    try {
      await vault.adapter.escreverTexto(g.path, g.conteudo);
      // Se a nota está aberta numa aba, recarrega o editor com o novo conteúdo.
      await docs.recarregarDoDisco(g.path);
    } catch {
      inconsistentes.push(g.path);
    }
  }

  // A aba aberta segue o arquivo.
  useWorkspaceStore.getState().renomearDocumento(pathAntigo, pathNovo);
  await vault.recarregarArvore();
  await vault.reindexar();

  const notasAtualizadas = gravacoes.length - inconsistentes.length;
  if (linksAtualizados > 0) {
    toast(`${linksAtualizados} links atualizados em ${notasAtualizadas} notas`);
  }
  if (inconsistentes.length > 0) {
    toast.error(
      `Não foi possível atualizar ${inconsistentes.length} arquivo(s): ${inconsistentes.join(", ")}`,
    );
  }

  return {
    ok: true,
    pathNovo,
    notasAtualizadas,
    linksAtualizados,
    inconsistentes: inconsistentes.length ? inconsistentes : undefined,
  };
}
