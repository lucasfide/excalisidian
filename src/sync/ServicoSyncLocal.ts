// src/sync/ServicoSyncLocal.ts
// Servidor de teste local, só em desenvolvimento (doc 17 §10, task-6): mesmo contrato
// ServicoSync/mesmo comportamento de ServicoSyncFake.ts (via NucleoServidorSync), mas os
// pacotes vão para arquivos numa pasta de teste do app data (`sync-teste/`), com escrita
// atômica (tmp + rename) — para duas janelas do app (dois processos JS) enxergarem o mesmo
// "servidor". Nunca cacheia o estado do vault entre chamadas: cada operação relê do disco,
// senão a janela B nunca veria o que a janela A acabou de gravar.
//
// Trava entre processos (revisão da task-6): duas janelas podem chamar `enviarLote` "ao mesmo
// tempo" — cada uma lê a sequência do disco, decide que bate com o que ela espera e escreve.
// Uma trava só em memória do processo (como o `estadoPromise` abaixo, que só cacheia a pasta e
// o núcleo) não ajudaria: são processos JS DIFERENTES. Sem uma trava real no disco, a segunda
// gravação pode sobrescrever a primeira e um lote some em silêncio — exatamente o tipo de
// perda que a sincronização promete nunca ter (doc 17 §1).
// Por isso toda operação (`listarVaults`, `criarVault`, `baixar`, `enviarLote`,
// `enviarRetrato`, `apagarVault`) roda dentro de `comTrava`, que serializa TODAS as janelas
// através de um `mkdir` exclusivo compartilhado na própria pasta `sync-teste/` (ver
// `adquirirTrava`/`liberarTrava` abaixo).
//
// Só é usado atrás de `import.meta.env.DEV` (src/sync/servicoSyncAtual.ts e
// src/estado/contaStore.ts) — eliminado do build de produção pelo mesmo mecanismo de
// simularConflito.ts/PaletaComandos.tsx (confira com grep em dist/ depois de `npm run build`).

