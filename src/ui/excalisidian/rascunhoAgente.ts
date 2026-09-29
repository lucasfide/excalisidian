// Estado do assistente do agente ao trocar de provedor no passo 1. Puro, para poder ser testado
// sem componente. Os modelos salvos na configuração pertencem ao provedor salvo
// (`config.provedor`); para outro provedor voltam a vazio (o passo mostra os sugeridos).

import type { ConfigAgente, ProvedorId } from "../../agente/tipos";

export interface CamposPorProvedor {
  provedor: ProvedorId;
  chave: string;
  baseUrl: string;
  modeloGateiro: string;
  modeloAssistente: string;
}

/** Aplica a escolha de `novo`. Escolher o mesmo provedor não muda nada. */
export function trocarProvedor<T extends CamposPorProvedor>(
  atual: T,
  novo: ProvedorId,
  config: ConfigAgente | null,
): T {
  if (novo === atual.provedor) return atual;
  const doSalvo = config?.provedor === novo;
  return {
    ...atual,
    provedor: novo,
    // A chave salva já entra em `chaveEfetiva`; o campo só guarda o que foi digitado agora.
    chave: "",
    baseUrl: config?.baseUrls?.[novo] ?? "",
    modeloGateiro: doSalvo ? config.modeloGateiro : "",
    modeloAssistente: doSalvo ? config.modeloAssistente : "",
  };
}
