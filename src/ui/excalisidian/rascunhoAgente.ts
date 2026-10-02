// Estado do assistente do agente ao trocar de provedor no passo 1. Puro, para poder ser testado
// sem componente. Os modelos salvos na configuração pertencem ao provedor salvo
// (`config.provedor`); para outro provedor voltam a vazio (o passo mostra os sugeridos).

import type { ConfigAgente, ProvedorId } from "../../agente/tipos";
import { MODELO_ACOMPANHAMENTO, MODELO_LEITURA, PROVEDORES } from "../../agente/provedores";

function omitirChave(
  mapa: Partial<Record<ProvedorId, string>>,
  provedor: ProvedorId,
): Partial<Record<ProvedorId, string>> {
  const restante = { ...mapa };
  delete restante[provedor];
  return restante;
}

export interface CamposPorProvedor {
  provedor: ProvedorId;
  chave: string;
  baseUrl: string;
  modeloGateiro: string;
  modeloAssistente: string;
}

export interface CamposRascunhoAgente extends CamposPorProvedor {
  thinking: ConfigAgente["thinking"];
  webSearch: boolean;
  teto: string;
}

/** Escolhe um provedor inicial visível sem trocar o provedor de uma configuração existente. */
export function provedorInicial(
  config: ConfigAgente | null,
  contaDisponivel: boolean,
): ProvedorId {
  const provedorSalvo = config?.provedor;
  if (provedorSalvo && (contaDisponivel || !PROVEDORES.find((p) => p.id === provedorSalvo)?.exigeConta)) {
    return provedorSalvo;
  }
  return contaDisponivel ? "excalisidian" : "openai";
}

/** O assistente próprio termina na tela Conta; os demais preservam as cinco telas existentes. */
export function quantidadeEtapas(exigeConta: boolean): 2 | 5 {
  return exigeConta ? 2 : 5;
}

export function rascunhoInicial(
  config: ConfigAgente | null,
  contaDisponivel: boolean,
): CamposRascunhoAgente {
  const provedor = provedorInicial(config, contaDisponivel);
  const usaConfigSalva = config?.provedor === provedor;
  const proprio = provedor === "excalisidian";
  return {
    provedor,
    chave: "",
    baseUrl: proprio ? "" : config?.baseUrls?.[provedor] ?? "",
    modeloGateiro: proprio
      ? MODELO_LEITURA
      : usaConfigSalva
      ? (config?.modeloGateiro ?? "")
      : "",
    modeloAssistente: proprio
      ? MODELO_ACOMPANHAMENTO
      : usaConfigSalva
      ? (config?.modeloAssistente ?? "")
      : "",
    thinking: proprio ? "padrao" : usaConfigSalva ? (config?.thinking ?? "padrao") : "padrao",
    webSearch: proprio ? false : usaConfigSalva ? (config?.webSearch ?? false) : false,
    teto:
      !proprio && usaConfigSalva && config?.tetoDiarioUsd != null
        ? String(config.tetoDiarioUsd)
        : "",
  };
}

/** Aplica a escolha de `novo`. Escolher o mesmo provedor não muda nada. */
export function trocarProvedor<T extends CamposPorProvedor>(
  atual: T,
  novo: ProvedorId,
  config: ConfigAgente | null,
): T {
  if (novo === atual.provedor) return atual;
  const doSalvo = config?.provedor === novo;
  const proprio = novo === "excalisidian";
  return {
    ...atual,
    provedor: novo,
    // A chave salva já entra em `chaveEfetiva`; o campo só guarda o que foi digitado agora.
    chave: "",
    baseUrl: config?.baseUrls?.[novo] ?? "",
    modeloGateiro: doSalvo ? (config?.modeloGateiro ?? "") : proprio ? MODELO_LEITURA : "",
    modeloAssistente: doSalvo
      ? (config?.modeloAssistente ?? "")
      : proprio
        ? MODELO_ACOMPANHAMENTO
        : "",
  };
}

/** Configuração final normalizada; a IA própria nunca herda opções dos provedores externos. */
export function montarConfigAgente(
  rascunho: CamposRascunhoAgente,
  config: ConfigAgente | null,
  baseUrlLimpa: string,
): ConfigAgente {
  const provedor = PROVEDORES.find((p) => p.id === rascunho.provedor);
  if (!provedor) throw new Error(`provedor desconhecido: ${rascunho.provedor}`);
  const proprio = provedor.exigeConta;
  const tetoNum = proprio || !rascunho.teto.trim()
    ? null
    : Number(rascunho.teto.replace(",", "."));
  return {
    habilitado: true,
    provedor: rascunho.provedor,
    chaves: proprio
      ? omitirChave(config?.chaves ?? {}, rascunho.provedor)
      : {
          ...(config?.chaves ?? {}),
          ...(provedor.precisaChave && rascunho.chave.trim()
            ? { [rascunho.provedor]: rascunho.chave.trim() }
            : {}),
        },
    baseUrls: proprio
      ? omitirChave(config?.baseUrls ?? {}, rascunho.provedor)
      : baseUrlLimpa
        ? { ...(config?.baseUrls ?? {}), [rascunho.provedor]: baseUrlLimpa }
        : (config?.baseUrls ?? {}),
    modeloGateiro: proprio ? MODELO_LEITURA : rascunho.modeloGateiro,
    modeloAssistente: proprio ? MODELO_ACOMPANHAMENTO : rascunho.modeloAssistente,
    thinking: proprio ? "padrao" : rascunho.thinking,
    webSearch: proprio ? false : provedor.suportaWebSearch && rascunho.webSearch,
    tetoDiarioUsd: tetoNum != null && Number.isFinite(tetoNum) ? tetoNum : null,
  };
}
