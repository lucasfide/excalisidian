// src/sync/motor.ts
// O ciclo de sincronização (doc 17 §5, plano 09 Task 4): liga `pacote.ts` (cifra),
// `formato.ts` (serialização), `decisoes.ts` + `aplicar.ts` (o que fazer com cada mudança) e
// `ServicoSync` (o servidor) num ciclo só — baixar → aplicar → detectar → enviar → guardar.
// Recebe tudo por parâmetro (`ContextoCiclo`), como `aplicar.ts` — testável sem Tauri e sem
// zustand: o que toca store global (fila de conflitos) entra injetado.
//
// Nunca loga conteúdo, chave nem nome de arquivo — os poucos `throw`/`catch` daqui só carregam
// o código de erro do servidor (`ErroSync`) ou uma string fixa própria ("aplicar-lote").

import {
  abrir,
  abrirEnvelope,
  aadDe,
  envelopar,
  gerarChaveDoVault,
  lacrar,
  preencher,
} from "./pacote";
import {
  dividirEmLotes,
  dividirRetrato,
  hashDe,
  lerLote,
  lerRetrato,
  serializarLote,
  serializarRetrato,
  TAMANHO_MAXIMO_SINCRONIZAVEL,
  type Lote,
  type Mudanca,
  type Retrato,
} from "./formato";
import { mudancasLocais, type Mudanca as MudancaDecisao } from "./decisoes";
import { aplicarLote, type ContextoAplicar } from "./aplicar";
import type { EstadoSync } from "./estadoSync";
import type { Conflito } from "./tipos";
import type { ServicoSync } from "./ServicoSync";
import { FalhaSync, type ErroSync, type ResultadoBaixar } from "./tiposServidor";
import type { EntradaArquivo, VaultAdapter } from "../vault/VaultAdapter";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";

/** Quantas vezes tenta de novo depois de `fora-de-ordem` antes de desistir (doc 17 §5, passo
 * 3) — outro computador pode continuar enviando, mas em algum momento o ciclo tem que devolver
 * o controle (a agenda, plano 10, tenta de novo no próximo gatilho). */
const MAX_TENTATIVAS_FORA_DE_ORDEM = 5;

/** Limiar para o retrato automático (doc 17 §9, revisão pós-Task 4): "`cursor − ultimoRetrato
 * ≥ 200`". O critério de tamanho (50 MiB) foi retirado do doc — o cliente não tem como medir
 * bytes do diário desde o retrato sem baixá-lo, e medir o vault inteiro mandaria retrato em
 * todo ciclo de vaults grandes. Injetável em `ContextoCiclo` só para os testes exercitarem o
 * caminho sem mandar 200 lotes de verdade — ver `talvezEnviarRetrato`. */
export interface LimiarRetrato {
  lotes: number;
}

const LIMIAR_RETRATO_PADRAO: LimiarRetrato = { lotes: 200 };

/** Tudo que o ciclo precisa além do que já está em `EstadoSync`. `estado` é mutado em
 * memória — persistir (`salvarEstadoSync`) é responsabilidade de quem chama, como em
 * `aplicar.ts#ContextoAplicar`. */
export interface ContextoCiclo {
  adaptador: VaultAdapter;
  servico: ServicoSync;
  /** `chaveDoVault` (doc 17 §2) — nunca logada. */
  chave: Uint8Array;
  estado: EstadoSync;
  efeitos: EfeitosDeGravacao;
  /** Nome deste computador (doc 17 §7) — vai no lado "local" de um conflito e como
   * `dispositivo` dos lotes que este computador envia. */
  nomeDesteComputador: string;
  registrarConflito: (conflito: Conflito) => void;
  flushTudo: () => Promise<unknown>;
  /** Caminhos com conflito ainda aberto na tela agora — usado para "conflitos resolvidos"
   * (doc 17 §5) e para excluir da detecção de mudanças locais (passo 2). Análogo a
   * `useConflitosStore.getState().conflitos.map(c => c.caminho)`, injetado pra este módulo
   * não depender do zustand (mesmo padrão de `registrarConflito`/`flushTudo`). */
  conflitosAbertos: () => Set<string>;
  /** Relógio injetado: testes controlam `criadoEm` dos lotes que este computador monta e o
   * "agora" usado no retrato automático. Padrão: `new Date()`. */
  agora?: () => Date;
  /** Ver `LimiarRetrato`. Padrão: 200 lotes / 50 MiB. */
  limiarRetrato?: LimiarRetrato;
}

