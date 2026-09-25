// Textos do domínio "sincronização": seção "Sincronização" em `DialogoPreferencias`
// (`SecaoSincronizacao.tsx`) e o `title` do ícone de estado no rodapé da sidebar (plano 10
// Task 5, `StatusSync` em `src/estado/syncStore.ts`). Fatia de `catalogo.ts` — ver o
// comentário de topo dele para as regras gerais (fonte da verdade, queda pro português,
// redação).
//
// Fonte dos textos: doc 04 §17 — cópia literal. Sentence case, sem emoji, sem os termos
// técnicos do doc 17 ("envelope", "hash", "retrato"): a pessoa não precisa saber como o
// diário funciona por dentro. Chaves que doc 04 não lista (título da seção, rótulos de apoio
// da lista "Baixar um vault") seguem a mesma redação, mas não são cópia de uma linha do doc.

export const PT_BR_SYNC = {
  "sync.titulo": "Sincronização",
  "sync.semConta": "Entre com uma conta premium para sincronizar este vault entre computadores.",
  "sync.gratis": "A sincronização é um recurso do plano premium.",
  "sync.senha.titulo": "Confirme sua senha",
  "sync.senha.ajuda": "Guardamos uma chave neste computador para não pedir de novo.",
  "sync.senha.confirmar": "Confirmar",
  "sync.erro.senhaIncorreta": "Senha incorreta.",
  "sync.acao.sincronizarEsteVault": "Sincronizar este vault",
  "sync.acao.baixarVault": "Baixar um vault sincronizado para uma pasta vazia",
  "sync.erro.pastaNaoVazia": "Escolha uma pasta vazia para baixar o vault.",
  "sync.baixar.tituloLista": "Escolha um vault para baixar",
  "sync.baixar.semVaults": "Nenhum vault sincronizado nesta conta.",
  "sync.acao.sincronizarAgora": "Sincronizar agora",
  "sync.acao.parar": "Parar de sincronizar este vault",
  "sync.acao.apagarServidor": "Apagar a cópia do servidor…",
  "sync.confirmarApagar.titulo": "Apagar a cópia de «{vault}» no servidor?",
  "sync.confirmarApagar.corpo":
    "Os arquivos deste e de qualquer outro computador continuam intactos. Só a cópia guardada no servidor é apagada.",
  "sync.confirmarApagar.botao": "Apagar cópia do servidor",
  "sync.nomeComputador": "Nome deste computador",
  "sync.foraDaSincronizacao.titulo": "Fora da sincronização",
  "sync.foraDaSincronizacao.ajuda": "Estes arquivos passam de 7 MB e ficam só neste computador.",
  "sync.status.sincronizado": "Sincronizado",
  "sync.status.sincronizando": "Sincronizando…",
  "sync.status.semConexao": "Sem conexão. Tentando de novo sozinho.",
  "sync.status.pausado": "Sincronização pausada.",
  "sync.erro.sessao": "Sua sessão expirou. Entre de novo para continuar sincronizando.",
  "sync.erro.plano": "Seu plano não inclui mais a sincronização.",
  "sync.erro.espaco":
    "O espaço do seu plano acabou. Libere espaço ou amplie o plano para continuar sincronizando.",
  "sync.erro.generico": "Não foi possível sincronizar agora. Tentando de novo sozinho.",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_SYNC: Partial<Record<keyof typeof PT_BR_SYNC, string>> = {
  "sync.titulo": "Sync",
  "sync.semConta": "Sign in with a premium account to sync this vault across computers.",
  "sync.gratis": "Sync is a premium plan feature.",
  "sync.senha.titulo": "Confirm your password",
  "sync.senha.ajuda": "We store a key on this computer so we don't have to ask again.",
  "sync.senha.confirmar": "Confirm",
  "sync.erro.senhaIncorreta": "Incorrect password.",
  "sync.acao.sincronizarEsteVault": "Sync this vault",
  "sync.acao.baixarVault": "Download a synced vault into an empty folder",
  "sync.erro.pastaNaoVazia": "Choose an empty folder to download the vault into.",
  "sync.baixar.tituloLista": "Choose a vault to download",
  "sync.baixar.semVaults": "No synced vault on this account.",
  "sync.acao.sincronizarAgora": "Sync now",
  "sync.acao.parar": "Stop syncing this vault",
  "sync.acao.apagarServidor": "Delete the copy on the server…",
  "sync.confirmarApagar.titulo": "Delete the copy of «{vault}» on the server?",
  "sync.confirmarApagar.corpo":
    "The files on this and any other computer stay intact. Only the copy stored on the server is deleted.",
  "sync.confirmarApagar.botao": "Delete server copy",
  "sync.nomeComputador": "This computer's name",
  "sync.foraDaSincronizacao.titulo": "Not synced",
  "sync.foraDaSincronizacao.ajuda": "These files are over 7 MB and stay only on this computer.",
  "sync.status.sincronizado": "Synced",
  "sync.status.sincronizando": "Syncing…",
  "sync.status.semConexao": "No connection. Retrying on its own.",
  "sync.status.pausado": "Sync paused.",
  "sync.erro.sessao": "Your session expired. Sign in again to keep syncing.",
  "sync.erro.plano": "Your plan no longer includes sync.",
  "sync.erro.espaco": "Your plan's storage is full. Free up space or upgrade your plan to keep syncing.",
  "sync.erro.generico": "Could not sync right now. Retrying on its own.",
};
