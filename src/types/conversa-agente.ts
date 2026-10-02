import type { SugestaoAgente } from "../agente/assistente";
import type { FaseAtividadeAgente } from "./atividade-agente";

export interface MensagemConversaAgente {
  papel: "usuario" | "assistente";
  texto: string;
  id?: string;
  tipo?: "mensagem" | "analise";
  fase?: FaseAtividadeAgente;
  estado?: "em-andamento" | "concluido" | "erro";
  sugestoes?: SugestaoAgente[];
  criadoEm?: string;
  idsMemoria?: string[];
}