/** Código de falha do ciclo: os do servidor (`ErroSync`), mais `"aplicar-lote"` — uma mudança
 * que chegou de fora não pôde ser aplicada (disco cheio, permissão…; ver JSDoc de
 * `aplicarLote`). Nos dois casos o `cursor` não avança e o próximo ciclo tenta de novo. */
export type ErroCiclo = ErroSync | "aplicar-lote";

export type ResultadoCiclo =
  | { ok: true; foraDaSincronizacao: string[] }
  | { ok: false; erro: ErroCiclo; foraDaSincronizacao: string[] };

// --- clonagem do estado (estado por cópia — ver JSDoc de aplicarLote) ---

function clonarEstado(estado: EstadoSync): EstadoSync {
  return {
    idDoVault: estado.idDoVault,
    cursor: estado.cursor,
    bases: { ...estado.bases },
    hashesConhecidos: Object.fromEntries(
      Object.entries(estado.hashesConhecidos).map(([k, v]) => [k, { ...v }]),
    ),
    conflitosPendentes: Object.fromEntries(
      Object.entries(estado.conflitosPendentes).map(([k, v]) => [k, { ...v }]),
    ),
  };
}

function adotar(estado: EstadoSync, copia: EstadoSync): void {
  estado.cursor = copia.cursor;
  estado.bases = copia.bases;
  estado.hashesConhecidos = copia.hashesConhecidos;
  estado.conflitosPendentes = copia.conflitosPendentes;
}

function codigoDeErro(erro: unknown): ErroSync {
  if (erro instanceof FalhaSync) return erro.codigo;
  // Só em DEV: um erro que não é `FalhaSync` (ex.: o plugin-fs recusando um caminho fora do
  // escopo, como a pasta `sync-teste/` de ServicoSyncLocal) virava "servidor" em silêncio — a
  // UI mostra o erro genérico e não dá pra saber a causa real sem reproduzir manualmente. A
  // mensagem aqui só tem o caminho da pasta de teste (nunca conteúdo de nota, chave ou nome de
  // arquivo do vault do usuário).
  if (import.meta.env.DEV) {
    console.error("[sync] erro não classificado, mapeado para \"servidor\":", erro);
  }
  return "servidor";
}

// --- passo 0: conflitos resolvidos (doc 17 §5) ---

function resolverConflitosResolvidos(ctx: ContextoCiclo): void {
  const abertos = ctx.conflitosAbertos();
  for (const caminho of Object.keys(ctx.estado.conflitosPendentes)) {
    if (abertos.has(caminho)) continue;
    ctx.estado.bases[caminho] = ctx.estado.conflitosPendentes[caminho].hashRemoto;
    delete ctx.estado.conflitosPendentes[caminho];
  }
}

// --- passo 1: baixar + aplicar ---

/** Monta as mudanças equivalentes a um retrato: cada arquivo do retrato vira um "gravar" com
 * `base` = o que este computador já tinha (o retrato é um atalho para o que os lotes teriam
 * feito, não um protocolo à parte — por isso passa pela mesma `acaoParaRemota` de sempre, com
 * as mesmas regras de conflito). Um caminho que estava em `bases` mas não está mais no retrato
 * foi apagado por algum lote incorporado nele: vira "apagar". */
function mudancasDeRetrato(
  arquivos: Retrato["arquivos"],
  basesAtuais: Record<string, string>,
): Mudanca[] {
  const mudancas: Mudanca[] = [];
  const presentes = new Set(arquivos.map((a) => a.caminho));
  for (const arquivo of arquivos) {
    const base = Object.prototype.hasOwnProperty.call(basesAtuais, arquivo.caminho)
      ? basesAtuais[arquivo.caminho]
      : null;
    mudancas.push({
      tipo: "gravar",
      caminho: arquivo.caminho,
      base,
      hash: arquivo.hash,
      conteudo: arquivo.conteudo,
    });
  }
  for (const caminho of Object.keys(basesAtuais)) {
    if (!presentes.has(caminho)) {
      mudancas.push({ tipo: "apagar", caminho, base: basesAtuais[caminho] });
    }
  }
  return mudancas;
}

interface PacoteParaAplicar {
  sequencia: number;
  lote: Lote;
}

