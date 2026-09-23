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
import { tipoDoArquivo } from "./arvore";
import { sincronizarH1ComTitulo } from "./tituloNota";
import type { VaultAdapter } from "./VaultAdapter";

export type ResultadoCriacao =
  | { ok: true; caminho: string }
  | { ok: false; motivo: string };

function juntar(dir: string, nome: string): string {
  return dir ? `${dir}/${nome}` : nome;
}

/** Primeiro caminho livre: `Nome.md`, `Nome (2).md`, `Nome (3).md`… Também usada por
 * renomear.ts/mover.ts (doc 04): renomear ou mover para um nome já ocupado nunca falha mais,
 * resolve com o mesmo padrão de numeração de quando se cria um arquivo novo.
 *
 * `adaptador` é opcional — por padrão usa o do vaultStore global, igual sempre foi. Existe
 * pra quem não tem (ou não quer) o store global no meio, como conflitosStore.resolver, que
 * recebe o adaptador (real ou de teste) por parâmetro. */
export async function caminhoLivre(
  base: string,
  ext: string,
  adaptador: VaultAdapter = useVaultStore.getState().adapter!,
): Promise<string> {
  const adapter = adaptador;
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
  await vault.registrarItemCriado(dir, caminho.slice(caminho.lastIndexOf("/") + 1));
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
  await vault.registrarItemCriado(dir, nome);
  return { ok: true, caminho };
}

/** Separa `pasta/Nome.draw.md` em base sem extensão (`pasta/Nome`) e extensão (`.draw.md`). */
export function separarExtensao(path: string): { base: string; ext: string } {
  const m = path.match(/(.draw.md|.md)$/i);
  if (!m) {
    const i = path.lastIndexOf(".");
    return i > path.lastIndexOf("/") ? { base: path.slice(0, i), ext: path.slice(i) } : { base: path, ext: "" };
  }
  return { base: path.slice(0, -m[1].length), ext: m[1] };
}

/** Duplica uma nota ou desenho na mesma pasta, com o próximo nome livre (`Nome (2)`, mesmo
 * padrão de numeração de criar e renomear). Na nota, o H1 acompanha o nome novo — toda nota
 * tem H1 = nome do arquivo (doc 04 §3.1); sem isto a cópia nasceria com o título da original. */
export async function duplicarArquivo(path: string): Promise<ResultadoCriacao> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  const { base, ext } = separarExtensao(path);
  const caminho = await caminhoLivre(base, ext);
  let conteudo = await vault.adapter.lerTexto(path);
  if (tipoDoArquivo(path) === "note") {
    const nome = caminho.slice(caminho.lastIndexOf("/") + 1, caminho.length - ext.length);
    conteudo = sincronizarH1ComTitulo(conteudo, nome);
  }
  await vault.adapter.escreverTexto(caminho, conteudo);
  await vault.recarregarArvore();
  await vault.reindexarArquivo(caminho);
  return { ok: true, caminho };
}
