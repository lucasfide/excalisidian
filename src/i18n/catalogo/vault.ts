// Textos do domínio "vault": criação de vault (doc 12 §2 / doc 04 §13), consumidos por
// `DialogoCriarVault`, `TelaBoasVindas` e `mensagensErroVault.ts`. Fatia de `catalogo.ts` —
// ver o comentário de topo dele para as regras gerais (fonte da verdade, queda pro
// português, redação). Também abriga os rótulos do painel lateral (`painelLateral.*`):
// `CabecalhoPainelLateral`, `PainelLateral`, `PainelTarefas` e `App.tsx`.

export const PT_BR_VAULT = {
  "vault.erro.nomeVazio": "Dê um nome ao vault.",
  "vault.erro.nomeInvalido":
    'O nome não pode ter / \\ : * ? " < > | nem começar com ponto.',
  "vault.erro.existe": "Já existe uma pasta com esse nome nesse local.",
  "vault.erro.paiIndisponivel": "Não foi possível acessar o local escolhido.",
  "vault.erroAbrir.titulo": "Não foi possível abrir o vault",
  "vault.erroAbrir.pastaNaoEncontrada":
    "A pasta do vault «{nome}» não foi encontrada. Ela pode ter sido movida, renomeada ou " +
    "estar num lugar indisponível agora, como o OneDrive ou um HD externo. Escolha um vault " +
    "abaixo ou abra a pasta onde ele está.",
  "vault.erroAbrir.generico":
    "Algo impediu a abertura do vault. Tente de novo ou escolha outro vault abaixo.",
  "painelLateral.agente": "Agente",
  "painelLateral.tarefas": "Tarefas",
  "painelLateral.rotulo": "Painel lateral",
  "painelLateral.colapsar": "Colapsar painel lateral",
  "painelLateral.expandir": "Expandir painel lateral",
  "painelLateral.largura": "Largura do painel lateral",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_VAULT: Partial<Record<keyof typeof PT_BR_VAULT, string>> = {
  "vault.erro.nomeVazio": "Give the vault a name.",
  "vault.erro.nomeInvalido":
    'The name cannot contain / \\ : * ? " < > | or start with a dot.',
  "vault.erro.existe": "A folder with this name already exists here.",
  "vault.erro.paiIndisponivel": "Could not access the chosen location.",
  "vault.erroAbrir.titulo": "Couldn't open the vault",
  "vault.erroAbrir.pastaNaoEncontrada":
    "The vault folder «{nome}» wasn't found. It may have been moved, renamed, or be somewhere " +
    "unavailable right now, like OneDrive or an external drive. Choose a vault below or open " +
    "the folder where it is.",
  "vault.erroAbrir.generico":
    "Something kept the vault from opening. Try again or choose another vault below.",
  "painelLateral.agente": "Agent",
  "painelLateral.tarefas": "Tasks",
  "painelLateral.rotulo": "Side panel",
  "painelLateral.colapsar": "Collapse side panel",
  "painelLateral.expandir": "Expand side panel",
  "painelLateral.largura": "Side panel width",
};
