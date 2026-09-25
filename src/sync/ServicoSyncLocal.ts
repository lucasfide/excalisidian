// src/sync/ServicoSyncLocal.ts
// Servidor de teste local, só em desenvolvimento (doc 17 §10, task-6): mesmo contrato
// ServicoSync/mesmo comportamento de ServicoSyncFake.ts (via NucleoServidorSync), mas os
// pacotes vão para arquivos numa pasta de teste do app data (`sync-teste/`), com escrita
// atômica (tmp + rename) — para duas janelas do app (dois processos JS) enxergarem o mesmo
// "servidor". Nunca cacheia o estado do vault entre chamadas: cada operação relê do disco,
// senão a janela B nunca veria o que a janela A acabou de gravar.
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

/** Nome da pasta de teste dentro do app data — nunca existe fora de DEV. */
const PASTA_SYNC_TESTE = "sync-teste";
/** Mesma pasta do identificador do app que agenteStore.ts usa para a pasta do agente
 * (`app.config().identifier`, `src-tauri/tauri.conf.json`). Literal repetido de propósito —
 * ver o comentário de EVENTO_PREFS_MUDOU em contaStore.ts sobre por que os literais
 * repetidos aqui não viram uma constante importada entre módulos que não precisam se conhecer. */
const PASTA_IDENTIFICADOR = "com.excalisidian.app";

/** Só as operações de arquivo que o armazenamento precisa — injetável para o teste usar um
 * disco falso em memória, sem tocar o filesystem de verdade nem depender do runtime Tauri. */
export interface AdaptadorFsSync {
  existeDiretorio(caminho: string): Promise<boolean>;
  criarDiretorio(caminho: string): Promise<void>;
  /** Nomes de arquivo (não o caminho inteiro) dentro da pasta. */
  listarArquivos(caminho: string): Promise<string[]>;
  lerTexto(caminho: string): Promise<string>;
  escreverTexto(caminho: string, conteudo: string): Promise<void>;
  renomear(de: string, para: string): Promise<void>;
  apagar(caminho: string): Promise<void>;
}

const adaptadorFsReal: AdaptadorFsSync = {
  existeDiretorio: (caminho) => exists(caminho),
  criarDiretorio: async (caminho) => {
    await mkdir(caminho, { recursive: true });
  },
  listarArquivos: async (caminho) => {
    const entradas = await readDir(caminho);
    return entradas.filter((e) => e.isFile).map((e) => e.name);
  },
  lerTexto: (caminho) => readTextFile(caminho),
  escreverTexto: (caminho, conteudo) => writeTextFile(caminho, conteudo),
  renomear: (de, para) => rename(de, para),
  apagar: (caminho) => remove(caminho),
};

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
 * (atômica no mesmo volume, igual escritaAtomica.ts, mas para uma pasta fora do vault). */
class ArmazenamentoArquivoSync implements ArmazenamentoServidorSync {
  constructor(
    private readonly pasta: string,
    private readonly fs: AdaptadorFsSync,
  ) {}

  private caminho(id: string): string {
    return `${this.pasta}/${id}.json`;
  }

  private async garantirPasta(): Promise<void> {
    if (!(await this.fs.existeDiretorio(this.pasta))) {
      await this.fs.criarDiretorio(this.pasta);
    }
  }

  async buscar(id: string): Promise<VaultGuardado | null> {
    await this.garantirPasta();
    try {
      const texto = await this.fs.lerTexto(this.caminho(id));
      return desserializarVault(texto);
    } catch {
      // arquivo não existe (ou não é um vault válido): mesmo resultado de "não encontrado".
      return null;
    }
  }

  async listar(): Promise<VaultGuardado[]> {
    await this.garantirPasta();
    const nomes = await this.fs.listarArquivos(this.pasta);
    const vaults: VaultGuardado[] = [];
    for (const nome of nomes) {
      // Arquivos temporários (`<id>.json.tmp-<id>`, a meio de uma gravação de outra janela)
      // não terminam em ".json" — ficam de fora sem precisar de uma regra à parte.
      if (!nome.endsWith(".json")) continue;
      try {
        const texto = await this.fs.lerTexto(`${this.pasta}/${nome}`);
        vaults.push(desserializarVault(texto));
      } catch {
        // arquivo sumiu ou está a meio de ser escrito por outra janela entre a listagem e a
        // leitura: ignora — o próximo ciclo relê a pasta do zero.
      }
    }
    return vaults;
  }

  async gravar(vault: VaultGuardado): Promise<void> {
    await this.garantirPasta();
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
  const base = await appDataDir();
  return join(base, PASTA_IDENTIFICADOR, PASTA_SYNC_TESTE);
}

export class ServicoSyncLocal implements ServicoSync {
  private nucleoPromise: Promise<NucleoServidorSync> | null = null;

  constructor(
    private readonly fs: AdaptadorFsSync = adaptadorFsReal,
    /** Pasta explícita — só para teste. Sem ela, resolve `sync-teste/` dentro do app data na
     * primeira chamada (e guarda o resultado: o caminho não muda, só o conteúdo). */
    private readonly pastaExplicita?: string,
  ) {}

  private async nucleo(): Promise<NucleoServidorSync> {
    if (!this.nucleoPromise) {
      this.nucleoPromise = (async () => {
        const pasta = this.pastaExplicita ?? (await pastaPadrao());
        return new NucleoServidorSync(new ArmazenamentoArquivoSync(pasta, this.fs));
      })();
    }
    return this.nucleoPromise;
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    return (await this.nucleo()).listarVaults();
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    return (await this.nucleo()).criarVault(id, nomeCifrado, envelope);
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    return (await this.nucleo()).baixar(id, aposSequencia);
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    return (await this.nucleo()).enviarLote(id, esperoUltima, bytes);
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    return (await this.nucleo()).enviarRetrato(id, ateSequencia, partes);
  }

  async apagarVault(id: string): Promise<void> {
    return (await this.nucleo()).apagarVault(id);
  }
}
