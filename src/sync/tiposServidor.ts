// Tipos do contrato com o servidor de sincronização. Sem import: folha de dependências,
// igual src/conta/tipos.ts. Não confundir com src/sync/tipos.ts, que é da tela de conflitos.

/**
 * Códigos de falha do contrato de sincronização (doc 17 §9).
 *
 * - "fora-de-ordem": `enviarLote` foi chamado com `esperoUltima` que não é a última
 *   sequência do vault; nada foi gravado, o chamador deve baixar de novo e tentar outra vez.
 * - "sessao": token de sessão inválido ou vencido.
 * - "plano": a conta não tem (ou perdeu) o plano que a sincronização exige.
 * - "espaco": a conta estourou o espaço de armazenamento do plano.
 * - "rede": não deu para falar com o servidor.
 * - "servidor": o servidor respondeu erro inesperado.
 * - "nao-encontrado": `id` de vault que não existe (mais) na conta.
 * - "ja-existe": `criarVault` com um `id` que já existe na conta. O id é um UUID v4 gerado
 *   pelo cliente (`crypto.randomUUID()`) — o AAD do envelope e do nome cifrado usa o
 *   `idDoVault` (`src/sync/pacote.ts`), então ele tem que existir antes de `criarVault`.
 */
export type ErroSync =
  | "fora-de-ordem"
  | "sessao"
  | "plano"
  | "espaco"
  | "rede"
  | "servidor"
  | "nao-encontrado"
  | "ja-existe";

/** Mesmo padrão de `FalhaConta`: código normalizado aqui, texto da interface em quem mostra. */
export class FalhaSync extends Error {
  constructor(
    public readonly codigo: ErroSync,
    message?: string,
  ) {
    super(message ?? codigo);
    this.name = "FalhaSync";
  }
}

/** Um vault sincronizado, como a conta o vê: nome e chave sempre cifrados — o cliente
 * abre com a `chaveDeEnvelope`. */
export interface VaultSincronizado {
  id: string;
  nomeCifrado: Uint8Array;
  envelope: Uint8Array;
}

/** Resultado de `baixar`: o retrato (se o cliente estiver atrás dele) e os lotes seguintes,
 * em ordem de sequência. */
export interface ResultadoBaixar {
  retrato?: { ateSequencia: number; partes: Uint8Array[] };
  lotes: { sequencia: number; bytes: Uint8Array }[];
}
