// servidor/src/armazenamentoSync.ts
// Armazenamento do NucleoServidorSync (src/sync/nucleoServidorSync.ts, na raiz) em SQLite +
// arquivo: os bytes de cada pacote (lote ou parte de retrato) vão para um arquivo sob
// `<dados>/pacotes/<vault>/…`, gravados com tmp + rename (atômico no mesmo volume, igual
// escritaAtomica.ts do app); os metadados (quem é o vault, quais sequências existem, qual é
// o retrato atual) vivem no SQLite, sempre alterados dentro de uma transação.
//
// Cada instância é escopada a UMA conta (`contaId`, passado no construtor): `buscar`/`listar`
// só veem vaults dessa conta — um vault de outra conta simplesmente não existe para quem
// pergunta (o núcleo, ao não encontrar, lança FalhaSync("nao-encontrado"), que a rota mapeia
// para 404). Isso implementa o isolamento entre contas sem o núcleo precisar saber que contas
// existem (doc 17 §9 não fala de contas — é a Task 5 que impõe isso na camada de storage).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ArmazenamentoServidorSync,
  VaultGuardado,
} from "../../src/sync/nucleoServidorSync";
import { FalhaSync, type ResultadoBaixar, type VaultSincronizado } from "../../src/sync/tiposServidor";
import type { BancoSqlite } from "./banco";

/** 8 MiB + 28 bytes (doc 18 §3) — acima disso, um lote ou uma parte de retrato dá 413. Os 28
 * bytes de folga cobrem o nonce (12) + a tag do GCM (16) do envelope (doc 17 §2.3), que o
 * servidor nunca abre mas cujo tamanho precisa caber no limite declarado. */
export const TAMANHO_MAXIMO_PACOTE = 8 * 1024 * 1024 + 28;

/** 5 GiB de pacotes guardados por conta premium (doc 18 §3) — soma de `lotes.tamanho` e
 * `retrato_partes.tamanho` de todos os vaults da conta. Acima disso, `enviarLote` e
 * `enviarRetrato` dão 507. */
export const COTA_BYTES_POR_CONTA = 5 * 1024 * 1024 * 1024;

/** O identificador vira nome de pasta. Aceita IDs antigos simples usados pelo armazenamento,
 * mas nunca separadores, pontos ou outros caracteres que permitam alias/caminho externo. */
function idSeguroParaPasta(id: string): boolean {
  return /^[a-z0-9_-]+$/.test(id);
}

function apagarArquivo(caminho: string): void {
  try {
    fs.unlinkSync(caminho);
  } catch {
    // já não existe (removido antes, ou nunca chegou a ser escrito) — sem problema: o efeito
    // desejado ("este arquivo não deve mais existir") já está garantido.
  }
}

function escreverArquivoAtomico(caminhoFinal: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(caminhoFinal), { recursive: true });
  const caminhoTmp = `${caminhoFinal}.tmp-${crypto.randomUUID()}`;
  fs.writeFileSync(caminhoTmp, bytes);
  fs.renameSync(caminhoTmp, caminhoFinal);
}

interface LinhaVault {
  id: string;
  nomeCifrado: Buffer;
  envelope: Buffer;
  ultimoRetrato: number;
}

interface LinhaLote {
  sequencia: number;
  caminho: string;
}

interface LinhaParte {
  indice: number;
  caminho: string;
}

/** Soma dos bytes de todos os pacotes (lotes + partes de retrato) de todos os vaults de uma
 * conta — a "cota usada" do doc 18 §3. Consulta pura: não olha o disco, só os tamanhos já
 * registrados no SQLite no momento em que cada arquivo foi gravado. */
export function bytesUsadosPelaConta(banco: BancoSqlite, contaId: number): number {
  const lotes = banco
    .prepare(
      `select coalesce(sum(l.tamanho), 0) as soma
       from lotes l join vaults v on v.id = l.vault_id
       where v.conta_id = ?`,
    )
    .get(contaId) as { soma: number };
  const partes = banco
    .prepare(
      `select coalesce(sum(r.tamanho), 0) as soma
       from retrato_partes r join vaults v on v.id = r.vault_id
       where v.conta_id = ?`,
    )
    .get(contaId) as { soma: number };
  return lotes.soma + partes.soma;
}

