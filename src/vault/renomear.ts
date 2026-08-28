// Renomear um arquivo e atualizar, na mesma transação lógica, todos os wikilinks que
// apontavam para ele (doc 02 §4, doc 04 §3).
//
//   - lê todos os arquivos afetados, calcula todos os novos conteúdos, e só então grava;
//   - um link escrito com caminho completo continua com caminho completo — só a parte que
//     precisa mudar muda; o app não normaliza o que o usuário digitou;
//   - se uma gravação falhar, as anteriores não são revertidas, mas o erro diz quais
//     arquivos ficaram inconsistentes.
//
// Rename dentro de desenho (o JSON da cena) entra na Fatia 6/7.

import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { analisarMiolo } from "../indice/wikilink";
import { validarNomeArquivo, pastaDe } from "./caminhos";

const RE_WIKILINK_G = /(!?)\[\[([^\][]+)\]\]/g;

function semExtensao(nomeOuCaminho: string): string {
  return nomeOuCaminho.replace(/\.draw\.md$/i, ".draw").replace(/\.md$/i, "");
}
function baseNome(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Reescreve, num texto, os wikilinks cujo alvo resolve para `pathAntigo`. `resolver` recebe
 * o alvo escrito e devolve o caminho real (ou null). `novoAlvoEscrito` recebe o alvo escrito
 * antigo e devolve o novo — preservando ou não o estilo de caminho.
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
  const st = useVaultStore.getState();
  if (!st.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  const nomeAntigo = baseNome(pathAntigo);
  const ehDesenho = nomeAntigo.toLowerCase().endsWith(".draw.md");
  const ext = ehDesenho ? ".draw.md" : ".md";
  const nomeNovo = nomeNovoBruto.replace(/\.(draw\.)?md$/i, "").trim() + ext;

  const v = validarNomeArquivo(nomeNovo);
  if (!v.ok) return { ok: false, motivo: v.motivo };

  const dir = pastaDe(pathAntigo);
  const pathNovo = dir ? `${dir}/${nomeNovo}` : nomeNovo;
  if (pathNovo === pathAntigo) return { ok: true, pathNovo, notasAtualizadas: 0, linksAtualizados: 0 };

  if (await st.adapter.existe(pathNovo)) {
    return {
      ok: false,
      motivo: `Já existe «${semExtensao(nomeNovo)}» nesta pasta.`,
    };
  }

  // Flush do arquivo aberto antes de qualquer operação de rename (doc 04 §2).
  if (st.caminhoAberto && st.conteudoEditor !== st.conteudoDisco) {
    await st.salvar();
  }

  const novoBaseSemExt = semExtensao(nomeNovo);
  const novoPathSemExt = semExtensao(pathNovo);
  const calcularNovoAlvo = (alvoEscritoAntigo: string) =>
    alvoEscritoAntigo.includes("/") ? novoPathSemExt : novoBaseSemExt;

  // Quem aponta para o arquivo (backlinks já resolvidos pelo índice).
  const origens = [
    ...new Set((st.links.backlinks.get(pathAntigo) ?? []).map((b) => b.origem)),
  ];

  // Fase 1: ler tudo e calcular os novos conteúdos.
  const gravacoes: { path: string; conteudo: string }[] = [];
  let linksAtualizados = 0;
  for (const origem of origens) {
    let texto: string;
    try {
      texto =
        origem === st.caminhoAberto ? st.conteudoDisco : await st.adapter.lerTexto(origem);
    } catch {
      continue;
    }
    const [novo, n] = atualizarLinksNoTexto(
      texto,
      (alvo) => st.resolver(alvo, origem),
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
    await st.adapter.mover(pathAntigo, pathNovo);
  } catch (e) {
    return { ok: false, motivo: `Não foi possível renomear: ${String(e)}` };
  }
  for (const g of gravacoes) {
    try {
      await st.adapter.escreverTexto(g.path, g.conteudo);
    } catch {
      inconsistentes.push(g.path);
    }
  }

  // Aba aberta segue o arquivo.
  if (st.caminhoAberto === pathAntigo) {
    await st.abrirArquivo(pathNovo);
  }
  await st.recarregarArvore();
  await st.reindexar();

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
