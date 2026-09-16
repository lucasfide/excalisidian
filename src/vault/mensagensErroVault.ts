// Mensagens de erro de `criarVault` (doc 12 §2 / doc 04 §13), pelo código que o Rust devolve
// em `Error.message`. Compartilhado por `DialogoCriarVault` (sidebar) e `TelaBoasVindas`
// (onboarding, doc 15 §1.1) — mesmo texto, um lugar só.

export const MENSAGENS_ERRO_VAULT: Record<string, string> = {
  nome_vazio: "Dê um nome ao vault.",
  nome_invalido: 'O nome não pode ter / \\ : * ? " < > | nem começar com ponto.',
  existe: "Já existe uma pasta com esse nome nesse local.",
  pai_indisponivel: "Não foi possível acessar o local escolhido.",
};
