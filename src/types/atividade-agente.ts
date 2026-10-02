export type FaseAtividadeAgente =
  | "leitura-inicial"
  | "buscando-notas-relacionadas"
  | "preparando-contexto"
  | "gerando-sugestoes"
  | "respondendo";

export interface AtividadeAgente {
  id: string;
  geracao: number;
  path: string;
  fase: FaseAtividadeAgente;
  iniciadoEm: number;
}
