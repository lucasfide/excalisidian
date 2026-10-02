export type CategoriaFato = "preferencia" | "glossario" | "convencao";
export type EscopoFato = "vault" | "projeto";
export type EstadoFato = "pendente" | "confirmado" | "substituido" | "rejeitado";
export type FonteFato = "nota" | "conversa" | "usuario";

/**
 * `estado` e os campos estruturados são opcionais apenas para ler fatos legados.
 * Fatos legados não são tratados como confirmados automaticamente.
 */
export interface Fato {
  id: string;
  texto: string;
  notaOrigem: string | null;
  criadoEm: string;
  atualizadoEm?: string;
  fonte?: FonteFato;
  categoria?: CategoriaFato;
  escopo?: EscopoFato;
  caminhoProjeto?: string | null;
  chave?: string;
  trechoEvidencia?: string | null;
  estado?: EstadoFato;
}

export interface CandidatoFato {
  categoria: CategoriaFato;
  escopo: EscopoFato;
  caminhoProjeto?: string | null;
  chave: string;
  texto: string;
  trechoEvidencia: string;
}