export class ArmazenamentoSqlite implements ArmazenamentoServidorSync {
  constructor(
    private readonly banco: BancoSqlite,
    private readonly pastaDados: string,
    private readonly contaId: number,
  ) {}

  private pastaVault(id: string): string {
    if (!idSeguroParaPasta(id)) throw new Error("id de vault inseguro para armazenamento");
    return path.join(this.pastaDados, "pacotes", id);
  }

  private caminhoLote(id: string, sequencia: number): string {
    return path.join(this.pastaVault(id), `lote-${sequencia}.bin`);
  }

  private caminhoParteRetrato(id: string, ateSequencia: number, indice: number): string {
    return path.join(this.pastaVault(id), `retrato-${ateSequencia}-${indice}.bin`);
  }

  async existe(id: string): Promise<boolean> {
    if (!idSeguroParaPasta(id)) return false;
    return this.banco.prepare(`select 1 from vaults where id = ? and conta_id = ?`).get(id, this.contaId) !== undefined;
  }

  async buscar(id: string): Promise<VaultGuardado | null> {
    if (!idSeguroParaPasta(id)) return null;
    const linha = this.banco
      .prepare(
        `select id, nome_cifrado as nomeCifrado, envelope, ultimo_retrato as ultimoRetrato
         from vaults where id = ? and conta_id = ?`,
      )
      .get(id, this.contaId) as LinhaVault | undefined;
    if (!linha) return null;

    const lotesLinhas = this.banco
      .prepare(`select sequencia, caminho_arquivo as caminho from lotes where vault_id = ? order by sequencia`)
      .all(id) as LinhaLote[];
    const lotes = lotesLinhas.map((l) => ({
      sequencia: l.sequencia,
      bytes: new Uint8Array(fs.readFileSync(l.caminho)),
    }));

    const partesLinhas = this.banco
      .prepare(`select indice, caminho_arquivo as caminho from retrato_partes where vault_id = ? order by indice`)
      .all(id) as LinhaParte[];
    const retrato =
      partesLinhas.length > 0
        ? {
            ateSequencia: linha.ultimoRetrato,
            partes: partesLinhas.map((p) => new Uint8Array(fs.readFileSync(p.caminho))),
          }
        : undefined;

    return {
      id: linha.id,
      nomeCifrado: new Uint8Array(linha.nomeCifrado),
      envelope: new Uint8Array(linha.envelope),
      lotes,
      retrato,
    };
  }

  async listar(): Promise<VaultSincronizado[]> {
    // O núcleo só usa id, nome e envelope na listagem. Ler os pacotes aqui bloquearia o
    // processo Node e poderia carregar vários GiB para devolver poucos bytes de metadados.
    const linhas = this.banco.prepare(
      `select id, nome_cifrado as nomeCifrado, envelope from vaults where conta_id = ?`,
    ).all(this.contaId) as Array<Pick<LinhaVault, "id" | "nomeCifrado" | "envelope">>;
    return linhas.filter((linha) => idSeguroParaPasta(linha.id)).map((linha) => ({
      id: linha.id,
      nomeCifrado: new Uint8Array(linha.nomeCifrado),
      envelope: new Uint8Array(linha.envelope),
    }));
  }

  async baixarPacotes(id: string, aposSequencia: number): Promise<ResultadoBaixar | null> {
    if (!idSeguroParaPasta(id)) return null;
    const linha = this.banco.prepare(
      `select ultimo_retrato as ultimoRetrato from vaults where id = ? and conta_id = ?`,
    ).get(id, this.contaId) as { ultimoRetrato: number } | undefined;
    if (!linha) return null;

    const partesLinhas = aposSequencia < linha.ultimoRetrato
      ? this.banco.prepare(
        `select caminho_arquivo as caminho from retrato_partes where vault_id = ? order by indice`,
      ).all(id) as Array<{ caminho: string }>
      : [];
    const retrato = partesLinhas.length > 0
      ? { ateSequencia: linha.ultimoRetrato, partes: partesLinhas.map((p) => new Uint8Array(fs.readFileSync(p.caminho))) }
      : undefined;
    const depois = retrato ? linha.ultimoRetrato : aposSequencia;
    const lotesLinhas = this.banco.prepare(
      `select sequencia, caminho_arquivo as caminho from lotes where vault_id = ? and sequencia > ? order by sequencia`,
    ).all(id, depois) as LinhaLote[];
    return {
      retrato,
      lotes: lotesLinhas.map((l) => ({ sequencia: l.sequencia, bytes: new Uint8Array(fs.readFileSync(l.caminho)) })),
      ultimoRetrato: linha.ultimoRetrato,
    };
  }

