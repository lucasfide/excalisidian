// Transporte do agente (doc 11 §3): os três dialetos sobre o fetch do
// `@tauri-apps/plugin-http` (reqwest em Rust — sem CORS, chave fora do WebView).
// Erros HTTP viram `FalhaAgente` com código normalizado; as mensagens da interface
// (§7 do doc 11) são montadas por quem chama.

import { fetch } from "@tauri-apps/plugin-http";

import type {
  ConfigAgente,
  MensagemChat,
  RespostaComplecao,
} from "./tipos";
import { FalhaAgente } from "./tipos";
import type { ProvedorInfo } from "./provedores";
import { mapearThinking, modeloComThinking } from "./provedores";
import { tokenDaSessaoAtual } from "../servico/sessao";
import { traduzirAgora } from "../i18n/traduzirAgora";

const TIMEOUT_CONEXAO_MS = 20_000;

export interface ContextoChamada {
  provedor: ProvedorInfo;
  chave?: string;
  baseUrl: string;
  modelo: string;
  thinking: ConfigAgente["thinking"];
}

/** A credencial da chamada: chave digitada, ou token da sessão quando o provedor é o
 * nosso. Falta de sessão para aqui — chamar sem autenticação daria 401 e a interface
 * diria "chave recusada", que é a mensagem errada. */
function credencial(ctx: ContextoChamada): string | undefined {
  if (!ctx.provedor.exigeConta) return ctx.chave;
  const token = tokenDaSessaoAtual();
  if (!token) throw new FalhaAgente("sessao", "sem sessão ativa");
  return token;
}

export function cabecalhosBase(ctx: ContextoChamada): Record<string, string> {
  const cabecalhos: Record<string, string> = { "content-type": "application/json" };
  const chave = credencial(ctx);
  switch (ctx.provedor.dialecto) {
    case "openai":
      if (chave) cabecalhos.Authorization = `Bearer ${chave}`;
      break;
    case "anthropic":
      cabecalhos["x-api-key"] = chave ?? "";
      cabecalhos["anthropic-version"] = "2023-06-01";
      break;
    case "gemini":
      // chave vai na query; nada aqui.
      break;
  }
  return cabecalhos;
}

async function lancar(
  url: string,
  init: RequestInit,
): Promise<{ status: number; corpo: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, connectTimeout: TIMEOUT_CONEXAO_MS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // O capability escopa por host: base URL fora do escopo morre aqui, com erro do
    // reqwest/Tauri (doc 11 §3 — avisar e apontar para o campo Avançado).
    if (/scope|not allowed|url/i.test(msg)) {
      throw new FalhaAgente("escopo", msg);
    }
    throw new FalhaAgente("rede", msg);
  }
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    // respostas de erro às vezes vêm vazias/não-JSON
  }
  return { status: res.status, corpo };
}

function erroDeStatus(status: number, corpo: unknown): FalhaAgente {
  const detalhe =
    corpo && typeof corpo === "object"
      ? JSON.stringify(corpo).slice(0, 300)
      : undefined;
  if (status === 401 || status === 403) return new FalhaAgente("chave", detalhe);
  if (status === 429) return new FalhaAgente("cota", detalhe);
  if (status === 404) return new FalhaAgente("modelo", detalhe);
  if (status >= 500) return new FalhaAgente("provedor", detalhe);
  return new FalhaAgente("provedor", detalhe);
}

// ——— completar ———

export interface PedidoComplecao extends ContextoChamada {
  system: string;
  mensagens: MensagemChat[];
  /** Antropic exige max_tokens; os outros usam como teto quando informado. */
  maxTokens?: number;
}

export async function completar(pedido: PedidoComplecao): Promise<RespostaComplecao> {
  switch (pedido.provedor.dialecto) {
    case "openai":
      return completarOpenAI(pedido);
    case "anthropic":
      return completarAnthropic(pedido);
    case "gemini":
      return completarGemini(pedido);
  }
}

async function completarOpenAI(p: PedidoComplecao): Promise<RespostaComplecao> {
  const corpo: Record<string, unknown> = {
    model: p.modelo,
    messages: [
      { role: "system", content: p.system },
      ...p.mensagens.map((m) => ({
        role: m.papel === "usuario" ? "user" : "assistant",
        content: m.texto,
      })),
    ],
  };
  if (modeloComThinking(p.provedor.dialecto, p.modelo)) {
    const esforco = mapearThinking(p.thinking);
    if (esforco) corpo.reasoning_effort = esforco;
  }
  if (p.maxTokens) corpo.max_completion_tokens = p.maxTokens;
  const { status, corpo: res } = await lancar(
    `${p.baseUrl}/chat/completions`,
    { method: "POST", headers: cabecalhosBase(p), body: JSON.stringify(corpo) },
  );
  if (status < 200 || status >= 300) throw erroDeStatus(status, res);
  const escolha = (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0];
  const texto = escolha?.message?.content;
  if (typeof texto !== "string") throw new FalhaAgente("resposta");
  const uso = (res as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  return {
    texto,
    uso: {
      tokensEntrada: uso?.prompt_tokens ?? 0,
      tokensSaida: uso?.completion_tokens ?? 0,
    },
  };
}

async function completarAnthropic(p: PedidoComplecao): Promise<RespostaComplecao> {
  const corpo = {
    model: p.modelo,
    max_tokens: p.maxTokens ?? 2048,
    system: p.system,
    messages: p.mensagens.map((m) => ({
      role: m.papel === "usuario" ? "user" : "assistant",
      content: m.texto,
    })),
  };
  const { status, corpo: res } = await lancar(
    `${p.baseUrl}/v1/messages`,
    { method: "POST", headers: cabecalhosBase(p), body: JSON.stringify(corpo) },
  );
  if (status < 200 || status >= 300) throw erroDeStatus(status, res);
  const blocos = (res as { content?: { type?: string; text?: string }[] })?.content ?? [];
  const texto = blocos
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (!texto) throw new FalhaAgente("resposta");
  const uso = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    texto,
    uso: {
      tokensEntrada: uso?.input_tokens ?? 0,
      tokensSaida: uso?.output_tokens ?? 0,
    },
  };
}

