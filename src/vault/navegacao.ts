// Navegação por wikilink: abre a nota alvo numa aba, ou cria uma nova quando o link não
// resolve (doc 02 §4, doc 04 §4).

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { confirmar } from "../estado/dialogoStore";
import { sanitizarNome, pastaDe } from "./caminhos";

/** Onde criar a nota de um link não resolvido. Sem vaultPrefs ainda: `sameFolder`. */
function caminhoDestino(alvo: string, origem: string): string {
  if (alvo.includes("/")) {
    return alvo.toLowerCase().endsWith(".md") ? alvo : alvo + ".md";
  }
  const dir = pastaDe(origem);
  const nome = alvo.toLowerCase().endsWith(".md") ? alvo : alvo + ".md";
  return dir ? `${dir}/${nome}` : nome;
}

export async function abrirOuCriarPorLink(
  alvo: string,
  origem: string,
): Promise<void> {
  const vault = useVaultStore.getState();
  const ws = useWorkspaceStore.getState();
  if (!vault.adapter || alvo === "") return;

  const existente = vault.resolver(alvo, origem);
  if (existente) {
    ws.abrirDocumento(existente);
    return;
  }

  // Link não resolvido: cria a nota.
  const bruto = caminhoDestino(alvo, origem);
  const dir = pastaDe(bruto);
  const nomeArquivo = bruto.slice(bruto.lastIndexOf("/") + 1);
  const nomeBase = nomeArquivo.replace(/\.md$/i, "");

  const seguro = sanitizarNome(nomeBase);
  if (!seguro) return;

  if (seguro !== nomeBase) {
    // Sanitização visível (doc 02 §9): o usuário vê o nome final antes de gravar.
    const ok = await confirmar({
      titulo: "Nome com caracteres inválidos",
      descricao: `O nome «${nomeBase}» tem caracteres que o Windows não aceita. Criar como «${seguro}»?`,
      textoConfirmar: "Criar assim",
    });
    if (!ok) return;
  }

  const destino = dir ? `${dir}/${seguro}.md` : `${seguro}.md`;

  if (await vault.adapter.existe(destino)) {
    ws.abrirDocumento(destino);
    return;
  }

  if (dir) await vault.adapter.criarPasta(dir);
  await vault.adapter.escreverTexto(destino, "");
  await vault.recarregarArvore();
  await vault.reindexarArquivo(destino);
  ws.abrirDocumento(destino);
}
