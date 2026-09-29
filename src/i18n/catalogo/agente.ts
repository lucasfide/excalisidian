// Textos do domínio "agente": `DialogoAgente` (assistente de configuração) e `PainelAgente`
// (medidor de uso e mensagens de erro). Fatia de `catalogo.ts` — ver o comentário de topo
// dele para as regras gerais (fonte da verdade, queda pro português, redação).

export const PT_BR_AGENTE = {
  "agente.erro.chave": "A chave da API foi recusada pelo provedor. Confira a chave nas configurações.",
  "agente.erro.sessao": "Entre na sua conta do Excalisidian para usar a IA incluída no plano.",
  "agente.erro.plano": "A IA do Excalisidian faz parte do plano premium. Sua conta está no plano grátis.",
  "agente.erro.cota": "O provedor limitou as chamadas agora. Tente de novo em instantes.",
  "agente.erro.creditos": "Seus créditos de IA deste mês acabaram.",
  "agente.erro.instavel": "A IA do Excalisidian está instável agora. Tente de novo em instantes.",
  "agente.erro.limite": "Muitos pedidos seguidos. Espere um minuto.",
  "agente.erro.tamanho": "Esta conversa ficou grande demais. Limpe a conversa para continuar.",
  "agente.erro.mensagemLonga": "Mensagem longa demais para o agente (máximo de 100 mil caracteres).",
  "agente.erro.modelo":
    "O provedor não conhece o modelo «{modelo}». Confira o nome nas configurações.",
  "agente.erro.escopo":
    "A base URL configurada está fora das permissões do app. Verifique o campo avançado nas configurações.",
  "agente.erro.resposta": "O provedor devolveu uma resposta que não pude entender. Tente outro modelo.",
  "agente.erro.rede": "Sem conexão com o provedor. Verifique a rede e tente de novo.",
  "agente.erro.provedor": "Não foi possível falar com o provedor. Verifique a conexão.",
  "agente.creditos.restantes": "{restantes} créditos restantes",
  "agente.creditos.restante": "1 crédito restante",
  "agente.creditos.acabando": "Seus créditos estão acabando.",
  "agente.creditos.esgotado": "Seus créditos deste mês acabaram. A cota renova em {data}.",
  "agente.passo.provedor": "Provedor",
  "agente.passo.chave": "Chave da API",
  "agente.passo.leituraInicial": "Leitura inicial",
  "agente.passo.acompanhamento": "Acompanhamento",
  "agente.passo.revisao": "Revisão",
  "agente.passo.conta": "Conta",
  "agente.passo.contaExplicacao":
    "A IA do Excalisidian usa a sua conta. Não é preciso chave de API.",
  "agente.passo.contaCarregando": "Verificando sua conta…",
  "agente.passo.abrirConta": "Entrar na conta",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_AGENTE: Partial<Record<keyof typeof PT_BR_AGENTE, string>> = {
  "agente.erro.chave": "The API key was rejected by the provider. Check the key in settings.",
  "agente.erro.sessao": "Sign in to your Excalisidian account to use the AI included in your plan.",
  "agente.erro.plano": "Excalisidian AI is part of the premium plan. Your account is on the free plan.",
  "agente.erro.cota": "The provider is rate-limiting calls right now. Try again in a moment.",
  "agente.erro.creditos": "You are out of AI credits for this month.",
  "agente.erro.instavel": "Excalisidian AI is unstable right now. Try again in a moment.",
  "agente.erro.limite": "Too many requests in a row. Wait a minute.",
  "agente.erro.tamanho": "This conversation got too large. Clear it to continue.",
  "agente.erro.mensagemLonga": "Message too long for the agent (100k characters maximum).",
  "agente.erro.modelo":
    "The provider does not recognize the model \"{modelo}\". Check the name in settings.",
  "agente.erro.escopo":
    "The configured base URL is outside the app's allowed scope. Check the advanced field in settings.",
  "agente.erro.resposta": "The provider returned a response I could not understand. Try another model.",
  "agente.erro.rede": "No connection to the provider. Check your network and try again.",
  "agente.erro.provedor": "Could not reach the provider. Check your connection.",
  "agente.creditos.restantes": "{restantes} credits left",
  "agente.creditos.restante": "1 credit left",
  "agente.creditos.acabando": "You are running low on credits.",
  "agente.creditos.esgotado": "You are out of credits for this month. Your quota renews on {data}.",
  "agente.passo.provedor": "Provider",
  "agente.passo.chave": "API key",
  "agente.passo.leituraInicial": "Initial read",
  "agente.passo.acompanhamento": "Follow-up",
  "agente.passo.revisao": "Review",
  "agente.passo.conta": "Account",
  "agente.passo.contaExplicacao": "Excalisidian AI uses your account. No API key needed.",
  "agente.passo.contaCarregando": "Checking your account…",
  "agente.passo.abrirConta": "Sign in to your account",
};
