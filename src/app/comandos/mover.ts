// Comando de mover arquivo (arrastar na árvore, ou o diálogo abaixo). Mesma separação de
// `criacao.ts`: o domínio (`vault/mover.ts`) não conhece toast nem diálogo.

import { toast } from "sonner";

import { moverArquivo } from "../../vault/mover";
import { pastaDe } from "../../vault/caminhos";
import { pedirTexto } from "../../estado/dialogoStore";

export async function comandoMoverArquivo(
  path: string,
  dirDestino: string,
): Promise<void> {
  const r = await moverArquivo(path, dirDestino);
  if (!r.ok) toast.error(r.motivo ?? "Não foi possível mover.");
}

/**
 * Equivalente por teclado/menu de arrastar um arquivo na árvore (doc 06, piso de
 * qualidade: "toda ação de arraste tem equivalente por teclado ou menu"). Pede o caminho
 * da pasta de destino por texto — a pasta é criada se ainda não existir (mesma regra do
 * arrastar, ver `vault/mover.ts`).
 */
export async function comandoMoverPara(path: string): Promise<void> {
  const atual = pastaDe(path);
  const destino = await pedirTexto({
    titulo: "Mover para",
    descricao: "Caminho da pasta de destino, dentro do vault. Vazio move para a raiz.",
    rotulo: "Pasta de destino",
    valorInicial: atual,
    textoConfirmar: "Mover",
  });
  if (destino === null) return;
  await comandoMoverArquivo(path, destino.trim());
}
