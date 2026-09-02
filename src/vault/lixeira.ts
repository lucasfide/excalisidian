// Lixeira do vault: `.trash/` + `.trash/.index.json` (doc 02 §7, doc 04 §9, doc 09 ADR-7).
// RF7.1–7.4 (P0) — RF7.5 (desfazer no toast) e RF7.6 (lixeira do sistema) ficam pra depois.
//
// Mesmo padrão de mover.ts/renomear.ts: função de domínio, sem falar com diálogo/toast (isso
// fica no comando, app/comandos/exclusao.ts) — mas fala com os stores diretamente, porque
// aplicarMovimentacao (renomear.ts) já faz isso e é o precedente estabelecido.
//
// Diferente de mover/renomear: excluir NÃO reescreve links. Doc 02 §7 não menciona isso — só
// mover o arquivo, indexar, fechar aba. Um link que apontava pro que foi excluído vira
// não-resolvido; é o comportamento implícito da spec, e bate com "não mexe em texto que o
// usuário não pediu pra mexer" (doc 04 §11.8).

import { useVaultStore } from "../estado/vaultStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { caminhoLivre } from "./criar";
import { dividirExtensao, nomeBase, pastaDe } from "./caminhos";
import { tipoDoArquivo, type TipoNo } from "./arvore";

const CAMINHO_INDICE = ".trash/.index.json";
const PASTA_LIXEIRA = ".trash";

export interface ItemLixeira {
  /** Nome do arquivo/pasta dentro de `.trash/`. */
  trashName: string;
  /** Caminho de origem, pra restaurar. `null` = sem registro no índice ("origem
   * desconhecida", doc 04 §9 — o usuário mexeu em `.trash/` por fora do app). */
  originalPath: string | null;
  deletedAt: string | null;
  kind: TipoNo;
}

export type ResultadoExclusao = { ok: true } | { ok: false; motivo: string };
export type ResultadoRestaurar =
  | { ok: true; pathFinal: string }
  | { ok: false; motivo: string };

function kindDe(nome: string, isDir: boolean): TipoNo {
  return isDir ? "folder" : tipoDoArquivo(nome);
}

async function lerIndice(): Promise<ItemLixeira[]> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return [];
  try {
    const bruto = await adapter.lerTexto(CAMINHO_INDICE);
    const itens = JSON.parse(bruto);
    return Array.isArray(itens) ? itens : [];
  } catch {
    return []; // ausente ou corrompido — nunca lança, a lixeira segue existindo pelo disco
  }
}

async function gravarIndice(itens: ItemLixeira[]): Promise<void> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return;
  await adapter.criarPasta(PASTA_LIXEIRA);
  await adapter.escreverTexto(CAMINHO_INDICE, JSON.stringify(itens, null, 2));
}

/** Lista o que está em `.trash/` de verdade (não o índice) — o índice só enriquece com o
 * caminho original (doc 04 §9). Item sem entrada no índice ainda aparece, com
 * `originalPath: null`. */
export async function listarLixeira(): Promise<ItemLixeira[]> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return [];
  const [bruto, indice] = await Promise.all([
    adapter.listarPasta(PASTA_LIXEIRA),
    lerIndice(),
  ]);
  const porNome = new Map(indice.map((i) => [i.trashName, i]));
  return bruto
    .filter((e) => e.nome !== ".index.json")
    .map((e) => {
      const registrado = porNome.get(e.nome);
      if (registrado) return registrado;
      return {
        trashName: e.nome,
        originalPath: null,
        deletedAt: null,
        kind: kindDe(e.nome, e.isDir),
      };
    });
}

export async function excluir(path: string): Promise<ResultadoExclusao> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  await useDocumentosStore.getState().flushTudo();
  useWorkspaceStore.getState().fecharAbasDoCaminho(path);

  const nome = nomeBase(path);
  const isDir = vault.entradas.find((e) => e.path === path)?.isDir ?? false;
  const { base, ext } = dividirExtensao(nome);

  await vault.adapter.criarPasta(PASTA_LIXEIRA);
  const trashPath = await caminhoLivre(`${PASTA_LIXEIRA}/${base}`, ext);
  await vault.adapter.mover(path, trashPath);

  const itens = await lerIndice();
  itens.push({
    trashName: nomeBase(trashPath),
    originalPath: path,
    deletedAt: new Date().toISOString(),
    kind: kindDe(nome, isDir),
  });
  await gravarIndice(itens);

  await vault.recarregarArvore();
  await vault.reindexar();
  return { ok: true };
}

export async function restaurar(item: ItemLixeira): Promise<ResultadoRestaurar> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { ok: false, motivo: "Nenhum vault aberto." };

  // Origem desconhecida (doc 04 §9): só pode voltar pra raiz, com o próprio nome de dentro
  // de .trash/.
  const destinoDesejado = item.originalPath ?? item.trashName;
  const dir = pastaDe(destinoDesejado);
  if (dir) await vault.adapter.criarPasta(dir);

  let destino = destinoDesejado;
  if (await vault.adapter.existe(destino)) {
    const { base, ext } = dividirExtensao(nomeBase(destinoDesejado));
    const baseComSufixo = dir ? `${dir}/${base} (restaurado)` : `${base} (restaurado)`;
    destino = await caminhoLivre(baseComSufixo, ext);
  }

  await vault.adapter.mover(`${PASTA_LIXEIRA}/${item.trashName}`, destino);

  const itens = (await lerIndice()).filter((i) => i.trashName !== item.trashName);
  await gravarIndice(itens);

  await vault.recarregarArvore();
  await vault.reindexar();
  return { ok: true, pathFinal: destino };
}

/** Única ação irreversível do produto (doc 04 §9). Apaga tudo que está em `.trash/` de
 * verdade — inclusive itens sem registro no índice. */
export async function esvaziarLixeira(): Promise<{ removidos: number }> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return { removidos: 0 };

  const itens = await listarLixeira();
  for (const item of itens) {
    await vault.adapter.remover(`${PASTA_LIXEIRA}/${item.trashName}`);
  }
  await gravarIndice([]);

  await vault.recarregarArvore();
  await vault.reindexar();
  return { removidos: itens.length };
}
