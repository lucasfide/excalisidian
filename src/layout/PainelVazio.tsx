// Aba nova em branco (RF3.1). Oferece criar uma nota; o quick switcher e o menu de contexto
// completo da árvore entram nas fatias seguintes.

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { sanitizarNome } from "../vault/caminhos";
import { toast } from "sonner";

async function criarNota() {
  const vault = useVaultStore.getState();
  const ws = useWorkspaceStore.getState();
  if (!vault.adapter) return;

  const bruto = window.prompt("Nome da nova nota:", "");
  if (!bruto) return;
  const nome = sanitizarNome(bruto.replace(/\.md$/i, ""));
  if (!nome) {
    toast.error("Nome inválido.");
    return;
  }
  const destino = `${nome}.md`;
  if (await vault.adapter.existe(destino)) {
    toast.error(`Já existe «${nome}» na raiz do vault.`);
    ws.abrirDocumento(destino);
    return;
  }
  await vault.adapter.escreverTexto(destino, `# ${nome}\n\n`);
  await vault.recarregarArvore();
  await vault.reindexarArquivo(destino);
  ws.abrirDocumento(destino);
}

export default function PainelVazio() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-papel">
      <span className="meta text-tinta-suave">aba sem título</span>
      <button
        onClick={() => void criarNota()}
        className="rounded-controle bg-musgo px-4 py-2 text-corpo text-superficie"
      >
        Nova nota
      </button>
      <span className="text-pequeno text-tinta-media">
        ou escolha uma nota na barra lateral
      </span>
    </div>
  );
}
