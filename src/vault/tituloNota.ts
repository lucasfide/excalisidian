// Nome do arquivo e H1 da nota são a mesma coisa (doc 04): renomear o arquivo atualiza o H1,
// e editar o H1 (ver src/editor/extensoes/sincronizarTituloComArquivo.ts) renomeia o arquivo.
// Puro e testável — só lê/gera texto, quem chama decide quando ler e gravar em disco.

import { lerFrontmatter } from "../indice/frontmatter";
import { RE_HEADING, RE_FENCE } from "../indice/sintaxe";

/**
 * Índice (na lista de linhas) do primeiro H1 depois do frontmatter, pulando blocos de
 * código cercados — mesma regra de detecção de heading do índice (`indice/parser.ts`), pra
 * não haver duas definições divergentes do que conta como "o H1 da nota". -1 se não achar.
 */
function indiceDoH1(linhas: string[], inicioCorpo: number): number {
  let dentroDeFence = false;
  let marcadorFence = "";
  for (let i = inicioCorpo; i < linhas.length; i++) {
    const linha = linhas[i];
    const fence = RE_FENCE.exec(linha);
    if (fence) {
      if (!dentroDeFence) {
        dentroDeFence = true;
        marcadorFence = fence[2][0];
      } else if (fence[2][0] === marcadorFence) {
        dentroDeFence = false;
      }
      continue;
    }
    if (dentroDeFence) continue;
    const h = RE_HEADING.exec(linha);
    if (h && h[1].length === 1) return i;
  }
  return -1;
}

/**
 * Troca o texto do primeiro H1 da nota pelo `novoTitulo`; se não houver H1 nenhum, insere um
 * logo após o frontmatter (doc 04: toda nota tem um H1 = nome do arquivo). Devolve o texto
 * inalterado (mesma referência de conteúdo, `===`) se o H1 já é exatamente esse.
 */
export function sincronizarH1ComTitulo(texto: string, novoTitulo: string): string {
  const { linhas: inicioCorpo } = lerFrontmatter(texto);
  const linhas = texto.split("\n");
  const i = indiceDoH1(linhas, inicioCorpo);

  if (i === -1) {
    linhas.splice(inicioCorpo, 0, `# ${novoTitulo}`, "");
    return linhas.join("\n");
  }

  const linhaAtual = `# ${novoTitulo}`;
  if (linhas[i] === linhaAtual) return texto;
  linhas[i] = linhaAtual;
  return linhas.join("\n");
}

/** Extrai o texto do H1 da linha 1, só quando a linha 1 É um H1 (nível 1). Usado pelo
 * gatilho de edição — a sincronização de título↔arquivo só existe pra esse caso; um H1 em
 * outra posição da nota não é "o título" (doc 04, mesma regra de `indice/parser.ts`). */
export function h1DaPrimeiraLinha(primeiraLinha: string): string | null {
  const m = RE_HEADING.exec(primeiraLinha);
  return m && m[1].length === 1 ? m[2].trim() : null;
}
