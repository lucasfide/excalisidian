// src/sync/aplicar.ts
// Aplica um lote que chegou de outro computador no vault deste computador (doc 17 §6, plano
// 09 Task 3). Pura em relação ao zustand: tudo que toca store global (registrar conflito na
// fila da tela, gravar as abas pendentes antes de ler hashes) entra por `ContextoAplicar`,
// injetado — o motor (Task 4) monta o contexto real; os testes montam um falso.
//
// A tabela do doc 17 §6 já está decidida em `decisoes.ts#acaoParaRemota` — este módulo só
// executa cada ação, mais o "manter as duas" automático de binário em conflito (doc 17 §6,
// último parágrafo) e os dois cuidados da revisão do plano 08: `so-atualizar-base` vindo de
// `apagar` REMOVE o caminho de `bases` (os dois lados apagaram; não há hash nenhum pra
// guardar), e `mover-para-lixeira` de um arquivo que já não existe aqui só limpa `bases`, sem
// tocar o disco.

import { hashDe, type Lote, type Mudanca } from "./formato";
import { acaoParaRemota, ehBinario, type AcaoRemota } from "./decisoes";
import type { EstadoSync } from "./estadoSync";
import type { Conflito } from "./tipos";
import { nomeDaCopiaDeConflito } from "./nomeDeConflito";
import type { EntradaArquivo, VaultAdapter } from "../vault/VaultAdapter";
import { gravarComEfeitos, type EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import { caminhoLivre } from "../vault/criar";
import { dividirExtensao, nomeBase, pastaDe } from "../vault/caminhos";

type MudancaGravar = Extract<Mudanca, { tipo: "gravar" }>;

/** Tudo que `aplicarLote` precisa além do adaptador do vault. `estado` é mutado em memória —
 * quem chama é responsável por persistir (`salvarEstadoSync`) depois. */
export interface ContextoAplicar {
  adaptador: VaultAdapter;
  efeitos: EfeitosDeGravacao;
  estado: EstadoSync;
  /** Nome deste computador (doc 17 §7) — vai no lado "local" de um conflito de texto. */
  nomeDesteComputador: string;
  /** `conflitosStore.registrar`, injetado pra este módulo não depender do zustand. */
  registrarConflito: (conflito: Conflito) => void;
  /** `documentosStore.flushTudo` — grava as abas com edição pendente ANTES de ler hashes
   * locais, pra o ciclo ver o que está na tela (doc 17 §5). */
  flushTudo: () => Promise<unknown>;
}

/** Mesma regra de `listar()`/`VaultAdapterMemoria` (RF1.6, doc 17 §4.4): pastas que começam
 * com ponto não sincronizam. Confere só os segmentos de PASTA — o nome do arquivo em si pode
 * começar com ponto sem que isso importe aqui (não é o caso da lixeira/config, mas a regra é a
 * mesma dos outros lugares do código). */
function emPastaPonto(caminho: string): boolean {
  const segmentos = caminho.split("/");
  return segmentos.slice(0, -1).some((s) => s.startsWith("."));
}

function ehDesenho(caminho: string): boolean {
  return /\.draw\.md$/i.test(caminho);
}

/** Hash do arquivo no disco (`null` se não existe), lido como bytes — pra bater com o `hashDe`
 * do outro lado, que sempre trabalha em bytes (doc 17 §4.1, texto vai em UTF-8 antes de
 * cifrar). Usa `hashesConhecidos` para não reler arquivo que não mudou (mtime + tamanho
 * batendo com a última leitura); atualiza o cache quando relê. */
async function hashLocalDe(
  adaptador: VaultAdapter,
  estado: EstadoSync,
  entradas: Map<string, EntradaArquivo>,
  caminho: string,
): Promise<string | null> {
  const entrada = entradas.get(caminho);
  if (!entrada) {
    delete estado.hashesConhecidos[caminho];
    return null;
  }
  const conhecido = estado.hashesConhecidos[caminho];
  if (conhecido && conhecido.mtimeMs === entrada.mtimeMs && conhecido.size === entrada.size) {
    return conhecido.hash;
  }
  const bytes = await adaptador.lerBinario(caminho);
  const hash = await hashDe(bytes);
  estado.hashesConhecidos[caminho] = { mtimeMs: entrada.mtimeMs, size: entrada.size, hash };
  return hash;
}

/** Grava a versão remota no caminho original (ações "gravar" e "recriar" da tabela — as duas
 * fazem a mesma coisa no disco, só a razão de chegar aqui muda). Cria a pasta ANTES de
 * gravar: `escritaAtomica.ts` não cria pastas sozinha, então um computador que não tem `a/b`
 * ainda e recebe `a/b/c.md` falharia sem isto (cuidado da revisão do plano 08). */
async function gravarRemoto(ctx: ContextoAplicar, mudanca: MudancaGravar): Promise<void> {
  await ctx.adaptador.criarPasta(pastaDe(mudanca.caminho));
  const conteudo: string | Uint8Array = ehBinario(mudanca.caminho)
    ? mudanca.conteudo
    : new TextDecoder().decode(mudanca.conteudo);
  await gravarComEfeitos(ctx.adaptador, ctx.efeitos, mudanca.caminho, conteudo);
  ctx.estado.bases[mudanca.caminho] = mudanca.hash;
  // O mtime/tamanho antigos no cache não valem mais depois de gravar por cima — força reler
  // (barato: um SHA-256 por arquivo tocado, não o vault inteiro) na próxima vez que precisar.
  delete ctx.estado.hashesConhecidos[mudanca.caminho];
}

/** Conflito (doc 17 §6): texto vai para a fila da tela e para `conflitosPendentes`, sem
 * gravar nada — o usuário decide. Binário não tem comparador: "manter as duas" automático,
 * gravando a remota ao lado com o nome de conflito e deixando a local como está;
 * `bases[original] = hashRemoto` faz o próximo ciclo reenviar a local por cima (é a regra). */
async function tratarConflito(
  ctx: ContextoAplicar,
  lote: Lote,
  mudanca: MudancaGravar,
  quando: Date,
  entradas: Map<string, EntradaArquivo>,
): Promise<void> {
  if (ehBinario(mudanca.caminho)) {
    const candidato = nomeDaCopiaDeConflito(mudanca.caminho, lote.dispositivo, quando);
    const pasta = pastaDe(candidato);
    const { base, ext } = dividirExtensao(nomeBase(candidato));
    const baseComPasta = pasta ? `${pasta}/${base}` : base;
    // `caminhoLivre` numera em vez de sobrescrever — nunca apaga outra cópia de conflito que
    // já esteja lá (ex.: dois conflitos do mesmo arquivo no mesmo dia, mesmo dispositivo).
    const caminhoFinal = await caminhoLivre(baseComPasta, ext, ctx.adaptador);
    await ctx.adaptador.criarPasta(pastaDe(caminhoFinal));
    await gravarComEfeitos(ctx.adaptador, ctx.efeitos, caminhoFinal, mudanca.conteudo);
    ctx.estado.bases[mudanca.caminho] = mudanca.hash;
    return;
  }

  const remotoTexto = new TextDecoder().decode(mudanca.conteudo);
  let localTexto = "";
  try {
    localTexto = await ctx.adaptador.lerTexto(mudanca.caminho);
  } catch {
    // Não deveria acontecer (conflito só existe quando a versão local mexeu, ou seja, existe),
    // mas não é motivo pra `aplicarLote` inteiro lançar — segue com "" em vez de travar o ciclo.
  }
  const entrada = entradas.get(mudanca.caminho);

  const conflito: Conflito = {
    caminho: mudanca.caminho,
    tipo: ehDesenho(mudanca.caminho) ? "desenho" : "nota",
    local: {
      origem: "local",
      conteudo: localTexto,
      mtimeMs: entrada?.mtimeMs ?? 0,
      dispositivo: ctx.nomeDesteComputador,
    },
    remoto: {
      origem: "remoto",
      conteudo: remotoTexto,
      mtimeMs: quando.getTime(),
      dispositivo: lote.dispositivo,
    },
  };

  ctx.estado.conflitosPendentes[mudanca.caminho] = {
    hashRemoto: mudanca.hash,
    conteudo: remotoTexto,
    dispositivo: lote.dispositivo,
    criadoEm: lote.criadoEm,
  };
  ctx.registrarConflito(conflito);
}

async function aplicarAcao(
  ctx: ContextoAplicar,
  lote: Lote,
  mudanca: Mudanca,
  acao: AcaoRemota,
  local: string | null,
  quando: Date,
  entradas: Map<string, EntradaArquivo>,
): Promise<void> {
  switch (acao) {
    case "gravar":
    case "recriar":
      // Só chega aqui vindo de uma mudança "gravar" (a tabela nunca produz estas ações para
      // "apagar" — ver decisoes.ts#acaoParaRemota).
      await gravarRemoto(ctx, mudanca as MudancaGravar);
      return;

    case "so-atualizar-base":
      if (mudanca.tipo === "apagar") {
        // Cuidado da revisão do plano 08: os dois lados apagaram — não há hash pra guardar,
        // só limpa o registro.
        delete ctx.estado.bases[mudanca.caminho];
      } else {
        ctx.estado.bases[mudanca.caminho] = mudanca.hash;
      }
      return;

    case "mover-para-lixeira":
      // Cuidado da revisão do plano 08: pode chegar para um arquivo que já não existe aqui
      // (local === null) — nesse caso não toca o disco, só limpa `bases`.
      if (local !== null) {
        await ctx.efeitos.moverParaLixeira(mudanca.caminho);
      }
      delete ctx.estado.bases[mudanca.caminho];
      delete ctx.estado.hashesConhecidos[mudanca.caminho];
      return;

    case "manter-local-e-reenviar":
      // Não toca o disco, não muda `bases` — a versão local sobe de novo no próximo ciclo.
      return;

    case "conflito":
      await tratarConflito(ctx, lote, mudanca as MudancaGravar, quando, entradas);
      return;
  }
}

/**
 * Aplica todas as mudanças de um lote no vault deste computador (doc 17 §6). Para cada
 * mudança: lê o hash local (via cache de `hashesConhecidos`), decide a ação com
 * `acaoParaRemota` e executa. Ignora caminhos em pasta ponto (doc 17 §4.4) sem tocar em nada.
 *
 * `estado` é mutado em memória (`bases`, `hashesConhecidos`, `conflitosPendentes`); persistir
 * é responsabilidade de quem chama.
 */
export async function aplicarLote(ctx: ContextoAplicar, lote: Lote): Promise<void> {
  // O ciclo precisa ver o que está na tela, não só o que já foi salvo (doc 17 §5) — sem isto,
  // uma aba com edição pendente pareceria "não mexi" e a versão remota sobrescreveria sem
  // conflito o que o usuário está digitando agora.
  await ctx.flushTudo();

  const entradas = new Map((await ctx.adaptador.listar()).map((e) => [e.path, e] as const));
  const quando = new Date(lote.criadoEm);

  for (const mudanca of lote.mudancas) {
    if (emPastaPonto(mudanca.caminho)) continue;

    const local = await hashLocalDe(ctx.adaptador, ctx.estado, entradas, mudanca.caminho);
    const base = Object.prototype.hasOwnProperty.call(ctx.estado.bases, mudanca.caminho)
      ? ctx.estado.bases[mudanca.caminho]
      : null;
    const apagadoAquiDesdeBase = local === null && base !== null;
    const acao = acaoParaRemota(mudanca, local, base, apagadoAquiDesdeBase);

    await aplicarAcao(ctx, lote, mudanca, acao, local, quando, entradas);
  }
}
