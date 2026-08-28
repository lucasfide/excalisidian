// Navegação por wikilink: abre a nota alvo, ou cria uma nova quando o link não resolve
// (doc 02 §4, doc 04 §4). Sem abas ainda (Fatia 4), então tudo abre na aba única.

import { useVaultStore } from "../estado/vaultStore";
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
  const st = useVaultStore.getState();
  if (!st.adapter || alvo === "") return;

  const existente = st.resolver(alvo, origem);
  if (existente) {
    await st.abrirArquivo(existente);
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
    // doc 04 §4: mostra o nome final antes de gravar. Sem diálogo próprio ainda.
    const ok = window.confirm(
      `O nome «${nomeBase}» tem caracteres inválidos. Criar como «${seguro}»?`,
    );
    if (!ok) return;
  }

  const destino = dir ? `${dir}/${seguro}.md` : `${seguro}.md`;

  if (await st.adapter.existe(destino)) {
    await st.abrirArquivo(destino);
    return;
  }

  if (dir) await st.adapter.criarPasta(dir);
  await st.adapter.escreverTexto(destino, "");
  await st.recarregarArvore();
  await st.reindexarArquivo(destino);
  await st.abrirArquivo(destino);
}