async function abrirPacotes(
  ctx: Pick<ContextoCiclo, "chave" | "agora">,
  idDoVault: string,
  basesAtuais: Record<string, string>,
  resultado: ResultadoBaixar,
): Promise<PacoteParaAplicar[]> {
  const pacotes: PacoteParaAplicar[] = [];

  if (resultado.retrato) {
    const arquivosTodos: Retrato["arquivos"] = [];
    for (let i = 0; i < resultado.retrato.partes.length; i++) {
      const dados = await abrir(ctx.chave, resultado.retrato.partes[i], aadDe(idDoVault, "retrato", i));
      const parte = await lerRetrato(dados);
      arquivosTodos.push(...parte.arquivos);
    }
    pacotes.push({
      sequencia: resultado.retrato.ateSequencia,
      lote: {
        versao: 1,
        dispositivo: "(retrato)",
        criadoEm: (ctx.agora ? ctx.agora() : new Date()).toISOString(),
        mudancas: mudancasDeRetrato(arquivosTodos, basesAtuais),
      },
    });
  }

  for (const l of resultado.lotes) {
    const dados = await abrir(ctx.chave, l.bytes, aadDe(idDoVault, "lote", l.sequencia));
    const lote = await lerLote(dados);
    pacotes.push({ sequencia: l.sequencia, lote });
  }

  return pacotes;
}

/** Aplica cada pacote (retrato + lotes, em ordem) sobre uma CÓPIA do estado, só adotando a
 * cópia (e avançando `cursor`) se `aplicarLote` não lançar — a Task 3 documenta que uma falha
 * no meio de um lote pode deixar o disco parcialmente mudado, então o lote inteiro só é dado
 * como aplicado se terminar sem lançar (ver JSDoc de `aplicarLote`). Se um pacote falhar, os
 * pacotes anteriores (já adotados) continuam valendo — só o `cursor` não passa do último que
 * deu certo. */
async function baixarEAplicar(
  ctx: ContextoCiclo,
  resultado: ResultadoBaixar,
): Promise<{ falhou: boolean }> {
  const pacotes = await abrirPacotes(ctx, ctx.estado.idDoVault, ctx.estado.bases, resultado);

  for (const pacote of pacotes) {
    if (pacote.sequencia <= ctx.estado.cursor) continue; // já aplicado — defensivo

    const copia = clonarEstado(ctx.estado);
    const ctxAplicar: ContextoAplicar = {
      adaptador: ctx.adaptador,
      efeitos: ctx.efeitos,
      estado: copia,
      nomeDesteComputador: ctx.nomeDesteComputador,
      registrarConflito: ctx.registrarConflito,
      flushTudo: ctx.flushTudo,
    };
    try {
      await aplicarLote(ctxAplicar, pacote.lote);
    } catch {
      return { falhou: true };
    }
    copia.cursor = pacote.sequencia;
    adotar(ctx.estado, copia);
  }

  return { falhou: false };
}

// --- passo 2: descobrir o que mudou aqui ---

async function hashesDoVault(
  ctx: ContextoCiclo,
  entradas: EntradaArquivo[],
): Promise<{ atual: Map<string, string>; foraDaSincronizacao: string[] }> {
  const atual = new Map<string, string>();
  const foraDaSincronizacao: string[] = [];
  const vistos = new Set<string>();

  for (const entrada of entradas) {
    if (entrada.isDir) continue;
    vistos.add(entrada.path);
    if (entrada.size > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      foraDaSincronizacao.push(entrada.path);
      continue;
    }
    const conhecido = ctx.estado.hashesConhecidos[entrada.path];
    let hash: string;
    if (conhecido && conhecido.mtimeMs === entrada.mtimeMs && conhecido.size === entrada.size) {
      hash = conhecido.hash;
    } else {
      const bytes = await ctx.adaptador.lerBinario(entrada.path);
      hash = await hashDe(bytes);
      ctx.estado.hashesConhecidos[entrada.path] = {
        mtimeMs: entrada.mtimeMs,
        size: entrada.size,
        hash,
      };
    }
    atual.set(entrada.path, hash);
  }

  // Cache de arquivo que sumiu (apagado, ou virou grande demais e saiu da lista) não serve
  // mais — sem isto, um arquivo recriado com o mesmo mtime/size (raro, mas possível em teste)
  // usaria um hash velho.
  for (const caminho of Object.keys(ctx.estado.hashesConhecidos)) {
    if (!vistos.has(caminho)) delete ctx.estado.hashesConhecidos[caminho];
  }

  return { atual, foraDaSincronizacao };
}

