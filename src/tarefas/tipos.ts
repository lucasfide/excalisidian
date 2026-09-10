// Tipos do painel de tarefas (doc 10 §2). Sem lógica — só as formas.

export type Secao =
  | "atrasado"
  | "hoje"
  | "amanha"
  | "essa-semana"
  | "proxima-semana"
  | "concluidas";

export interface Comentario {
  id: string;
  texto: string;
  /** ISO 8601 com fuso. */
  criadoEm: string;
  /** ISO 8601 com fuso da última edição; null até a primeira. */
  editadoEm: string | null;
}

export interface Tarefa {
  id: string;
  titulo: string;
  /** Data local YYYY-MM-DD, sem hora, sem fuso. Único eixo temporal. */
  vencimento: string;
  /** Só ordena dentro da seção calculada. Renormalizado para 10, 20, 30… pelo store. */
  ordem: number;
  concluida: boolean;
  /** ISO 8601 com fuso; null quando concluida é false. */
  concluidaEm: string | null;
  criadaEm: string;
  comentarios: Comentario[];
}

export interface DadosTarefas {
  versao: 1;
  tarefas: Tarefa[];
}
