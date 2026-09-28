// Textos do domínio "sincronização": a lista "Seus vaults" em `DialogoPreferencias`
// (`SecaoSincronizacao.tsx`, doc 17 §7-8, plano 13 Task 2) e o `title` do ícone de estado no
// rodapé da sidebar (`StatusSync` em `src/estado/syncStore.ts`). Fatia de `catalogo.ts` — ver o
// comentário de topo dele para as regras gerais (fonte da verdade, queda pro português,
// redação).
//
// Fonte dos textos: doc 04 §17 — cópia literal. Sentence case, sem emoji, sem os termos
// técnicos do doc 17 ("envelope", "hash", "retrato"): a pessoa não precisa saber como o
// diário funciona por dentro. Chaves que doc 04 não lista (título da seção, o texto de cada
// unidade de "{tempo}") seguem a mesma redação, mas não são cópia de uma linha do doc.
//
// Plano 13 Task 2 (pedido do dono do produto no teste de 29/09/2026): a lista "Seus vaults"
// perdeu as ações "Abrir", "Parar neste computador" e "Esquecer neste computador", e os estados
// "Pasta não encontrada"/"Criado com outra senha" pararam de ser estados PRÓPRIOS ("outra senha"
// virou um aviso sobre o estado sincronizado/na nuvem, não um estado à parte; uma pasta sumida
// nunca é esquecida sozinha — revisão pós-commit a4ce75f — e o vault aparece como "Na nuvem"). A
// legenda da situação continua na tela (`sync.item.soLocal`/`sync.item.soNuvem`) — é a coluna
// "Situação" da tabela do doc 17 §8, não uma dedução por cor/botão. As chaves das três ações
// removidas saíram do catálogo; `sync.senha.*` e `sync.erro.senhaIncorreta` continuam, usadas
// pelo bloco "Confirme sua senha" inline.

export const PT_BR_SYNC = {
  "sync.titulo": "Sincronização",
  "sync.semConta": "Entre com uma conta premium para sincronizar este vault entre computadores.",
  "sync.gratis": "A sincronização é um recurso do plano premium.",
  "sync.pedirSenha.aviso": "Confirme sua senha para sincronizar neste computador.",
  "sync.senha.titulo": "Confirme sua senha",
  "sync.senha.ajuda": "Guardamos uma chave neste computador para não pedir de novo.",
  "sync.senha.confirmar": "Confirmar",
  "sync.erro.senhaIncorreta": "Senha incorreta.",
  "sync.nomeComputador": "Nome deste computador",
  "sync.lista.titulo": "Seus vaults",
  "sync.lista.rodape":
    "Os vaults sincronizados atualizam sozinhos enquanto o app está aberto.",
  "sync.lista.vazio": "Nenhum vault ainda.",
  "sync.item.sincronizadoHa": "Sincronizado há {tempo}",
  "sync.item.soLocal": "Só neste computador",
  "sync.item.soNuvem": "Na nuvem",
  "sync.item.outraSenha": "Este vault foi criado com outra senha e não abre com esta conta.",
  "sync.item.semNome": "Vault sem nome",
  "sync.item.conflito": "1 conflito — abra o vault para resolver",
  "sync.item.conflitos": "{n} conflitos — abra o vault para resolver",
  "sync.tempo.agora": "agora mesmo",
  "sync.tempo.minutos": "{n} min",
  "sync.tempo.horas": "{n} h",
  "sync.tempo.dias": "{n} d",
  "sync.acao.sincronizarAgora": "Sincronizar agora",
  "sync.acao.sincronizar": "Sincronizar",
  "sync.acao.baixarParaEsteComputador": "Baixar…",
  "sync.acao.apagarDaNuvem": "Apagar",
  "sync.confirmarApagar.titulo": "Apagar «{vault}» da nuvem?",
  "sync.confirmarApagar.corpo":
    "Os arquivos continuam em todos os computadores; só a cópia da nuvem e a sincronização são removidas.",
  "sync.confirmarApagar.botao": "Apagar",
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
  "sync.pedirSenha.aviso": "Confirm your password to sync on this computer.",
  "sync.senha.titulo": "Confirm your password",
  "sync.senha.ajuda": "We store a key on this computer so we don't have to ask again.",
  "sync.senha.confirmar": "Confirm",
  "sync.erro.senhaIncorreta": "Incorrect password.",
  "sync.nomeComputador": "This computer's name",
  "sync.lista.titulo": "Your vaults",
  "sync.lista.rodape": "Synced vaults update on their own while the app is open.",
  "sync.lista.vazio": "No vaults yet.",
  "sync.item.sincronizadoHa": "Synced {tempo} ago",
  "sync.item.soLocal": "Only on this computer",
  "sync.item.soNuvem": "In the cloud",
  "sync.item.outraSenha": "This vault was created with another password and can't be opened with this account.",
  "sync.item.semNome": "Unnamed vault",
  "sync.item.conflito": "1 conflict — open the vault to resolve it",
  "sync.item.conflitos": "{n} conflicts — open the vault to resolve them",
  "sync.tempo.agora": "just now",
  "sync.tempo.minutos": "{n} min",
  "sync.tempo.horas": "{n} h",
  "sync.tempo.dias": "{n} d",
  "sync.acao.sincronizarAgora": "Sync now",
  "sync.acao.sincronizar": "Sync",
  "sync.acao.baixarParaEsteComputador": "Download…",
  "sync.acao.apagarDaNuvem": "Delete",
  "sync.confirmarApagar.titulo": "Delete «{vault}» from the cloud?",
  "sync.confirmarApagar.corpo":
    "The files stay on every computer; only the cloud copy and its sync are removed.",
  "sync.confirmarApagar.botao": "Delete",
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
