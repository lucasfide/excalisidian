// src/servico/base.ts
// Endereço do serviço online do Excalisidian, num lugar só.
//
// ATENÇÃO: o domínio ainda NÃO está fechado — é pendência declarada do estudo de
// viabilidade (nome comercial e domínio). Trocar aqui troca em todo o app, mas trocar
// também exige atualizar o escopo de HTTP em src-tauri/capabilities/main.json, senão as
// chamadas morrem com FalhaAgente("escopo").

export const BASE_URL_SERVICO = "https://api.excalisidian.app/v1";

export function hostDoServico(): string {
  return new URL(BASE_URL_SERVICO).host;
}

// Chave única que liga o provedor de IA autenticado por conta na interface. A tela de
// conta ainda não existe (nenhum lugar no app chama `definirTokenDaSessao` hoje), então
// qualquer provedor com `exigeConta` fica escondido do assistente enquanto isto for
// `false`. Vira `true` quando a tela de conta for construída.
export const CONTA_DISPONIVEL = false;