async function completarGemini(p: PedidoComplecao): Promise<RespostaComplecao> {
  const corpo = {
    systemInstruction: { parts: [{ text: p.system }] },
    contents: p.mensagens.map((m) => ({
      role: m.papel === "usuario" ? "user" : "model",
      parts: [{ text: m.texto }],
    })),
  };
  const url = `${p.baseUrl}/v1beta/models/${encodeURIComponent(p.modelo)}:generateContent?key=${encodeURIComponent(credencial(p) ?? "")}`;
  const { status, corpo: res } = await lancar(url, {
    method: "POST",
    headers: cabecalhosBase(p),
    body: JSON.stringify(corpo),
  });
  if (status < 200 || status >= 300) throw erroDeStatus(status, res);
  const partes =
    (res as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    })?.candidates?.[0]?.content?.parts ?? [];
  const texto = partes.map((x) => x.text ?? "").join("");
  if (!texto) throw new FalhaAgente("resposta");
  const uso = (
    res as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }
  ).usageMetadata;
  return {
    texto,
    uso: {
      tokensEntrada: uso?.promptTokenCount ?? 0,
      tokensSaida: uso?.candidatesTokenCount ?? 0,
    },
  };
}

// ——— listagem de modelos (o teste de conexão do assistente — doc 11 §6.3) ———

export type ContextoLista = ContextoChamada;

export async function listarModelos(ctx: ContextoLista): Promise<string[]> {
  switch (ctx.provedor.dialecto) {
    case "openai": {
      const { status, corpo } = await lancar(`${ctx.baseUrl}/models`, {
        method: "GET",
        headers: cabecalhosBase(ctx),
      });
      if (status < 200 || status >= 300) throw erroDeStatus(status, corpo);
      const ids = (corpo as { data?: { id?: string }[] })?.data ?? [];
      return ids.map((x) => x.id).filter((x): x is string => !!x);
    }
    case "anthropic": {
      const { status, corpo } = await lancar(`${ctx.baseUrl}/v1/models`, {
        method: "GET",
        headers: cabecalhosBase(ctx),
      });
      if (status < 200 || status >= 300) throw erroDeStatus(status, corpo);
      const ids = (corpo as { data?: { id?: string }[] })?.data ?? [];
      return ids.map((x) => x.id).filter((x): x is string => !!x);
    }
    case "gemini": {
      const url = `${ctx.baseUrl}/v1beta/models?key=${encodeURIComponent(credencial(ctx) ?? "")}`;
      const { status, corpo } = await lancar(url, { method: "GET" });
      if (status < 200 || status >= 300) throw erroDeStatus(status, corpo);
      const nomes = (corpo as { models?: { name?: string }[] })?.models ?? [];
      return nomes
        .map((x) => x.name)
        .filter((x): x is string => !!x)
        .map((x) => x.replace(/^models\//, ""));
    }
  }
}

/** Mensagem de erro humana (doc 11 §7). `modelo` só faz diferença no 404. */
export function textoDoErro(
  falha: unknown,
  fmt: { modelo?: string } = {},
): string {
  const codigo = falha instanceof FalhaAgente ? falha.codigo : null;
  const detalhe = falha instanceof Error ? falha.message : null;
  switch (codigo) {
    case "chave":
      return traduzirAgora("agente.erro.chave");
    case "sessao":
      return traduzirAgora("agente.erro.sessao");
    case "cota":
      return traduzirAgora("agente.erro.cota");
    case "modelo":
      return traduzirAgora("agente.erro.modelo", { modelo: fmt.modelo ?? "?" });
    case "escopo":
      return traduzirAgora("agente.erro.escopo");
    case "resposta":
      return traduzirAgora("agente.erro.resposta");
    case "rede":
    case "provedor":
      if (detalhe && /network|offline|econnrefused|failed/i.test(detalhe)) {
        return traduzirAgora("agente.erro.rede");
      }
      return traduzirAgora("agente.erro.provedor");
    default:
      return traduzirAgora("agente.erro.provedor");
  }
}