/** União dos caminhos com conflito aberto na TELA agora (`conflitosAbertos()`) com os que já
 * estão em `estado.conflitosPendentes` (persistido). Os dois deveriam coincidir sempre que a
 * fila foi re-registrada ao abrir o vault (doc 17 §5), mas usar só `conflitosAbertos()` deixa
 * uma janela: se um ciclo rodar ANTES da fila ser re-registrada (app acabou de abrir), um
 * conflito pendente pareceria "não mexi" e a versão local subiria por cima da remota que
 * gerou o conflito — exatamente o que `conflitosPendentes` existe para evitar (doc 17 §5,
 * comentário do próprio tipo). Defesa em profundidade: nunca é a fila sozinha que decide o
 * que fica de fora do envio. */
function conflitosParaExcluirDoEnvio(ctx: ContextoCiclo): Set<string> {
  const uniao = new Set(ctx.conflitosAbertos());
  for (const caminho of Object.keys(ctx.estado.conflitosPendentes)) uniao.add(caminho);
  return uniao;
}

async function mudancasParaEnviar(
  ctx: ContextoCiclo,
  atual: Map<string, string>,
): Promise<Mudanca[]> {
  const semConteudo = mudancasLocais(
    atual,
    ctx.estado.bases,
    conflitosParaExcluirDoEnvio(ctx),
  ) as MudancaDecisao[];

  const mudancas: Mudanca[] = [];
  for (const m of semConteudo) {
    if (m.tipo === "apagar") {
      mudancas.push(m);
      continue;
    }
    // O hash enviado (e o que vira `bases[caminho]` depois de aceito) é sempre o SHA-256
    // dos bytes efetivamente lidos AGORA para o envio — não o hash "rápido" calculado antes
    // em `hashesDoVault` (que só serviu para decidir SE este arquivo mudou). Se o usuário
    // gravar de novo entre as duas leituras, usar o hash antigo com o conteúdo novo mandaria
    // um lote mentiroso (hash não bate com o conteúdo) e, pior, gravaria em `bases` um hash
    // que não corresponde ao que está de fato no disco.
    const bytes = await ctx.adaptador.lerBinario(m.caminho);
    const hash = await hashDe(bytes);
    mudancas.push({ tipo: "gravar", caminho: m.caminho, base: m.base, hash, conteudo: bytes });
  }
  return mudancas;
}

// --- passo 3: enviar (folga de tamanho + AAD pela sequência esperada) ---

/**
 * Divide um lote-candidato (já dentro do limite de conteúdo cru de `dividirEmLotes`) em
 * partes que cabem de verdade no maior degrau da escada (`pacote.ts`). `dividirEmLotes` só
 * soma o tamanho do `conteudo` cru; a serialização (`serializarLote`) acrescenta JSON +
 * base64 antes do gzip — com arquivos já comprimidos (JPEG, PDF), o resultado pode passar de
 * 8 MiB mesmo o cru estando perto do limite de 7 MiB. Testa com `preencher` (mesma checagem
 * de tamanho que `lacrar` faz, sem gastar uma cifra AES à toa) e, se não couber, divide as
 * mudanças ao meio e tenta cada metade — recursivo. Um lote de uma mudança só que ainda assim
 * não cabe: o arquivo fica fora da sincronização (a mudança nunca é enviada, o caminho volta
 * na lista `foraDaSincronizacao`, mas o restante do envio segue).
 */
async function ajustarPorTamanho(
  lote: Lote,
  foraDaSincronizacao: string[],
): Promise<Lote[]> {
  const serializado = await serializarLote(lote);
  try {
    preencher(serializado);
    return [lote];
  } catch {
    if (lote.mudancas.length <= 1) {
      const unica = lote.mudancas[0];
      if (unica) foraDaSincronizacao.push(unica.caminho);
      return [];
    }
    const meio = Math.ceil(lote.mudancas.length / 2);
    const primeira: Lote = { ...lote, mudancas: lote.mudancas.slice(0, meio) };
    const segunda: Lote = { ...lote, mudancas: lote.mudancas.slice(meio) };
    const [a, b] = await Promise.all([
      ajustarPorTamanho(primeira, foraDaSincronizacao),
      ajustarPorTamanho(segunda, foraDaSincronizacao),
    ]);
    return [...a, ...b];
  }
}

