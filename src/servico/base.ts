// src/servico/base.ts
// Endereço do serviço online do Excalisidian, num lugar só.
//
// Domínio `excalisidian.com`, registrado pelo dono do produto (doc 18 §5). Trocar aqui troca
// em todo o app, mas trocar também exige atualizar o escopo de HTTP em
// src-tauri/capabilities/main.json, senão as chamadas morrem com FalhaAgente("escopo").

export const BASE_URL_SERVICO = "https://api.excalisidian.com/v1";

export function hostDoServico(): string {
  return new URL(BASE_URL_SERVICO).host;
}

/** Conta, IA do Excalisidian e sincronização em nuvem. `false` enquanto estão em beta: o app
 * mostra o aviso de beta no lugar dessas telas e não liga nada que fale com o servidor. */
export const SERVICOS_ONLINE_LIBERADOS = false;