import { exists, mkdir, readDir, readTextFile, writeTextFile, rename, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

import type { ServicoSync } from "./ServicoSync";
import type { ResultadoBaixar, VaultSincronizado } from "./tiposServidor";
import { paraBase64, deBase64 } from "./base64";
import { NucleoServidorSync, type ArmazenamentoServidorSync, type VaultGuardado } from "./nucleoServidorSync";

/** Nome da pasta de teste dentro do app data — nunca existe fora de DEV. `appDataDir()` já
 * resolve para `${dataDir}/${identifier}` (doc do `@tauri-apps/api/path`, o identificador vem
 * de `src-tauri/tauri.conf.json`) — não acrescente o identificador de novo aqui (revisão da
 * task-6: a versão anterior duplicava `com.excalisidian.app` no caminho). */
const PASTA_SYNC_TESTE = "sync-teste";

/** Só as operações de arquivo que o armazenamento e a trava precisam — injetável para o teste
 * usar um disco falso em memória, sem tocar o filesystem de verdade nem depender do runtime
 * Tauri. */
export interface AdaptadorFsSync {
  existeDiretorio(caminho: string): Promise<boolean>;
  /** Cria a pasta (e as pastas-pai que faltarem) sem falhar se já existir — para a pasta
   * comum `sync-teste/`. */
  criarDiretorio(caminho: string): Promise<void>;
  /** Cria SÓ esta pasta (o pai já precisa existir) e FALHA se ela já existir — é a exclusão
   * mútua da trava: só uma chamada, entre todos os processos, consegue criar a mesma pasta.
   * `mkdir` sem `recursive` no plugin-fs (`std::fs::DirBuilder` sem `.recursive(true)` do lado
   * Rust) tem exatamente esse comportamento. */
  criarDiretorioExclusivo(caminho: string): Promise<void>;
  /** Nomes de arquivo (não o caminho inteiro) dentro da pasta. */
  listarArquivos(caminho: string): Promise<string[]>;
  lerTexto(caminho: string): Promise<string>;
  escreverTexto(caminho: string, conteudo: string): Promise<void>;
  renomear(de: string, para: string): Promise<void>;
  apagar(caminho: string): Promise<void>;
  /** Remove uma pasta e tudo dentro dela — usada para liberar a trava (e para descartar uma
   * trava velha, de um processo que morreu segurando). */
  apagarDiretorio(caminho: string): Promise<void>;
}

const adaptadorFsReal: AdaptadorFsSync = {
  existeDiretorio: (caminho) => exists(caminho),
  criarDiretorio: async (caminho) => {
    await mkdir(caminho, { recursive: true });
  },
  criarDiretorioExclusivo: async (caminho) => {
    await mkdir(caminho); // sem recursive: falha (AlreadyExists) se a pasta já existir.
  },
  listarArquivos: async (caminho) => {
    const entradas = await readDir(caminho);
    return entradas.filter((e) => e.isFile).map((e) => e.name);
  },
  lerTexto: (caminho) => readTextFile(caminho),
  escreverTexto: (caminho, conteudo) => writeTextFile(caminho, conteudo),
  renomear: (de, para) => rename(de, para),
  apagar: (caminho) => remove(caminho),
  apagarDiretorio: (caminho) => remove(caminho, { recursive: true }),
};

// --- trava entre processos (mutex via mkdir exclusivo) --------------------------------------
//
// A pasta `sync-teste/.trava` só existe enquanto alguém segura a operação. Criar essa pasta é
// atômico no sistema de arquivos (o SO garante que só UMA chamada de `mkdir` sem recursive
// ganha, mesmo vindo de processos diferentes) — é a exclusão mútua entre janelas. Quem cria
// grava um timestamp dentro dela (`desde.txt`); quem encontra a trava ocupada usa esse
// timestamp para diferenciar "outra janela está mesmo no meio de uma operação" (espera e tenta
// de novo) de "a janela que segurava morreu" (trava mais velha que TRAVA_VELHA_MS: remove e
// tenta de novo).

const NOME_PASTA_TRAVA = ".trava";
const ARQUIVO_TRAVA_DESDE = "desde.txt";
/** Trava mais velha que isso é de um processo que morreu segurando — removida para não
 * travar as outras janelas para sempre. Bem acima do tempo de qualquer operação real (um
 * ciclo de sincronização lê/escreve poucos arquivos pequenos). */
export const TRAVA_VELHA_MS = 10_000;
/** Espera curta entre tentativas de adquirir a trava — não é o tempo de uma operação, é só o
 * intervalo de "tentar de novo". */
const ESPERA_ENTRE_TENTATIVAS_MS = 25;

function caminhoTrava(pasta: string): string {
  return `${pasta}/${NOME_PASTA_TRAVA}`;
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Se a trava em `pasta` estiver mais velha que TRAVA_VELHA_MS, remove — melhor esforço: se a
 * remoção falhar (outro processo já removeu ou já recriou), ignora e deixa o próximo laço de
 * `adquirirTrava` decidir de novo. Sem timestamp legível (marcador ainda não escrito por quem
 * acabou de criar a pasta, ou já sumiu) não mexe: não dá para provar que está velha. */
async function removerTravaVelhaSePuder(fs: AdaptadorFsSync, pasta: string): Promise<void> {
  const trava = caminhoTrava(pasta);
  let desde: number;
  try {
    desde = Number(await fs.lerTexto(`${trava}/${ARQUIVO_TRAVA_DESDE}`));
  } catch {
    return;
  }
  if (!Number.isFinite(desde) || Date.now() - desde < TRAVA_VELHA_MS) return;
  try {
    await fs.apagarDiretorio(trava);
  } catch {
    // já foi removida (por outro processo, ou recriada) — sem problema.
  }
}

/** Bloqueia até conseguir criar a pasta da trava (com exclusão mútua entre TODOS os processos
 * que apontam para a mesma `pasta`). Nunca desiste: se a trava está genuinamente ocupada, só
 * espera; se está velha, limpa e tenta nesse mesmo laço. */
async function adquirirTrava(fs: AdaptadorFsSync, pasta: string): Promise<void> {
  const trava = caminhoTrava(pasta);
  for (;;) {
    try {
      await fs.criarDiretorioExclusivo(trava);
      try {
        // Melhor esforço: mesmo que esta escrita falhe, a trava continua sendo nossa — só a
        // checagem de "trava velha" de outra janela fica mais conservadora (sem timestamp,
        // ninguém a considera velha) até liberarmos.
        await fs.escreverTexto(`${trava}/${ARQUIVO_TRAVA_DESDE}`, String(Date.now()));
      } catch {
        // segue mesmo assim
      }
      return;
    } catch {
      await removerTravaVelhaSePuder(fs, pasta);
      await dormir(ESPERA_ENTRE_TENTATIVAS_MS);
    }
  }
}

async function liberarTrava(fs: AdaptadorFsSync, pasta: string): Promise<void> {
  try {
    await fs.apagarDiretorio(caminhoTrava(pasta));
  } catch {
    // já foi removida (ex.: outra janela a considerou velha enquanto terminávamos) — a
    // operação protegida já rodou; não é um erro para quem chamou.
  }
}

// --- serialização de um vault num arquivo (bytes em base64, igual ao mapeamento HTTP) ------

interface VaultArquivo {
  id: string;
  nomeCifrado: string;
  envelope: string;
  lotes: { sequencia: number; bytes: string }[];
  retrato?: { ateSequencia: number; partes: string[] };
}

function serializarVault(vault: VaultGuardado): string {
  const arquivo: VaultArquivo = {
    id: vault.id,
    nomeCifrado: paraBase64(vault.nomeCifrado),
    envelope: paraBase64(vault.envelope),
    lotes: vault.lotes.map((l) => ({ sequencia: l.sequencia, bytes: paraBase64(l.bytes) })),
    retrato: vault.retrato
      ? { ateSequencia: vault.retrato.ateSequencia, partes: vault.retrato.partes.map(paraBase64) }
      : undefined,
  };
  return JSON.stringify(arquivo, null, 2);
}

function desserializarVault(texto: string): VaultGuardado {
  const arquivo = JSON.parse(texto) as VaultArquivo;
  return {
    id: arquivo.id,
    nomeCifrado: deBase64(arquivo.nomeCifrado),
    envelope: deBase64(arquivo.envelope),
    lotes: arquivo.lotes.map((l) => ({ sequencia: l.sequencia, bytes: deBase64(l.bytes) })),
    retrato: arquivo.retrato
      ? { ateSequencia: arquivo.retrato.ateSequencia, partes: arquivo.retrato.partes.map(deBase64) }
      : undefined,
  };
}

/** Armazenamento do núcleo em arquivos: um `<id>.json` por vault dentro de `pasta`. Nunca
 * mantém cache — cada `buscar`/`listar` relê do disco, para uma segunda janela (segundo
 * processo JS) sempre ver o que a primeira acabou de gravar. Gravação por tmp + rename
 * (atômica no mesmo volume, igual escritaAtomica.ts, mas para uma pasta fora do vault).
 *
 * Não faz a exclusão mútua entre processos sozinho — quem chama (`ServicoSyncLocal.comTrava`)
 * já segura a trava antes de qualquer `buscar`/`gravar` daqui, então um `buscar` seguido de um
 * `gravar` (o padrão de leitura-e-escrita de `enviarLote`/`enviarRetrato`) nunca intercala com
 * a mesma sequência de outra janela. */
class ArmazenamentoArquivoSync implements ArmazenamentoServidorSync {
  constructor(
    private readonly pasta: string,
    private readonly fs: AdaptadorFsSync,
  ) {}

  private caminho(id: string): string {
    return `${this.pasta}/${id}.json`;
  }

  async buscar(id: string): Promise<VaultGuardado | null> {
    try {
      const texto = await this.fs.lerTexto(this.caminho(id));
      return desserializarVault(texto);
    } catch {
      // arquivo não existe (ou não é um vault válido): mesmo resultado de "não encontrado".
      return null;
    }
  }

  async listar(): Promise<VaultGuardado[]> {
    const nomes = await this.fs.listarArquivos(this.pasta);
    const vaults: VaultGuardado[] = [];
    for (const nome of nomes) {
      // Arquivos temporários (`<id>.json.tmp-<id>`, a meio de uma gravação) e a pasta da
      // trava não terminam em ".json" — ficam de fora sem precisar de uma regra à parte.
      if (!nome.endsWith(".json")) continue;
      try {
        const texto = await this.fs.lerTexto(`${this.pasta}/${nome}`);
        vaults.push(desserializarVault(texto));
      } catch {
        // arquivo sumiu entre a listagem e a leitura: ignora — o próximo ciclo relê do zero.
      }
    }
    return vaults;
  }

  async gravar(vault: VaultGuardado): Promise<void> {
    const caminhoFinal = this.caminho(vault.id);
    const caminhoTmp = `${caminhoFinal}.tmp-${vault.id}`;
    await this.fs.escreverTexto(caminhoTmp, serializarVault(vault));
    await this.fs.renomear(caminhoTmp, caminhoFinal);
  }

  async apagar(id: string): Promise<void> {
    try {
      await this.fs.apagar(this.caminho(id));
    } catch {
      // igual ServicoSyncFake: apagar um id desconhecido não é erro.
    }
  }
}

async function pastaPadrao(): Promise<string> {
  const base = await appDataDir(); // já resolve `${dataDir}/${identifier}` — não acrescente o identificador de novo.
  return join(base, PASTA_SYNC_TESTE);
}

interface EstadoResolvido {
  pasta: string;
  nucleo: NucleoServidorSync;
}

export class ServicoSyncLocal implements ServicoSync {
  private estadoPromise: Promise<EstadoResolvido> | null = null;

  constructor(
    private readonly fs: AdaptadorFsSync = adaptadorFsReal,
    /** Pasta explícita — só para teste. Sem ela, resolve `sync-teste/` dentro do app data na
     * primeira chamada (e guarda o resultado: o caminho não muda, só o conteúdo). */
    private readonly pastaExplicita?: string,
  ) {}

  private async estado(): Promise<EstadoResolvido> {
    if (!this.estadoPromise) {
      this.estadoPromise = (async () => {
        const pasta = this.pastaExplicita ?? (await pastaPadrao());
        if (!(await this.fs.existeDiretorio(pasta))) await this.fs.criarDiretorio(pasta);
        return { pasta, nucleo: new NucleoServidorSync(new ArmazenamentoArquivoSync(pasta, this.fs)) };
      })();
    }
    return this.estadoPromise;
  }

  /** Roda `fn` com a trava entre processos (ver o bloco de comentários no topo do arquivo)
   * segurada do início ao fim — adquire antes de qualquer leitura, libera em `finally` mesmo
   * se `fn` lançar (ex.: `fora-de-ordem`), para nunca deixar a trava presa por um erro. */
  private async comTrava<T>(fn: (nucleo: NucleoServidorSync) => Promise<T>): Promise<T> {
    const { pasta, nucleo } = await this.estado();
    await adquirirTrava(this.fs, pasta);
    try {
      return await fn(nucleo);
    } finally {
      await liberarTrava(this.fs, pasta);
    }
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    return this.comTrava((n) => n.listarVaults());
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    return this.comTrava((n) => n.criarVault(id, nomeCifrado, envelope));
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    return this.comTrava((n) => n.baixar(id, aposSequencia));
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    return this.comTrava((n) => n.enviarLote(id, esperoUltima, bytes));
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    return this.comTrava((n) => n.enviarRetrato(id, ateSequencia, partes));
  }

  async apagarVault(id: string): Promise<void> {
    return this.comTrava((n) => n.apagarVault(id));
  }
}