function aplicarBasesLocais(estado: EstadoSync, mudancas: Mudanca[]): void {
  for (const mudanca of mudancas) {
    if (mudanca.tipo === "gravar") {
      estado.bases[mudanca.caminho] = mudanca.hash;
    } else {
      delete estado.bases[mudanca.caminho];
    }
  }
}

type ResultadoEnvio =
  | { status: "ok"; foraDaSincronizacao: string[] }
  | { status: "fora-de-ordem" }
  | { status: "erro"; erro: ErroSync; foraDaSincronizacao: string[] };

async function enviarMudancas(
  ctx: ContextoCiclo,
  mudancas: Mudanca[],
  agora: Date,
): Promise<ResultadoEnvio> {
  const candidatos = dividirEmLotes(mudancas, ctx.nomeDesteComputador, agora.toISOString());
  const foraDaSincronizacao: string[] = [];
  let esperoUltima = ctx.estado.cursor;

  for (const candidato of candidatos) {
    const partes = await ajustarPorTamanho(candidato, foraDaSincronizacao);
    for (const parte of partes) {
      // AAD do lote (revisão do plano 09): a sequência só é conhecida DEPOIS que o servidor
      // aceita — mas a sequência que ele atribui quando aceita é sempre `esperoUltima + 1`
      // (contrato de `enviarLote`, `ServicoSyncFake` inclusive). Por isso o AAD usa a
      // sequência ESPERADA, não uma inventada: se o servidor aceitar, é exatamente essa; se
      // recusar (`fora-de-ordem`), o lote nunca chega a ser lido com este AAD — é refeito do
      // zero na próxima tentativa, com uma nova sequência esperada.
      const aad = aadDe(ctx.estado.idDoVault, "lote", esperoUltima + 1);
      const serializado = await serializarLote(parte);
      const bytes = await lacrar(ctx.chave, serializado, aad);

      let sequencia: number;
      try {
        sequencia = await ctx.servico.enviarLote(ctx.estado.idDoVault, esperoUltima, bytes);
      } catch (erro) {
        if (erro instanceof FalhaSync && erro.codigo === "fora-de-ordem") {
          return { status: "fora-de-ordem" };
        }
        return { status: "erro", erro: codigoDeErro(erro), foraDaSincronizacao };
      }

      esperoUltima = sequencia;
      ctx.estado.cursor = sequencia;
      aplicarBasesLocais(ctx.estado, parte.mudancas);
    }
  }

  return { status: "ok", foraDaSincronizacao };
}

// --- retrato automático (best-effort) ---

/**
 * Confere se o estado local está inteiramente sincronizado — condição para o retrato
 * representar de verdade o diário na sequência `cursor` (doc 17 §9, revisão pós-Task 4):
 * nenhum conflito pendente, todo arquivo sincronizável com hash no disco IGUAL ao de `bases`,
 * e o mesmo conjunto de caminhos (nada em `bases` que sumiu do disco sem essa exclusão ainda
 * ter sido enviada, nada novo no disco que `bases` ainda não conhece). Se qualquer coisa não
 * bater, devolve `null`: mandar retrato agora gravaria no diário uma versão que não é nem a
 * remota (o disco tem uma edição/exclusão local ainda não enviada) nem a local (é só um
 * retrato do que já está sincronizado) — um computador novo receberia a versão ERRADA. Quando
 * bate, devolve os arquivos já lidos e com hash conferido (reaproveitados no retrato — não lê
 * o disco de novo).
 */
async function estadoSincronizadoParaRetrato(ctx: ContextoCiclo): Promise<Retrato["arquivos"] | null> {
  if (Object.keys(ctx.estado.conflitosPendentes).length > 0) return null;

  const entradas = (await ctx.adaptador.listar()).filter((e) => !e.isDir);
  const caminhosVistos = new Set<string>();
  const arquivos: Retrato["arquivos"] = [];

  for (const entrada of entradas) {
    if (entrada.size > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      // Nunca deveria estar em `bases` (arquivo grande nunca é sincronizado) — se estiver,
      // algo está inconsistente; mais seguro não mandar retrato do que mandar um errado.
      if (Object.prototype.hasOwnProperty.call(ctx.estado.bases, entrada.path)) return null;
      continue;
    }
    caminhosVistos.add(entrada.path);
    const baseConhecida = ctx.estado.bases[entrada.path];
    if (baseConhecida === undefined) return null; // arquivo novo, ainda não sincronizado
    const bytes = await ctx.adaptador.lerBinario(entrada.path);
    const hash = await hashDe(bytes);
    if (hash !== baseConhecida) return null; // editado localmente, ainda não enviado
    arquivos.push({ caminho: entrada.path, hash, conteudo: bytes });
  }

  for (const caminho of Object.keys(ctx.estado.bases)) {
    if (!caminhosVistos.has(caminho)) return null; // apagado localmente, ainda não enviado
  }

  return arquivos;
}

