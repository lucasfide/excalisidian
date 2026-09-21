// Textos do domínio "agente": `DialogoAgente` (assistente de configuração) e `PainelAgente`
// (medidor de uso e mensagens de erro). Fatia de `catalogo.ts` — ver o comentário de topo
// dele para as regras gerais (fonte da verdade, queda pro português, redação).

export const PT_BR_AGENTE = {
  "agente.erro.sessao": "Entre na sua conta do Excalisidian para usar a IA incluída no plano.",
  "agente.creditos.restantes": "{restantes} créditos restantes",
  "agente.creditos.acabando": "Seus créditos estão acabando.",
  "agente.creditos.esgotado": "Seus créditos deste mês acabaram. A cota renova em {data}.",
  "agente.passo.conta": "Conta",
  "agente.passo.contaExplicacao":
    "A IA do Excalisidian usa a sua conta. Não é preciso chave de API.",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_AGENTE: Partial<Record<keyof typeof PT_BR_AGENTE, string>> = {
  "agente.erro.sessao": "Sign in to your Excalisidian account to use the AI included in your plan.",
  "agente.creditos.restantes": "{restantes} credits left",
  "agente.creditos.acabando": "You are running low on credits.",
  "agente.creditos.esgotado": "You are out of credits for this month. Your quota renews on {data}.",
  "agente.passo.conta": "Account",
  "agente.passo.contaExplicacao": "Excalisidian AI uses your account. No API key needed.",
};
