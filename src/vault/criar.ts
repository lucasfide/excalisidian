// Criação de notas, desenhos e pastas a partir da interface (RF1.x / RF4.x). Compartilhado
// pela barra de ações da sidebar, pelo menu de contexto da árvore e pela aba vazia.

import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { sanitizarNome } from "./caminhos";
import { desenhoVazio } from "../canvas/formatoDesenho";

/** Pasta onde criar, dado o contexto atual: pasta selecionada > pasta da aba ativa > raiz. */
export function pastaAlvo(): string {
  const { pastaSelecionada } = useVaultStore.getState();
  if (pastaSelecionada) return pastaSelecionada;
  const ativo = useWorkspaceStore.getState().caminhoAtivo;
  if (ativo && ativo.includes("/")) return ativo.slice(0, ativo.lastIndexOf("/"));
  return "";
}

function juntar(dir: string, nome: string): string {
  return dir ? `${dir}/${nome}` : nome;
}

async function caminhoLivre(base: string, ext: string): Promise<string> {
  const adapter = useVaultStore.getState().adapter!;
  let candidato = `${base}${ext}`;
  let n = 2;
  while (await adapter.existe(candidato)) {
    candidato = `${base} (${n})${ext}`;
    n += 1;
  }
  return candidato;
}

async function pedirNome(rotulo: string, sugestao: string): Promise<string | null> {
  const bruto = window.prompt(rotulo, sugestao);
  if (bruto == null) return null;
  const nome = sanitizarNome(bruto.replace(/\.(draw\.)?md$/i, "").trim());
  if (!nome) {
    toast.error("Nome inválido.");
    return null;
  }
  return nome;
}

async function finalizar(destino: string, conteudo: string): Promise<void> {
  const vault = useVaultStore.getState();
  const ws = useWorkspaceStore.getState();
  const dir = destino.includes("/") ? destino.slice(0, destino.lastIndexOf("/")) : "";
  if (dir) await vault.adapter!.criarPasta(dir);
  await vault.adapter!.escreverTexto(destino, conteudo);
  await vault.recarregarArvore();
  await vault.reindexarArquivo(destino);
  ws.abrirDocumento(destino);
}

export async function criarNota(dir = pastaAlvo()): Promise<void> {
  if (!useVaultStore.getState().adapter) return;
  const nome = await pedirNome("Nome da nova nota:", "");
  if (!nome) return;
  const destino = await caminhoLivre(juntar(dir, nome), ".md");
  await finalizar(destino, `# ${nome}\n\n`);
}

export async function criarDesenho(dir = pastaAlvo()): Promise<void> {
  if (!useVaultStore.getState().adapter) return;
  const nome = await pedirNome("Nome do novo desenho:", "");
  if (!nome) return;
  const destino = await caminhoLivre(juntar(dir, nome), ".draw.md");
  await finalizar(destino, desenhoVazio());
}

export async function criarPasta(dir = pastaAlvo()): Promise<void> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return;
  const nome = await pedirNome("Nome da nova pasta:", "");
  if (!nome) return;
  const destino = juntar(dir, nome);
  if (await vault.adapter.existe(destino)) {
    toast.error(`Já existe «${nome}» aqui.`);
    return;
  }
  await vault.adapter.criarPasta(destino);
  await vault.recarregarArvore();
  vault.selecionarPasta(destino);
}