  async anexarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    if (!idSeguroParaPasta(id)) throw new FalhaSync("nao-encontrado");
    const sequencia = esperoUltima + 1;
    const caminho = path.join(this.pastaVault(id), `lote-${sequencia}-${crypto.randomUUID()}.bin`);
    const aplicar = this.banco.transaction(() => {
      const linha = this.banco.prepare(
        `select ultimo_retrato as ultimoRetrato from vaults where id = ? and conta_id = ?`,
      ).get(id, this.contaId) as { ultimoRetrato: number } | undefined;
      if (!linha) throw new FalhaSync("nao-encontrado");
      const ultimoLote = this.banco.prepare(
        `select max(sequencia) as sequencia from lotes where vault_id = ?`,
      ).get(id) as { sequencia: number | null };
      if (esperoUltima !== (ultimoLote.sequencia ?? linha.ultimoRetrato)) throw new FalhaSync("fora-de-ordem");
      if (bytesUsadosPelaConta(this.banco, this.contaId) + bytes.length > COTA_BYTES_POR_CONTA) {
        throw new FalhaSync("espaco");
      }
      escreverArquivoAtomico(caminho, bytes);
      this.banco.prepare(
        `insert into lotes (vault_id, sequencia, tamanho, caminho_arquivo) values (?, ?, ?, ?)`,
      ).run(id, sequencia, bytes.length, caminho);
      this.banco.prepare(`update vaults set atualizado_em = ? where id = ? and conta_id = ?`)
        .run(Date.now(), id, this.contaId);
    });
    try {
      aplicar();
    } catch (erro) {
      apagarArquivo(caminho);
      throw erro;
    }
    return sequencia;
  }

  async substituirRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    if (!idSeguroParaPasta(id)) throw new FalhaSync("nao-encontrado");
    const novos = partes.map((bytes, indice) => ({
      indice,
      bytes,
      caminho: path.join(this.pastaVault(id), `retrato-${ateSequencia}-${indice}-${crypto.randomUUID()}.bin`),
    }));
    const aplicar = this.banco.transaction((): string[] => {
      const linha = this.banco.prepare(
        `select ultimo_retrato as ultimoRetrato from vaults where id = ? and conta_id = ?`,
      ).get(id, this.contaId) as { ultimoRetrato: number } | undefined;
      if (!linha) throw new FalhaSync("nao-encontrado");
      const ultimoLote = this.banco.prepare(
        `select max(sequencia) as sequencia from lotes where vault_id = ?`,
      ).get(id) as { sequencia: number | null };
      if (ateSequencia <= linha.ultimoRetrato || ateSequencia > (ultimoLote.sequencia ?? linha.ultimoRetrato)) {
        throw new FalhaSync("fora-de-ordem");
      }
      const totalNovo = partes.reduce((soma, parte) => soma + parte.length, 0);
      if (bytesUsadosPelaConta(this.banco, this.contaId) + totalNovo > COTA_BYTES_POR_CONTA) {
        throw new FalhaSync("espaco");
      }
      const antigos = [
        ...this.banco.prepare(`select caminho_arquivo as caminho from retrato_partes where vault_id = ?`)
          .all(id) as Array<{ caminho: string }>,
        ...this.banco.prepare(`select caminho_arquivo as caminho from lotes where vault_id = ? and sequencia <= ?`)
          .all(id, ateSequencia) as Array<{ caminho: string }>,
      ].map((linhaAntiga) => linhaAntiga.caminho);

      for (const parte of novos) escreverArquivoAtomico(parte.caminho, parte.bytes);
      this.banco.prepare(`delete from lotes where vault_id = ? and sequencia <= ?`).run(id, ateSequencia);
      this.banco.prepare(`delete from retrato_partes where vault_id = ?`).run(id);
      for (const parte of novos) {
        this.banco.prepare(
          `insert into retrato_partes (vault_id, ate_sequencia, indice, tamanho, caminho_arquivo) values (?, ?, ?, ?, ?)`,
        ).run(id, ateSequencia, parte.indice, parte.bytes.length, parte.caminho);
      }
      this.banco.prepare(`update vaults set ultimo_retrato = ?, atualizado_em = ? where id = ? and conta_id = ?`)
        .run(ateSequencia, Date.now(), id, this.contaId);
      return antigos;
    });
    let antigos: string[];
    try {
      antigos = aplicar();
    } catch (erro) {
      for (const parte of novos) apagarArquivo(parte.caminho);
      throw erro;
    }
    for (const caminho of antigos) apagarArquivo(caminho);
  }

  /**
   * Grava (cria ou substitui) o vault inteiro. Escreve os arquivos NOVOS primeiro (gravação
   * atômica tmp+rename — escrever de novo o mesmo arquivo, se isto for repetido, não faz mal)
   * e só depois comita os metadados numa transação SQLite; os arquivos que deixaram de ser
   * referenciados (lotes cobertos por um retrato novo, ou o retrato antigo substituído) só são
   * apagados DEPOIS que a transação confirma — se o processo morrer entre o commit e essa
   * limpeza, sobra um arquivo órfão (gasta disco, não corrompe nada: os metadados já não
   * apontam para ele).
   */
  async gravar(vault: VaultGuardado): Promise<void> {
    this.pastaVault(vault.id);
    const dono = this.banco.prepare(`select conta_id as contaId from vaults where id = ?`).get(vault.id) as
      | { contaId: number }
      | undefined;
    if (dono && dono.contaId !== this.contaId) throw new FalhaSync("ja-existe");
    const linhaAtual = this.banco
      .prepare(`select ultimo_retrato as ultimoRetrato from vaults where id = ?`)
      .get(vault.id) as { ultimoRetrato: number } | undefined;

    const lotesExistentes = this.banco
      .prepare(`select sequencia, caminho_arquivo as caminho from lotes where vault_id = ?`)
      .all(vault.id) as LinhaLote[];
    const mapaLotesExistentes = new Map(lotesExistentes.map((l) => [l.sequencia, l.caminho]));
    const sequenciasNovas = new Set(vault.lotes.map((l) => l.sequencia));

    const lotesParaInserir = vault.lotes
      .filter((l) => !mapaLotesExistentes.has(l.sequencia))
      .map((l) => ({ sequencia: l.sequencia, caminho: this.caminhoLote(vault.id, l.sequencia), bytes: l.bytes }));
    const caminhosParaApagar: string[] = [];
    for (const [sequencia, caminho] of mapaLotesExistentes) {
      if (!sequenciasNovas.has(sequencia)) caminhosParaApagar.push(caminho);
    }

    const partesExistentes = this.banco
      .prepare(`select indice, caminho_arquivo as caminho from retrato_partes where vault_id = ?`)
      .all(vault.id) as LinhaParte[];
    // Só reescreve o retrato quando ele de fato mudou (sequência diferente da guardada, ou
    // número de partes diferente) — evita reler/reescrever os mesmos arquivos em todo `gravar`
    // chamado por `enviarLote` depois que um retrato já existe.
    const retratoMudou = vault.retrato
      ? linhaAtual?.ultimoRetrato !== vault.retrato.ateSequencia || partesExistentes.length !== vault.retrato.partes.length
      : partesExistentes.length > 0;

    const partesParaInserir = retratoMudou && vault.retrato
      ? vault.retrato.partes.map((bytes, indice) => ({
          indice,
          caminho: this.caminhoParteRetrato(vault.id, vault.retrato!.ateSequencia, indice),
          bytes,
        }))
      : [];
    if (retratoMudou) {
      for (const p of partesExistentes) caminhosParaApagar.push(p.caminho);
    }

    // 1. Arquivos novos primeiro — se algo falhar aqui, nenhum metadado mudou ainda.
    for (const l of lotesParaInserir) escreverArquivoAtomico(l.caminho, l.bytes);
    for (const p of partesParaInserir) escreverArquivoAtomico(p.caminho, p.bytes);

    // 2. Metadados numa transação só.
    const aplicar = this.banco.transaction(() => {
      // `atualizado_em` alimenta só `excalisidian-admin vaults <email>` ("última atividade",
      // doc 18 §4) — não é usado por nenhuma regra de sincronização.
      const agora = Date.now();
      const donoAtual = this.banco.prepare(`select conta_id as contaId from vaults where id = ?`).get(vault.id) as
        | { contaId: number }
        | undefined;
      if (donoAtual && donoAtual.contaId !== this.contaId) throw new FalhaSync("ja-existe");
      if (!donoAtual) {
        this.banco
          .prepare(
            `insert into vaults (id, conta_id, nome_cifrado, envelope, ultimo_retrato, atualizado_em) values (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            vault.id,
            this.contaId,
            Buffer.from(vault.nomeCifrado),
            Buffer.from(vault.envelope),
            vault.retrato?.ateSequencia ?? 0,
            agora,
          );
      } else {
        this.banco
          .prepare(
            `update vaults set nome_cifrado = ?, envelope = ?, ultimo_retrato = ?, atualizado_em = ? where id = ? and conta_id = ?`,
          )
          .run(
            Buffer.from(vault.nomeCifrado),
            Buffer.from(vault.envelope),
            vault.retrato?.ateSequencia ?? 0,
            agora,
            vault.id,
            this.contaId,
          );
      }

      for (const [sequencia] of mapaLotesExistentes) {
        if (!sequenciasNovas.has(sequencia)) {
          this.banco.prepare(`delete from lotes where vault_id = ? and sequencia = ?`).run(vault.id, sequencia);
        }
      }
      for (const l of lotesParaInserir) {
        this.banco
          .prepare(`insert into lotes (vault_id, sequencia, tamanho, caminho_arquivo) values (?, ?, ?, ?)`)
          .run(vault.id, l.sequencia, l.bytes.length, l.caminho);
      }

      if (retratoMudou) {
        this.banco.prepare(`delete from retrato_partes where vault_id = ?`).run(vault.id);
        for (const p of partesParaInserir) {
          this.banco
            .prepare(
              `insert into retrato_partes (vault_id, ate_sequencia, indice, tamanho, caminho_arquivo) values (?, ?, ?, ?, ?)`,
            )
            .run(vault.id, vault.retrato!.ateSequencia, p.indice, p.bytes.length, p.caminho);
        }
      }
    });
    aplicar();

    // 3. Só depois do commit, apaga os arquivos que deixaram de ser referenciados.
    for (const caminho of caminhosParaApagar) apagarArquivo(caminho);
  }

  /** Apaga o vault inteiro: metadados numa transação, depois os arquivos, e por fim a pasta
   * do vault (se ficou vazia). Um vault que não pertence a esta conta (id de outra conta, ou
   * inexistente) não faz nada — mesmo comportamento idempotente de ServicoSyncFake/Local, e
   * garante que apagar nunca alcança o vault de outra conta. */
  async apagar(id: string): Promise<void> {
    if (!idSeguroParaPasta(id)) return;
    const linha = this.banco.prepare(`select id from vaults where id = ? and conta_id = ?`).get(id, this.contaId) as
      | { id: string }
      | undefined;
    if (!linha) return;

    const lotes = this.banco.prepare(`select caminho_arquivo as caminho from lotes where vault_id = ?`).all(id) as {
      caminho: string;
    }[];
    const partes = this.banco
      .prepare(`select caminho_arquivo as caminho from retrato_partes where vault_id = ?`)
      .all(id) as { caminho: string }[];

    const aplicar = this.banco.transaction(() => {
      this.banco.prepare(`delete from lotes where vault_id = ?`).run(id);
      this.banco.prepare(`delete from retrato_partes where vault_id = ?`).run(id);
      this.banco.prepare(`delete from vaults where id = ?`).run(id);
    });
    aplicar();

    for (const l of lotes) apagarArquivo(l.caminho);
    for (const p of partes) apagarArquivo(p.caminho);
    try {
      fs.rmdirSync(this.pastaVault(id));
    } catch {
      // pasta não existe (nunca chegou a receber um arquivo) ou não está vazia (corrida rara
      // com outra gravação) — sem problema, não é o papel deste método garantir isso.
    }
  }
}
