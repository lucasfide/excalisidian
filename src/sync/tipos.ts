// src/sync/tipos.ts
// Tipos de conflito. Sem import: folha de dependências.
//
// Um conflito é "duas versões do mesmo caminho". De onde a segunda veio — outro
// computador, outro processo — não importa aqui.

export type OrigemVersao = "local" | "remoto";

export interface VersaoEmConflito {
  origem: OrigemVersao;
  conteudo: string;
  mtimeMs: number;
  /** Nome do computador que gravou. Entra no nome da cópia de conflito. */
  dispositivo: string;
}

export interface Conflito {
  /** Caminho relativo à raiz do vault, com "/", normalizado NFC. */
  caminho: string;
  tipo: "nota" | "desenho";
  local: VersaoEmConflito;
  remoto: VersaoEmConflito;
}

export type Resolucao =
  | { acao: "ficarCom"; origem: OrigemVersao }
  | { acao: "manterAmbas" };

export type OperacaoArquivo = { tipo: "escrever"; caminho: string; conteudo: string };
