// Interface única de acesso a disco. Tudo que lê ou escreve no vault passa por aqui —
// isso permite testar sem tocar em disco, rodar um modo web no futuro, e trocar de shell
// se o risco do canvas se materializar (doc 05, seção 2).

export type TipoEntrada = "note" | "drawing" | "attachment" | "folder";

export interface EntradaArquivo {
  /** Caminho relativo à raiz do vault, com "/", normalizado NFC. */
  path: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
}

export interface EventoArquivo {
  tipo: "criado" | "modificado" | "removido" | "renomeado";
  path: string;
}

export interface VaultAdapter {
  raiz(): string;
  listar(): Promise<EntradaArquivo[]>; // walk completo, só metadados
  lerTexto(path: string): Promise<string>;
  lerBinario(path: string): Promise<Uint8Array>;
  escreverTexto(path: string, conteudo: string): Promise<void>; // tmp + rename
  escreverBinario(path: string, dados: Uint8Array): Promise<void>;
  criarPasta(path: string): Promise<void>;
  mover(de: string, para: string): Promise<void>;
  existe(path: string): Promise<boolean>;
  observar(cb: (eventos: EventoArquivo[]) => void): () => void;
}