/**
 * Doc 17 §9 (revisão pós-Task 4): manda retrato depois de um ciclo que enviou com sucesso, se
 * `cursor − ultimoRetrato ≥ 200` **e** o estado local estiver inteiramente sincronizado
 * (`estadoSincronizadoParaRetrato`). `ultimoRetrato` vem do último `baixar()` deste ciclo
 * (`ResultadoBaixar.ultimoRetrato`, sempre preenchido pelo servidor — mesmo quando o cliente já
 * está na frente do retrato atual e a resposta não trouxe `retrato`) — sem isso o cliente não
 * saberia há quantos lotes foi o último retrato depois do primeiro ciclo em que o baixou.
 *
 * `limiarRetrato` é injetável só para os testes: mandar 200 lotes de verdade num teste não é
 * razoável, então os testes usam um limiar pequeno para exercitar o mesmo código.
 */
async function talvezEnviarRetrato(ctx: ContextoCiclo, ultimoRetrato: number): Promise<void> {
  const limiar = ctx.limiarRetrato ?? LIMIAR_RETRATO_PADRAO;
  if (ctx.estado.cursor - ultimoRetrato < limiar.lotes) return;

  const arquivos = await estadoSincronizadoParaRetrato(ctx);
  if (arquivos === null) return; // disco tem algo que o diário ainda não tem — tenta no próximo ciclo

  const retrato: Retrato = { versao: 1, ateSequencia: ctx.estado.cursor, arquivos };
  const partes = dividirRetrato(retrato);
  const pacotes: Uint8Array[] = [];
  for (let i = 0; i < partes.length; i++) {
    const serializado = await serializarRetrato(partes[i]);
    pacotes.push(await lacrar(ctx.chave, serializado, aadDe(ctx.estado.idDoVault, "retrato", i)));
  }

  try {
    await ctx.servico.enviarRetrato(ctx.estado.idDoVault, ctx.estado.cursor, pacotes);
  } catch {
    // Best-effort: se o servidor recusar (corrida com outro retrato mais novo, ou o cursor já
    // mudou de novo), não é motivo pra falhar o ciclo — o próximo ciclo tenta de novo se ainda
    // passar do limiar. Nunca loga o motivo (poderia vazar tamanho/contagem).
  }
}

// --- o ciclo ---

/**
 * Um ciclo de sincronização (doc 17 §5): conflitos resolvidos → baixar+aplicar → descobrir o
 * que mudou aqui → enviar (com retentativa em `fora-de-ordem`) → retrato automático. `ctx.estado`
 * é mutado em memória; persistir em disco é responsabilidade de quem chama (Task 5).
 */
export async function executarCiclo(ctx: ContextoCiclo): Promise<ResultadoCiclo> {
  resolverConflitosResolvidos(ctx);

  let foraDaSincronizacaoAcumulado: string[] = [];

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_FORA_DE_ORDEM; tentativa++) {
    let resultadoBaixar: ResultadoBaixar;
    try {
      resultadoBaixar = await ctx.servico.baixar(ctx.estado.idDoVault, ctx.estado.cursor);
    } catch (erro) {
      return { ok: false, erro: codigoDeErro(erro), foraDaSincronizacao: foraDaSincronizacaoAcumulado };
    }

    const { falhou } = await baixarEAplicar(ctx, resultadoBaixar);
    if (falhou) {
      return { ok: false, erro: "aplicar-lote", foraDaSincronizacao: foraDaSincronizacaoAcumulado };
    }

    const entradas = await ctx.adaptador.listar();
    const { atual, foraDaSincronizacao } = await hashesDoVault(ctx, entradas);
    foraDaSincronizacaoAcumulado = foraDaSincronizacao;

    const mudancas = await mudancasParaEnviar(ctx, atual);

    if (mudancas.length === 0) {
      return { ok: true, foraDaSincronizacao: foraDaSincronizacaoAcumulado };
    }

    const agora = ctx.agora ? ctx.agora() : new Date();
    const resultadoEnvio = await enviarMudancas(ctx, mudancas, agora);

    if (resultadoEnvio.status === "fora-de-ordem") {
      continue; // volta ao passo 1 (doc 17 §5, passo 3) — próxima iteração do for
    }
    if (resultadoEnvio.status === "erro") {
      return {
        ok: false,
        erro: resultadoEnvio.erro,
        foraDaSincronizacao: [...foraDaSincronizacaoAcumulado, ...resultadoEnvio.foraDaSincronizacao],
      };
    }

    foraDaSincronizacaoAcumulado = [...foraDaSincronizacaoAcumulado, ...resultadoEnvio.foraDaSincronizacao];

    await talvezEnviarRetrato(ctx, resultadoBaixar.ultimoRetrato);

    return { ok: true, foraDaSincronizacao: foraDaSincronizacaoAcumulado };
  }

  return { ok: false, erro: "fora-de-ordem", foraDaSincronizacao: foraDaSincronizacaoAcumulado };
}

