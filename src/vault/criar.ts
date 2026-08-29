// Criação de notas, desenhos e pastas no vault. Camada de domínio: recebe o nome e a pasta
// já resolvidos e não fala com a interface — quem pede o nome, mostra erro e abre a aba é
// `app/comandos/criacao.ts`. Isso mantém estas funções testáveis sem DOM.
//
// Sem "pasta selecionada": os comandos da sidebar sempre criam na raiz (`dir = ""`);
// organizar é por clique direito numa pasta ("Nova nota aqui", em ArvoreArquivos) ou
// arrastando o arquivo depois (src/vault/mover.ts).

import { useVaultStore } from "../estado/vaultStore";
import { sanitizarNome } from "./caminhos";
import { desenhoVazio } from "../canvas/formatoDesenho";

export type ResultadoCriacao =
  | { ok: true; caminho: string }
  | { ok: false; motivo: string };

function juntar(dir: string, nome: string): string {
  return dir ? `${dir}/${nome}` : nome;
}

/** Primeiro caminho livre: `Nome.md`, `Nome (2).md`, `Nome (3).md`… */
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

async function criarArquivo(
  nomeBruto: string,
  dir: string,
  ext: string,
  conteudo: (nome: string) => string,
): Promise<ResultadoCriacao> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  const nome = sanitizarNome(nomeBruto.replace(/\.(draw\.)?md$/i, "").trim());
  if (!nome) return { ok: false, motivo: "Nome inválido." };

  const caminho = await caminhoLivre(juntar(dir, nome), ext);
  if (dir) await vault.adapter.criarPasta(dir);
  await vault.adapter.escreverTexto(caminho, conteudo(nome));
  await vault.recarregarArvore();
  await vault.reindexarArquivo(caminho);
  return { ok: true, caminho };
}

export function criarNota(nome: string, dir: string): Promise<ResultadoCriacao> {
  return criarArquivo(nome, dir, ".md", (n) => `# ${n}\n\n`);
}

export function criarDesenho(
  nome: string,
  dir: string,
): Promise<ResultadoCriacao> {
  return criarArquivo(nome, dir, ".draw.md", () => desenhoVazio());
}

export async function criarPasta(
  nomeBruto: string,
  dir: string,
): Promise<ResultadoCriacao> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  const nome = sanitizarNome(nomeBruto.trim());
  if (!nome) return { ok: false, motivo: "Nome inválido." };

  const caminho = juntar(dir, nome);
  if (await vault.adapter.existe(caminho)) {
    return { ok: false, motivo: `Já existe «${nome}» aqui.` };
  }
  await vault.adapter.criarPasta(caminho);
  await vault.recarregarArvore();
  return { ok: true, caminho };
}
