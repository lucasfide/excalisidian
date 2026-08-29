// Comando de mover arquivo (arrastar na árvore). Mesma separação de `criacao.ts`: o domínio
// (`vault/mover.ts`) não conhece toast.

import { toast } from "sonner";

import { moverArquivo } from "../../vault/mover";

export async function comandoMoverArquivo(
  path: string,
  dirDestino: string,
): Promise<void> {
  const r = await moverArquivo(path, dirDestino);
  if (!r.ok) toast.error(r.motivo ?? "Não foi possível mover.");
}