// --- ligar, baixar para pasta vazia (doc 17 §7) ---

export interface ContextoIniciar {
  adaptador: VaultAdapter;
  servico: ServicoSync;
  /** `chaveDeEnvelope` deste computador (doc 17 §2) — nunca logada. */
  chaveDeEnvelope: Uint8Array;
  /** Nome do vault em claro; vai cifrado ao servidor. */
  nomeDoVault: string;
  /** Nome deste computador (doc 17 §7) — vira o `dispositivo` do(s) lote(s) com o conteúdo
   * inicial, igual qualquer outro lote que este computador manda. */
  nomeDesteComputador: string;
}

export interface ResultadoIniciar {
  estado: EstadoSync;
  /** `chaveDoVault` gerada — quem chama guarda no cofre (plano 10); o motor não guarda nada. */
  chaveDoVault: Uint8Array;
  /** Arquivos grandes demais para entrar no retrato inicial (doc 17 §4.4) — mesma lista que o
   * ciclo normal devolve, pra tela de sincronização listar desde o começo. */
  foraDaSincronizacao: string[];
}

/** Efeitos que não fazem nada — usados por `iniciarVault`, que nunca escreve no disco DESTE
 * computador (só lê, pra montar o que enviar): `enviarMudancas` não chama `ctx.efeitos` (só
 * `aplicarLote`, de quem baixa, chama), mas o tipo `ContextoCiclo` exige o campo. Exportada
 * (plano 10 Task 4) para "Baixar um vault sincronizado para uma pasta vazia": a pasta de
 * destino ainda não é o vault aberto NESTA janela (não há árvore, índice nem aba pra
 * atualizar) — os efeitos reais (`efeitosReais()`) atualizariam o vault ERRADO. */
export function efeitosNulos(): EfeitosDeGravacao {
  return {
    recarregarArvore: async () => {},
    reindexarArquivo: async () => {},
    cancelarAutosavePendente: () => {},
    recarregarDoDisco: async () => {},
    moverParaLixeira: async () => ({ ok: true }),
  };
}

/**
 * "Ligar neste vault" quando este computador é o primeiro a sincronizar (doc 17 §7): gera a
 * `chaveDoVault`, cria o vault no servidor com o nome cifrado e o envelope, e envia o que já
 * existe no vault.
 *
 * **Nota sobre "retrato inicial" (divergência do doc 17 §7 resolvida aqui):** o texto diz
 * "envia um retrato inicial", mas um retrato só é aceito com `ateSequencia` MAIOR que o do
 * retrato atual (doc 17 §9) — e o diário de um vault recém-criado começa em zero, então um
 * retrato com `ateSequencia = 0` nunca passaria dessa checagem (`ServicoSyncFake` recusa com
 * `fora-de-ordem`, e é o comportamento certo: um retrato em zero não adianta nada sobre "o
 * diário está vazio", que é exatamente o que baixar(id, 0) já responde sem retrato nenhum).
 * Na prática, "conteúdo inicial" só pode entrar no diário como o(s) primeiro(s) LOTE(S) — é o
 * que este código faz, reaproveitando o mesmo mecanismo de envio do ciclo normal (folga de
 * tamanho, AAD pela sequência esperada). Ver relatório da Task 4.
 */
