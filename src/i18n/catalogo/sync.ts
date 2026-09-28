// Textos do domínio "sincronização": a lista "Seus vaults" em `DialogoPreferencias`
// (`SecaoSincronizacao.tsx`, doc 17 §7-8, spec 2026-09-27 §2, plano 12 Task 6) e o `title` do
// ícone de estado no rodapé da sidebar (`StatusSync` em `src/estado/syncStore.ts`). Fatia de
// `catalogo.ts` — ver o comentário de topo dele para as regras gerais (fonte da verdade, queda
// pro português, redação).
//
// Fonte dos textos: doc 04 §17 — cópia literal. Sentence case, sem emoji, sem os termos
// técnicos do doc 17 ("envelope", "hash", "retrato"): a pessoa não precisa saber como o
// diário funciona por dentro. Chaves que doc 04 não lista (título da seção, o texto de cada
// unidade de "{tempo}") seguem a mesma redação, mas não são cópia de uma linha do doc.
//
// Revisão do plano 12 Task 6: a seção deixou de ter os fluxos "Sincronizar este vault" /
// "Baixar um vault sincronizado para uma pasta vazia" — virou a lista "Seus vaults" (doc 17
// §8). As chaves antigas desses dois fluxos saíram (nunca mais referenciadas no código);
// `sync.senha.*` e `sync.erro.senhaIncorreta` continuam, agora usadas pelo bloco "Confirme sua
// senha" inline (não mais um `Dialog` por cima de um botão de ação).

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
  "sync.item.soNuvem": "Só na nuvem",
  "sync.item.pastaNaoEncontrada": "Pasta não encontrada",
  "sync.item.outraSenha":
    "Criado com outra senha. Não é possível abrir com a senha desta conta.",
  "sync.item.semNome": "Vault sem nome",
  "sync.item.conflito": "1 conflito — abra o vault para resolver",
  "sync.item.conflitos": "{n} conflitos — abra o vault para resolver",
  "sync.tempo.agora": "agora mesmo",
  "sync.tempo.minutos": "{n} min",
  "sync.tempo.horas": "{n} h",
  "sync.tempo.dias": "{n} d",
  "sync.acao.abrir": "Abrir",
  "sync.acao.sincronizarAgora": "Sincronizar agora",
  "sync.acao.sincronizar": "Sincronizar",
  "sync.acao.baixarParaEsteComputador": "Baixar para este computador…",
  "sync.acao.pararNesteComputador": "Parar neste computador",
  "sync.acao.apagarDaNuvem": "Apagar da nuvem…",
  "sync.acao.esquecerNesteComputador": "Esquecer neste computador",
  "sync.confirmarApagar.titulo": "Apagar a cópia de «{vault}» no servidor?",
  "sync.confirmarApagar.corpo":
    "Os arquivos deste e de qualquer outro computador continuam intactos. Só a cópia guardada no servidor é apagada.",
  "sync.confirmarApagar.botao": "Apagar cópia do servidor",
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
  "sync.item.soNuvem": "Only in the cloud",
  "sync.item.pastaNaoEncontrada": "Folder not found",
  "sync.item.outraSenha": "Created with another password. Can't open it with this account's password.",
  "sync.item.semNome": "Unnamed vault",
  "sync.item.conflito": "1 conflict — open the vault to resolve it",
  "sync.item.conflitos": "{n} conflicts — open the vault to resolve them",
  "sync.tempo.agora": "just now",
  "sync.tempo.minutos": "{n} min",
  "sync.tempo.horas": "{n} h",
  "sync.tempo.dias": "{n} d",
  "sync.acao.abrir": "Open",
  "sync.acao.sincronizarAgora": "Sync now",
  "sync.acao.sincronizar": "Sync",
  "sync.acao.baixarParaEsteComputador": "Download to this computer…",
  "sync.acao.pararNesteComputador": "Stop on this computer",
  "sync.acao.apagarDaNuvem": "Delete from the cloud…",
  "sync.acao.esquecerNesteComputador": "Forget on this computer",
  "sync.confirmarApagar.titulo": "Delete the copy of «{vault}» on the server?",
  "sync.confirmarApagar.corpo":
    "The files on this and any other computer stay intact. Only the copy stored on the server is deleted.",
  "sync.confirmarApagar.botao": "Delete server copy",
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
