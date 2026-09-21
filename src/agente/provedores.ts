// Catálogo declarativo de provedores do agente (doc 11 §3). Três dialetos cobrem todos:
// qualquer serviço que fale a API da OpenAI entra por base URL customizada.
//
// Preços por milhão de tokens: INTENCIONALMENTE vazio na v1 — os números de 2026 não foram
// verificados contra o billing (doc 09, incerteza 26), e inventar preço é pior que não ter.
// Enquanto um modelo não tiver preço verificado aqui, o medidor mostra só tokens (§3.1).

import { BASE_URL_SERVICO } from "../servico/base";
import type { Dialeto, ProvedorId, Thinking } from "./tipos";

/** Identificadores LÓGICOS, não nomes de modelo do fornecedor. O servidor decide qual
 * modelo real atende cada um — é o que permite trocar de fornecedor sem atualizar o app. */
export const MODELO_LEITURA = "leitura-rapida";
export const MODELO_ACOMPANHAMENTO = "acompanhamento";

export interface ProvedorInfo {
  id: ProvedorId;
  nome: string;
  /** Linha única no cartão do passo 1 do assistente (doc 11 §6.3). */
  descricao: string;
  dialecto: Dialeto;
  baseUrlPadrao: string;
  precisaChave: boolean;
  /** Autentica por sessão da conta, não por chave digitada. Só o provedor próprio. */
  exigeConta: boolean;
  /** Catálogo fixo de modelos; vazio significa listar por HTTP como o doc 11 §3 manda. */
  modelosFixos: string[];
  /** Tool nativo de web search (doc 11 §5.4) — ligado só quando confirmado no dialeto. */
  suportaWebSearch: boolean;
  /** Página onde o usuário cria a chave ("Onde consigo uma chave?"). */
  paginaDeChave: string;
  /** Sugestões por papel; aparecem com selo "Sugerido" no topo da lista de modelos. */
  sugeridosGateiro: string[];
  sugeridosAssistente: string[];
  /** USD por milhão de tokens, por modelo verificado. Vazio = sem estimativa (§3.1). */
  precos: Record<string, { entrada: number; saida: number }>;
}