export async function iniciarVault(ctx: ContextoIniciar): Promise<ResultadoIniciar> {
  const idDoVault = globalThis.crypto.randomUUID();
  const chaveDoVault = await gerarChaveDoVault();
  const envelope = await envelopar(ctx.chaveDeEnvelope, chaveDoVault, idDoVault);
  const nomeCifrado = await lacrar(
    chaveDoVault,
    new TextEncoder().encode(ctx.nomeDoVault),
    aadDe(idDoVault, "nome"),
  );
  await ctx.servico.criarVault(idDoVault, nomeCifrado, envelope);

  const estado: EstadoSync = {
    idDoVault,
    cursor: 0,
    bases: {},
    hashesConhecidos: {},
    conflitosPendentes: {},
  };

  const entradas = (await ctx.adaptador.listar()).filter((e) => !e.isDir);
  const mudancas: Mudanca[] = [];
  const foraDaSincronizacao: string[] = [];
  for (const entrada of entradas) {
    if (entrada.size > TAMANHO_MAXIMO_SINCRONIZAVEL) {
      foraDaSincronizacao.push(entrada.path);
      continue;
    }
    const bytes = await ctx.adaptador.lerBinario(entrada.path);
    const hash = await hashDe(bytes);
    mudancas.push({ tipo: "gravar", caminho: entrada.path, base: null, hash, conteudo: bytes });
    estado.hashesConhecidos[entrada.path] = { mtimeMs: entrada.mtimeMs, size: entrada.size, hash };
  }

  if (mudancas.length > 0) {
    const ctxEnvio: ContextoCiclo = {
      adaptador: ctx.adaptador,
      servico: ctx.servico,
      chave: chaveDoVault,
      estado,
      efeitos: efeitosNulos(),
      nomeDesteComputador: ctx.nomeDesteComputador,
      registrarConflito: () => {},
      flushTudo: async () => {},
      conflitosAbertos: () => new Set(),
    };
    const resultado = await enviarMudancas(ctxEnvio, mudancas, new Date());
    if (resultado.status === "erro") {
      throw new FalhaSync(resultado.erro);
    }
    if (resultado.status === "ok") {
      foraDaSincronizacao.push(...resultado.foraDaSincronizacao);
    }
    // "fora-de-ordem" não deveria acontecer aqui: ninguém mais conhece este `idDoVault` ainda
    // (foi gerado agora mesmo, e o servidor não tinha registro dele até `criarVault` acima).
  }

  return { estado, chaveDoVault, foraDaSincronizacao };
}

export interface ContextoBaixarVault {
  /** Pasta vazia (doc 17 §7) — nada é lido daqui, só escrito. */
  adaptador: VaultAdapter;
  servico: ServicoSync;
  chaveDeEnvelope: Uint8Array;
  idDoVault: string;
  /** Envelope deste vault, de `ServicoSync.listarVaults()`. */
  envelope: Uint8Array;
  efeitos: EfeitosDeGravacao;
  nomeDesteComputador: string;
  registrarConflito: (conflito: Conflito) => void;
  flushTudo: () => Promise<unknown>;
  agora?: () => Date;
}

/** "Baixar um vault para este computador" (doc 17 §7), numa pasta vazia: abre o envelope com
 * a `chaveDeEnvelope`, baixa o retrato mais recente e os lotes seguintes, e grava tudo pelo
 * mesmo caminho de `aplicarLote` (mesmos efeitos visíveis — árvore, índice — só que aqui não
 * há nada pra conflitar, a pasta está vazia). */
export async function baixarVault(ctx: ContextoBaixarVault): Promise<EstadoSync> {
  const chaveDoVault = await abrirEnvelope(ctx.chaveDeEnvelope, ctx.envelope, ctx.idDoVault);

  const estado: EstadoSync = {
    idDoVault: ctx.idDoVault,
    cursor: 0,
    bases: {},
    hashesConhecidos: {},
    conflitosPendentes: {},
  };

  const resultado = await ctx.servico.baixar(ctx.idDoVault, 0);

  const ctxCiclo: ContextoCiclo = {
    adaptador: ctx.adaptador,
    servico: ctx.servico,
    chave: chaveDoVault,
    estado,
    efeitos: ctx.efeitos,
    nomeDesteComputador: ctx.nomeDesteComputador,
    registrarConflito: ctx.registrarConflito,
    flushTudo: ctx.flushTudo,
    conflitosAbertos: () => new Set(),
    agora: ctx.agora,
  };

  const { falhou } = await baixarEAplicar(ctxCiclo, resultado);
  if (falhou) {
    throw new Error("falha ao aplicar o retrato/lotes ao baixar o vault");
  }

  return estado;
}
