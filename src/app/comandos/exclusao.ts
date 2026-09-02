// Comando de excluir (mover para a lixeira). Mesma separação de criacao.ts/mover.ts: o
// domínio (vault/lixeira.ts) não conhece diálogo nem toast.

import { toast } from "sonner";

import { confirmar } from "../../estado/dialogoStore";
import { useVaultStore } from "../../estado/vaultStore";
import { nomeBase } from "../../vault/caminhos";
import { excluir } from "../../vault/lixeira";

const ROTULO_TIPO: Record<
  "note" | "drawing" | "attachment" | "folder",
  { nome: string; movido: string }
> = {
  note: { nome: "Nota", movido: "movida" },
  drawing: { nome: "Desenho", movido: "movido" },
  attachment: { nome: "Anexo", movido: "movido" },
  folder: { nome: "Pasta", movido: "movida" },
};

/** Pasta vazia ou arquivo solto: sem confirmação — é reversível (tem lixeira), mesmo espírito
 * de "sem diálogo de salvar" já estabelecido no produto. Confirmação só quando o efeito é
 * desproporcional ao clique: pasta com filhos, com a contagem real (doc 04 §10, texto exato). */
export async function comandoExcluir(
  path: string,
  tipo: "note" | "drawing" | "attachment" | "folder",
): Promise<void> {
  const nome = nomeBase(path).replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");

  if (tipo === "folder") {
    const prefixo = `${path}/`;
    const n = useVaultStore
      .getState()
      .entradas.filter((e) => !e.isDir && e.path.startsWith(prefixo)).length;
    if (n > 0) {
      const ok = await confirmar({
        titulo: "Mover para a lixeira?",
        descricao: `Mover «${nome}» para a lixeira? ${n} arquivo${n === 1 ? "" : "s"} vão junto.`,
        textoConfirmar: "Mover para a lixeira",
        destrutivo: true,
      });
      if (!ok) return;
    }
  }

  const resultado = await excluir(path);
  if (!resultado.ok) {
    toast.error(resultado.motivo);
    return;
  }
  const rotulo = ROTULO_TIPO[tipo];
  toast(`${rotulo.nome} «${nome}» ${rotulo.movido} para a lixeira.`);
}
