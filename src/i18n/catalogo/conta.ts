// Textos do domínio "conta": seção "Conta" em `DialogoPreferencias`. Fatia de `catalogo.ts`
// — ver o comentário de topo dele para as regras gerais (fonte da verdade, queda pro
// português, redação).

export const PT_BR_CONTA = {
  "beta.selo": "Beta",
  "beta.titulo": "Serviços online em beta",
  "beta.texto":
    "Conta, IA do Excalisidian e sincronização em nuvem ainda estão em teste e chegam numa próxima versão. Suas notas e desenhos continuam funcionando normalmente neste computador.",
  "beta.curto": "Em beta. Chega numa próxima versão.",
  "conta.titulo": "Conta",
  "conta.carregando": "Verificando sua conta…",
  "conta.descricaoDeslogado":
    "Entrar é opcional. O Excalisidian funciona inteiro sem conta, offline.",
  "conta.email": "E-mail",
  "conta.senha": "Senha",
  "conta.entrar": "Entrar",
  "conta.criar": "Criar conta",
  "conta.jaTenhoConta": "Já tenho conta",
  "conta.sair": "Sair",
  "conta.conectadoComo": "Conectado como {email}",
  "conta.plano.gratis": "Plano grátis",
  "conta.plano.premium": "Plano premium",
  "conta.erro.credenciais": "E-mail ou senha não conferem.",
  "conta.erro.emailEmUso": "Já existe uma conta com esse e-mail.",
  "conta.erro.senhaCurta": "Use pelo menos 12 caracteres.",
  "conta.erro.rede": "Não foi possível falar com o servidor. Verifique a conexão.",
  "conta.erro.servidor": "O servidor respondeu de um jeito inesperado. Tente de novo.",
  "conta.erro.expirada": "Sua sessão expirou. Entre de novo.",
  // Decisão 8 do plano ADR-39: visível só no modo "criar conta" (ADR-33).
  "conta.avisoCriar":
    "Sua senha também protege as notas sincronizadas e não pode ser recuperada — nem por nós. As notas neste computador continuam a salvo. Guarde a senha num gerenciador de senhas.",
  // Aceite dos termos no modo "criar conta": a frase é montada em pedaços porque os dois nomes
  // são links (LinksLegais.tsx). "legal.*" também serve à seção Licenças e créditos.
  "conta.termos.antes": "Ao criar a conta, você concorda com os ",
  "conta.termos.meio": " e a ",
  "conta.termos.depois": ".",
  "legal.termos": "Termos de uso",
  "legal.privacidade": "Política de privacidade",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_CONTA: Partial<Record<keyof typeof PT_BR_CONTA, string>> = {
  "beta.selo": "Beta",
  "beta.titulo": "Online services in beta",
  "beta.texto":
    "Account, Excalisidian AI and cloud sync are still being tested and will arrive in a future version. Your notes and drawings keep working normally on this computer.",
  "beta.curto": "In beta. Coming in a future version.",
  "conta.titulo": "Account",
  "conta.carregando": "Checking your account…",
  "conta.descricaoDeslogado":
    "Signing in is optional. Excalisidian works fully offline, without an account.",
  "conta.email": "Email",
  "conta.senha": "Password",
  "conta.entrar": "Sign in",
  "conta.criar": "Create account",
  "conta.jaTenhoConta": "I already have an account",
  "conta.sair": "Sign out",
  "conta.conectadoComo": "Signed in as {email}",
  "conta.plano.gratis": "Free plan",
  "conta.plano.premium": "Premium plan",
  "conta.erro.credenciais": "Email or password do not match.",
  "conta.erro.emailEmUso": "An account with this email already exists.",
  "conta.erro.senhaCurta": "Use at least 12 characters.",
  "conta.erro.rede": "Could not reach the server. Check your connection.",
  "conta.erro.servidor": "The server responded unexpectedly. Try again.",
  "conta.erro.expirada": "Your session expired. Sign in again.",
  "conta.avisoCriar":
    "Your password also protects your synced notes and cannot be recovered — not even by us. Notes on this computer remain safe. Store your password in a password manager.",
  "conta.termos.antes": "By creating an account, you agree to the ",
  "conta.termos.meio": " and the ",
  "conta.termos.depois": ".",
  "legal.termos": "Terms of use",
  "legal.privacidade": "Privacy policy",
};
