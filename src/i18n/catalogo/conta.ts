// Textos do domínio "conta": seção "Conta" em `DialogoPreferencias`. Fatia de `catalogo.ts`
// — ver o comentário de topo dele para as regras gerais (fonte da verdade, queda pro
// português, redação).

export const PT_BR_CONTA = {
  "conta.titulo": "Conta",
  "conta.carregando": "Verificando sua conta…",
  "conta.descricaoDeslogado":
    "Entrar é opcional. O Excalisidian funciona inteiro sem conta, offline.",
  "conta.email": "E-mail",
  "conta.senha": "Senha",
  "conta.entrar": "Entrar",
  "conta.criar": "Criar conta",
  "conta.sair": "Sair",
  "conta.conectadoComo": "Conectado como {email}",
  "conta.plano.gratis": "Plano grátis",
  "conta.plano.premium": "Plano premium",
  "conta.erro.credenciais": "E-mail ou senha não conferem.",
  "conta.erro.emailEmUso": "Já existe uma conta com esse e-mail.",
  "conta.erro.rede": "Não foi possível falar com o servidor. Verifique a conexão.",
  "conta.erro.servidor": "O servidor respondeu de um jeito inesperado. Tente de novo.",
  "conta.erro.expirada": "Sua sessão expirou. Entre de novo.",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_CONTA: Partial<Record<keyof typeof PT_BR_CONTA, string>> = {
  "conta.titulo": "Account",
  "conta.carregando": "Checking your account…",
  "conta.descricaoDeslogado":
    "Signing in is optional. Excalisidian works fully offline, without an account.",
  "conta.email": "Email",
  "conta.senha": "Password",
  "conta.entrar": "Sign in",
  "conta.criar": "Create account",
  "conta.sair": "Sign out",
  "conta.conectadoComo": "Signed in as {email}",
  "conta.plano.gratis": "Free plan",
  "conta.plano.premium": "Premium plan",
  "conta.erro.credenciais": "Email or password do not match.",
  "conta.erro.emailEmUso": "An account with this email already exists.",
  "conta.erro.rede": "Could not reach the server. Check your connection.",
  "conta.erro.servidor": "The server responded unexpectedly. Try again.",
  "conta.erro.expirada": "Your session expired. Sign in again.",
};
