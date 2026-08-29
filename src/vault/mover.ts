// Mover um arquivo (nota ou desenho) para outra pasta, arrastando na árvore (RF4.x). Reusa a
// mesma máquina de `renomear.ts` (flush, reescrita de links — inclusive dentro de .draw.md —,
// reindex): do ponto de vista de quem resolve wikilinks, mudar de pasta é indistinguível de
// mudar de nome. Mover uma PASTA inteira fica fora do escopo — multiplicaria isto por cada
// arquivo lá dentro; ver docs/09.

import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { aplicarMovimentacao, type ResultadoRename } from "./renomear";
import { caminhoLivre } from "./criar";
import { dividirExtensao } from "./caminhos";

function baseNome(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
function pastaDe(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export async function moverArquivo(
  pathAntigo: string,
  dirDestino: string,
): Promise<ResultadoRename> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  if (pastaDe(pathAntigo) === dirDestino) {
    return { ok: true, pathNovo: pathAntigo, notasAtualizadas: 0, linksAtualizados: 0 };
  }

  const nomeAtual = baseNome(pathAntigo);
  const pathDesejado = dirDestino ? `${dirDestino}/${nomeAtual}` : nomeAtual;

  // Destino digitado à mão (menu "Mover para...", equivalente por teclado do arrastar —
  // doc 06, piso de qualidade) pode ser uma pasta que ainda não existe. `criarPasta` é
  // recursivo e não reclama se já existir, então isto é seguro também no caminho de
  // arrastar, que só oferece pastas que já existem.
  if (dirDestino) await vault.adapter.criarPasta(dirDestino);

  // Nunca falha por já existir um arquivo com o mesmo nome ali (doc 04): resolve com o
  // mesmo padrão de numeração de criar.ts — "Nome (2)", "Nome (3)"...
  const { base, ext } = dividirExtensao(nomeAtual);
  const caminhoBase = dirDestino ? `${dirDestino}/${base}` : base;
  const pathNovo = await caminhoLivre(caminhoBase, ext);
  if (pathNovo !== pathDesejado) {
    toast(`Já existia «${dividirExtensao(nomeAtual).base}» ali; salvo como «${dividirExtensao(baseNome(pathNovo)).base}».`);
  }

  return aplicarMovimentacao(pathAntigo, pathNovo);
}
