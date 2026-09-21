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
// conta existe desde o plano 03 (contaStore chama `definirTokenDaSessao` em todo
// login/logout/carga inicial), então o provedor próprio pode aparecer no assistente.
export const CONTA_DISPONIVEL = true;
