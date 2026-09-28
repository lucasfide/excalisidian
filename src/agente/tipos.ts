// Tipos do agente de IA (doc 11 §2, §3, §5). Sem import aqui: folha de dependências.

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
