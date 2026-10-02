// Tipos do agente de IA (doc 11 §2, §3, §5). Só `import type` aqui: sem dependência em tempo de execução.

import type { SugestaoAgente } from "./assistente";

export type Dialeto = "openai" | "anthropic" | "gemini";

export type ProvedorId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "alibaba"
  | "ollama"
  | "excalisidian";

/** Profundidade de raciocínio (doc 11 §2.1). Só tem efeito onde o dialeto suporta
 * (`reasoning_effort` da OpenAI e compatíveis). `padrao` não envia o parâmetro. */
export type Thinking = "padrao" | "minimal" | "baixo" | "medio" | "alto";

export interface ConfigAgente {
  habilitado: boolean;
  provedor: ProvedorId;
  /** Uma API key por provedor (ollama não usa). Persistida no settings.json. */
  chaves: Partial<Record<ProvedorId, string>>;
  /** Override opcional de base URL por provedor; ausente = URL do catálogo. */
  baseUrls: Partial<Record<ProvedorId, string>>;
  modeloGateiro: string;
  modeloAssistente: string;
  thinking: Thinking;
  webSearch: boolean;
  /** null = sem teto (padrão — decisão doc 11 §10.4). */
  tetoDiarioUsd: number | null;
}

export interface MensagemChat {
  /** Para quem vê a UI: "usuario" | "assistente". Mapeado por dialeto no cliente. */
  papel: "usuario" | "assistente";
  texto: string;
}

export interface UsoSimples {
  tokensEntrada: number;
  tokensSaida: number;
}

/** Erros de provedor normalizados; as mensagens do §7 do doc 11 moram na UI. */
export type ErroAgente =
  | "chave" // 401/403
  | "sessao" // provedor exige conta e não há sessão ativa
  | "plano" // provedor próprio: conta autenticada sem direito à IA (403)
  | "cota" // 429
  | "creditos" // provedor próprio: créditos do mês esgotados (429 {"codigo":"creditos"})
  | "instavel" // provedor próprio: 502/503/504
  | "limite" // provedor próprio: 429 {"codigo":"limite"} (limite por minuto do servidor)
  | "tamanho" // provedor próprio: 413 (conversa grande demais)
  | "modelo" // 404
  | "rede" // exceção de conexão
  | "escopo" // base URL fora do escopo permitido pelo capability
  | "resposta" // corpo inesperado
  | "provedor"; // qualquer outro status

/** Exceção lançada por cliente.ts carregando o código normalizado. */
export class FalhaAgente extends Error {
  constructor(
    public readonly codigo: ErroAgente,
    message?: string,
  ) {
    super(message ?? codigo);
    this.name = "FalhaAgente";
  }
}

export interface RespostaComplecao {
  texto: string;
  uso: UsoSimples;
}

export type StatusAgente =
  | "desligado"
  | "ocioso"
  | "observando"
  | "pensando"
  | "pausado"
  | "erro";

// --- Atividade, atualizações e avisos do painel ---

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

export interface AtualizacoesAgente {
  sugestoes: boolean;
  resposta: boolean;
}

export interface VersoesAvisosAgente {
  sugestoesPorNota: Record<string, number>;
  memoriaVault: number;
}

export interface VersoesVistasAvisosAgente {
  sugestoesPorNota: Record<string, number>;
  memoriaVault: number;
}

// --- Conversa por nota ---

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

// --- Memória (fatos) ---

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
