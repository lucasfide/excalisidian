// Comandos de criação: a orquestração entre a interface e o domínio. Pede o nome pelo
// diálogo do app, chama `vault/criar.ts`, e abre o resultado numa aba.
//
// É aqui que UI e domínio se encontram — `vault/criar.ts` não conhece diálogo nenhum, e a
// sidebar não conhece filesystem.

import { toast } from "sonner";

import { pedirTexto } from "../../estado/dialogoStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { validarNomeArquivo } from "../../vault/caminhos";
import {
  criarNota,
  criarDesenho,
  criarPasta,
  type ResultadoCriacao,
} from "../../vault/criar";
import { renomearArquivo, SEM_TITULO } from "../../vault/renomear";

/** "raiz" quando vazio, para o texto do diálogo não ficar com um buraco. */
function nomeDaPasta(dir: string): string {
  return dir === "" ? "raiz do vault" : dir;
}

async function pedirNome(
  titulo: string,
  dir: string,
  valorInicial = "",
): Promise<string | null> {
  return pedirTexto({
    titulo,
    descricao: `Em ${nomeDaPasta(dir)}.`,
    rotulo: "Nome",
    valorInicial,
    textoConfirmar: "Criar",
    validar: (v) => validarNomeArquivo(v).motivo ?? null,
  });
}

async function concluir(r: ResultadoCriacao, abrir: boolean): Promise<void> {
  if (!r.ok) {
    toast.error(r.motivo);
    return;
  }
  if (abrir) {
    useWorkspaceStore.getState().abrirDocumento(r.caminho);
  } else {
    // Pasta criada: sem "selecionar" (não existe mais esse conceito) — só confirma.
    // O usuário expande a árvore pra ver, ou arrasta um arquivo pra dentro dela.
    toast(`Pasta «${r.caminho}» criada.`);
  }
}

// Nota e desenho abrem direto, sem pedir nome (doc 04 §3.1: toda nota tem H1, e "Sem título"
// já é o valor padrão de um nome vazio). Digitar o título é editar a primeira linha — que
// já renomeia o arquivo sozinha (sincronizarTituloComArquivo.ts) — ou renomear pela árvore
// depois. Pasta continua pedindo nome: não tem H1 pra herdar um nome dela mais tarde.
export async function comandoNovaNota(dir = ""): Promise<void> {
  await concluir(await criarNota(SEM_TITULO, dir), true);
}

export async function comandoNovoDesenho(dir = ""): Promise<void> {
  await concluir(await criarDesenho(SEM_TITULO, dir), true);
}

export async function comandoNovaPasta(dir = ""): Promise<void> {
  const nome = await pedirNome("Nova pasta", dir);
  if (!nome) return;
  await concluir(await criarPasta(nome, dir), false);
}

export async function comandoRenomear(path: string): Promise<void> {
  const atual = path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/\.(draw\.)?md$/i, "");
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  const novo = await pedirTexto({
    titulo: "Renomear",
    descricao: `Em ${nomeDaPasta(dir)}. Os links que apontam para este arquivo são atualizados.`,
    rotulo: "Novo nome",
    valorInicial: atual,
    textoConfirmar: "Renomear",
    validar: (v) => validarNomeArquivo(v).motivo ?? null,
  });
  if (!novo || novo === atual) return;

  const r = await renomearArquivo(path, novo);
  if (!r.ok) toast.error(r.motivo ?? "Não foi possível renomear.");
}