export const PROVEDORES: readonly ProvedorInfo[] = [
  {
    id: "excalisidian",
    nome: "IA do Excalisidian",
    descricao: "Incluída no plano premium. Sem chave, sem conta em outro serviço.",
    dialecto: "openai",
    baseUrlPadrao: BASE_URL_SERVICO,
    precisaChave: false,
    exigeConta: true,
    modelosFixos: [MODELO_LEITURA, MODELO_ACOMPANHAMENTO],
    suportaWebSearch: false,
    paginaDeChave: "",
    sugeridosGateiro: [MODELO_LEITURA],
    sugeridosAssistente: [MODELO_ACOMPANHAMENTO],
    precos: {},
  },
  {
    id: "openai",
    nome: "OpenAI",
    descricao: "GPT e família o. Exige chave de api.openai.com.",
    dialecto: "openai",
    baseUrlPadrao: "https://api.openai.com/v1",
    precisaChave: true,
    exigeConta: false,
    modelosFixos: [],
    // Web search da OpenAI exige a Responses API, não o Chat Completions que o
    // dialeto usa — não verificado (doc 09, incerteza 24). Desligado até lá.
    suportaWebSearch: false,
    paginaDeChave: "https://platform.openai.com/api-keys",
    sugeridosGateiro: ["gpt-5.4-mini", "gpt-5.4-nano"],
    sugeridosAssistente: ["gpt-5.6-luna", "gpt-5.5"],
    precos: {},
  },
  {
    id: "anthropic",
    nome: "Anthropic",
    descricao: "Claude. Exige chave de console.anthropic.com.",
    dialecto: "anthropic",
    baseUrlPadrao: "https://api.anthropic.com",
    precisaChave: true,
    exigeConta: false,
    modelosFixos: [],
    // O tool existe no provedor, mas o dialeto ainda não o implementa — escondido até a
    // fase de web search (doc 11 §5.4, P2). `interpretarCiclo` descarta `achadoWeb`.
    suportaWebSearch: false,
    paginaDeChave: "https://console.anthropic.com/settings/keys",
    sugeridosGateiro: [],
    sugeridosAssistente: [],
    precos: {},
  },
  {
    id: "gemini",
    nome: "Gemini",
    descricao: "Google Gemini. Exige chave de aistudio.google.com.",
    dialecto: "gemini",
    baseUrlPadrao: "https://generativelanguage.googleapis.com",
    precisaChave: true,
    exigeConta: false,
    modelosFixos: [],
    // idem Anthropic: tool existe no provedor, falta implementar no dialeto (P2).
    suportaWebSearch: false,
    paginaDeChave: "https://aistudio.google.com/apikey",
    sugeridosGateiro: [],
    sugeridosAssistente: [],
    precos: {},
  },
  {
    id: "openrouter",
    nome: "OpenRouter",
    descricao: "Um pagamento, muitos modelos (inclui Zen e Go).",
    dialecto: "openai",
    baseUrlPadrao: "https://openrouter.ai/api/v1",
    precisaChave: true,
    exigeConta: false,
    modelosFixos: [],
    // Passthrough de tools não é garantido para todos os modelos (doc 09, incerteza 25).
    suportaWebSearch: false,
    paginaDeChave: "https://openrouter.ai/settings/keys",
    sugeridosGateiro: [],
    sugeridosAssistente: [],
    precos: {},
  },
  {
    id: "alibaba",
    nome: "Alibaba",
    descricao: "DashScope em modo compatível com OpenAI.",
    dialecto: "openai",
    baseUrlPadrao: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    precisaChave: true,
    exigeConta: false,
    modelosFixos: [],
    suportaWebSearch: false,
    paginaDeChave: "https://bailian.console.aliyun.com/?apiKey=1",
    sugeridosGateiro: [],
    sugeridosAssistente: [],
    precos: {},
  },
  {
    id: "ollama",
    nome: "Ollama",
    descricao: "Modelos locais. Sem chave, sem nuvem, sem custo.",
    dialecto: "openai",
    baseUrlPadrao: "http://localhost:11434/v1",
    precisaChave: false,
    exigeConta: false,
    modelosFixos: [],
    suportaWebSearch: false,
    paginaDeChave: "",
    sugeridosGateiro: [],
    sugeridosAssistente: [],
    precos: {},
  },
];

export function provedorDe(id: ProvedorId): ProvedorInfo {
  const p = PROVEDORES.find((x) => x.id === id);
  if (!p) throw new Error(`provedor desconhecido: ${id}`);
  return p;
}

export function baseUrlEfetiva(
  provedor: ProvedorId,
  baseUrls: Partial<Record<ProvedorId, string>>,
): string {
  return baseUrls[provedor] || provedorDe(provedor).baseUrlPadrao;
}

/** Modelos com parâmetro de raciocínio no dialeto OpenAI: gpt-5* e família o (o3, o4…).
 * Anthropic/Gemini ignoram `thinking` na v1 (doc 11 §2.1). */
export function modeloComThinking(dialeto: Dialeto, modelo: string): boolean {
  if (dialeto !== "openai") return false;
  return /^(gpt-5|o\d)/i.test(modelo.trim());
}

/** `reasoning_effort` da API; `padrao` omite o parâmetro. */
export function mapearThinking(thinking: Thinking): string | undefined {
  switch (thinking) {
    case "minimal":
      return "minimal";
    case "baixo":
      return "low";
    case "medio":
      return "medium";
    case "alto":
      return "high";
    case "padrao":
      return undefined;
  }
}

/** Validação da base URL customizada (passo "Avançado"). Devolve a mensagem de erro ou null. */
export function validarBaseUrl(url: string): string | null {
  if (!url.trim()) return null; // vazio = usar a padrão
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "Digite uma URL válida, começando com https:// ou http://.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "A base URL precisa começar com https:// ou http://.";
  }
  return null;
}

/** Máscara de chave para exibição (doc 11 §6.3: `sk-…abcd`). */
export function mascararChave(chave: string): string {
  if (chave.length <= 6) return "••••";
  return `${chave.slice(0, 3)}…${chave.slice(-4)}`;
}
