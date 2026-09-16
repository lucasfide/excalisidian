# 15 — Onboarding: nome e primeiro vault

Plano de implementação. Este documento é o contrato entre as tarefas O1–O4 — nomes, textos e
comportamento saem daqui.

## 0. Ponto de partida (16/09/2026)

- **Nome.** Nunca é perguntado. A saudação da Home (`PainelInicio.tsx`) usa
  `obterPrimeiroNomeUsuario()` (`src/app/sistemaOperacional.ts`), que lê `USERNAME` do Windows
  pelo comando Rust `nome_usuario` e corta em espaço/ponto/hífen/underscore. Usuário
  `LucasFidelisdeCristo` vira "Lucasfidelisdecristo". Não há onde corrigir.
- **Primeiro boot.** `App.tsx`, estado `sem-vault`: `EstadoVazio` "Nenhum vault aberto" com
  "Criar vault" / "Abrir pasta". Sem marca, sem explicar o que é um vault.
- **Criar vault** (`DialogoCriarVault.tsx`): nome e local vazios; o botão fica desabilitado até
  escolher uma pasta pelo diálogo nativo. Nenhuma sugestão.
- **Depois de criar:** vault vazio, Home com a saudação errada.

Decisões do usuário (16/09/2026):

- **Uma tela só** (sem passos): marca, nome e primeiro vault na mesma página.
- **Sugestão pronta** para o vault: nome e local preenchidos, um clique cria.
- **Conteúdo de exemplo:** o vault criado no onboarding já vem com **uma nota de boas-vindas e
  um desenho de exemplo** linkado a ela.
- **Quem já usa o app** e nunca informou o nome: **não é interrompido**. O campo fica nas
  Configurações; até lá, a saudação sai **sem nome** (o usuário do Windows deixa de ser usado
  na saudação).
- Lettering da marca na tela: **32px** de altura.

## 1. Experiência

### 1.1 Tela de boas-vindas

Substitui a tela `sem-vault` do `App.tsx` (inclusive quando uma janela nova abre sem vault).

```
            [lettering Excalisidian, 32px]

  Vamos começar                                     ← display-2 (só no primeiro uso)
  Notas em Markdown e desenhos no mesmo lugar, em arquivos que são seus.

  Como podemos te chamar?                            ← só se o nome nunca foi informado
  [ Lucas                                      ]
  Aparece na saudação da tela de início. Dá para mudar nas Configurações.

  Seu primeiro vault                                 ← titulo-3
  Um vault é uma pasta comum do seu computador. Suas notas e desenhos
  ficam nela como arquivos .md.
  Nome   [ Notas                               ]
  Local  C:\Users\…\Documents            [Escolher…]
         C:\Users\…\Documents\Notas              ← meta, caminho final

  [Criar e começar]

  Já tenho uma pasta com notas  [Abrir pasta]

  RECENTES                                           ← só se houver recentes
  Trabalho
  Estudos
```

**Primeiro uso vs. retorno.** "Primeiro uso" = lista de recentes vazia. No retorno (janela nova
sem vault, vault que sumiu), o título é "Nenhum vault aberto", a seção se chama "Criar vault" e
a frase de explicação do vault não aparece. O resto é igual.

**Nome.**
- O campo só aparece se o nome **nunca foi informado** (`nomeUsuario === null`).
- Vem preenchido com a sugestão do sistema (§2.1 `sugerirNomeUsuario`), editável. Pode ficar
  vazio: a saudação sai sem nome.
- É gravado quando o usuário segue em frente ("Criar e começar", "Abrir pasta" ou um recente) —
  vazio grava `""`, que significa "informado, sem nome", e o campo não volta a aparecer.

**Vault.**
- Nome padrão "Notas". Local padrão: pasta Documentos do usuário (`documentDir()` do Tauri).
  Se não der para ler, local vazio e "Criar e começar" desabilitado até escolher.
- A linha do caminho final (`local` + separador + `nome`) atualiza enquanto digita.
- Erros inline sob o campo Nome, pelos códigos que o Rust já devolve (`nome_vazio`,
  `nome_invalido`, `existe`, `pai_indisponivel`) com os textos que já existem no doc 04.
- Enter no campo Nome do vault confirma.

**"Criar e começar".**
1. Grava o nome (se o campo estava visível).
2. Cria a pasta (`criarVault`).
3. Abre o vault nesta janela (mesmo caminho de hoje: `TauriVaultAdapter.abrir` +
   `abrirNestaJanela` + `definirAdapter` + `aoAbrirVault`).
4. Cria o conteúdo de exemplo (§1.3).
5. Abre a nota "Boas-vindas" numa aba (a Home continua existindo, fixa).

Botão com estado de carregando durante 2–5. Se o passo 4 falhar, o vault abre mesmo assim e um
toast avisa: "O vault foi criado, mas não foi possível criar a nota de boas-vindas.".

**"Abrir pasta".** Grava o nome, abre o diálogo nativo, abre a pasta como vault nesta janela. Sem
conteúdo de exemplo — a pasta é do usuário.

**Recentes.** Como hoje: abre nesta janela; pasta sumida → toast com "Remover da lista".

**Erro de abertura.** Estado `{ erro }` do `App.tsx`: mesma tela, com o título "Não foi possível
abrir o vault" e a mensagem em `tom="erro"` no lugar do subtítulo, sem o campo de nome.

### 1.2 Nome nas Configurações e na Home

- `DialogoPreferencias`: seção nova "Seu nome", primeira da lista, com `Campo` rótulo "Nome" e
  ajuda "Aparece na saudação da tela de início.". Grava ao sair do campo e no Enter.
- Home: saudação usa só o nome informado. `null` ou `""` → só "Boa tarde". Nunca mais o usuário
  do Windows.
- O "Criar vault…" do seletor da sidebar (`DialogoCriarVault`) **não** muda e **não** cria
  conteúdo de exemplo: só o primeiro vault, pelo onboarding.

### 1.3 Conteúdo de exemplo

Dois arquivos na raiz do vault novo, gravados pelo `VaultAdapter` (escrita atômica), em
conformidade com o doc 02:

- **`Boas-vindas.md`** — H1 "Boas-vindas". Curta (cabe numa tela), em português, sentence case, sem
  emoji. Conteúdo:
  - uma frase sobre o vault ser uma pasta de arquivos `.md` comuns;
  - o link `[[Primeiro desenho.draw]]` e o embed `![[Primeiro desenho.draw]]`;
  - como criar link (`[[`), busca (`Ctrl+O`), paleta de comandos (`Ctrl+P`), tarefas (`Ctrl+\`);
  - uma lista de tarefas de exemplo em markdown (`- [ ] Criar a primeira nota`, etc.);
  - uma frase dizendo que dá para apagar esta nota e o desenho à vontade.
- **`Primeiro desenho.draw.md`** — desenho válido pelo formato do doc 02 §3 (`serializarDesenho`):
  um retângulo com o texto "Ideia", uma seta ligando a uma elipse com o texto "Nota", e um texto
  solto "Desenhe à vontade". Cores do traço e do texto de `lerPaletaCanvas()`
  (`canvas/paletaCanvas.ts`) — nunca hex literal. O texto dos elementos aparece em
  `## Text Elements` (busca e backlink funcionam).

Os dois nomes usam `caminhoLivre` só por robustez (a pasta é nova, na prática não colide).

## 2. Contratos de código

### 2.1 Nome (O1)

`src/estado/prefsStore.ts`:

```ts
nomeUsuario: string | null;               // null = nunca informado
definirNomeUsuario(nome: string): void;    // trim; grava em settings.json, chave "nomeUsuario"; emite app://prefs-mudou
```

`src/app/sistemaOperacional.ts`:

```ts
/** Sugestão de primeiro nome a partir do usuário do SO: separa espaço, ponto, hífen,
 * underscore E fronteira camelCase ("LucasFidelisdeCristo" → "Lucas"); capitaliza; "" se falhar. */
export async function sugerirNomeUsuario(): Promise<string>;
export function primeiroNomeDe(bruto: string): string;  // puro, testado
```

`obterPrimeiroNomeUsuario` deixa de existir (ou vira alias de `sugerirNomeUsuario`, sem uso na
Home). `PainelInicio.tsx` lê `usePrefsStore((s) => s.nomeUsuario) ?? ""`.
`DialogoPreferencias.tsx`: seção "Seu nome" (§1.2).

### 2.2 Conteúdo de exemplo (O2)

`src/vault/conteudoInicial.ts` (+ teste):

```ts
export const NOME_NOTA_BOAS_VINDAS = "Boas-vindas";
export const NOME_DESENHO_EXEMPLO = "Primeiro desenho";
export function textoNotaBoasVindas(): string;                  // puro
export function textoDesenhoExemplo(paleta: PaletaCanvas): string; // puro, usa serializarDesenho
/** Grava os dois arquivos no vault aberto e devolve o caminho da nota. */
export async function criarConteudoInicial(): Promise<string>;
```

Testes: nota tem H1 "Boas-vindas" e o link/embed; desenho passa em `ehDesenho` e
`parseDesenho` (round-trip), tem os textos em Text Elements, nenhum hex literal no fonte.
`criarConteudoInicial` usa `useVaultStore.getState().adapter`, depois `recarregarArvore` e
`reindexarArquivo` dos dois.

### 2.3 Tela (O3)

- `src/ui/excalisidian/TelaBoasVindas.tsx` (novo), apresentação + orquestração da §1.1.
  Props: `erro: string | null`, `recentes: VaultRecente[]`, `onAbrirVault(caminho: string, opcoes?: { conteudoInicial?: boolean }): Promise<void>`,
  `onAbrirPasta(): Promise<void>`, `onAbrirRecente(caminho: string): Promise<void>`.
- `App.tsx`: troca o bloco `sem-vault`/`erro` por `TelaBoasVindas`. Depois de ativar o vault com
  `conteudoInicial`, chama `criarConteudoInicial()` e `abrirDocumento` da nota — como o
  `Workspace` só monta quando `boot === "pronto"`, a abertura da nota precisa esperar a API do
  dockview existir (ex.: guardar o caminho pendente e abrir no `onReady`/quando `api` aparecer
  no `workspaceStore`). Resolver sem `setTimeout` arbitrário.
- `Logotipo.tsx`: prop opcional `altura` (padrão 16).
- Local padrão: `documentDir()` de `@tauri-apps/api/path`; separador do caminho final pelo que
  o próprio caminho usa (`\` no Windows).

## 3. Textos (O4 grava no doc 04)

| Situação | Texto |
|---|---|
| Título, primeiro uso | "Vamos começar" |
| Subtítulo, primeiro uso | "Notas em Markdown e desenhos no mesmo lugar, em arquivos que são seus." |
| Título, retorno | "Nenhum vault aberto" |
| Título, erro | "Não foi possível abrir o vault" |
| Campo nome: rótulo | "Como podemos te chamar?" |
| Campo nome: ajuda | "Aparece na saudação da tela de início. Dá para mudar nas Configurações." |
| Seção vault, primeiro uso | "Seu primeiro vault" |
| Seção vault, retorno | "Criar vault" |
| Explicação do vault | "Um vault é uma pasta comum do seu computador. Suas notas e desenhos ficam nela como arquivos .md." |
| Campos | "Nome" / "Local" / "Escolher…" |
| Nome padrão do vault | "Notas" |
| Botão primário | "Criar e começar" |
| Alternativa | "Já tenho uma pasta com notas" / "Abrir pasta" |
| Recentes | "Recentes" |
| Falha no conteúdo de exemplo | "O vault foi criado, mas não foi possível criar a nota de boas-vindas." |
| Configurações: seção | "Seu nome" |
| Configurações: rótulo / ajuda | "Nome" / "Aparece na saudação da tela de início." |
| Arquivos de exemplo | "Boas-vindas", "Primeiro desenho" |

Os textos da tela sem vault antigos ("Crie um vault novo ou abra uma pasta que já tem suas
notas.") saem do doc 04.

## 4. Tarefas

| Tarefa | Arquivos | Depende de |
|---|---|---|
| O1 Nome | `prefsStore.ts` (+test), `sistemaOperacional.ts` (+test), `PainelInicio.tsx`, `DialogoPreferencias.tsx` | — |
| O2 Conteúdo de exemplo | `vault/conteudoInicial.ts` (+test) | — |
| O4 Docs | `docs/03`, `docs/04`, `docs/06`, `docs/09`, `docs/REQUISITOS-STATUS.md` | — |
| O3 Tela | `TelaBoasVindas.tsx`, `App.tsx`, `Logotipo.tsx`, `workspaceStore.ts` (só se precisar do gancho de "abrir quando a API existir") | O1, O2 |

Ondas: O1 + O2 + O4; depois O3; depois integração (`npx tsc --noEmit`, `npm test`) e teste manual.

## 5. Teste manual

1. Apagar `settings.json` (ou usar perfil limpo) → tela "Vamos começar", nome sugerido "Lucas".
2. "Criar e começar" com o padrão → pasta `Documentos\Notas` criada, vault abre, aba "Boas-vindas"
   aberta, desenho embutido renderiza, link abre o desenho.
3. Home: "Boa tarde, Lucas".
4. Configurações → "Seu nome" → trocar → Home atualiza; outra janela também.
5. Apagar o nome nas Configurações → Home só "Boa tarde".
6. `Documentos\Notas` já existe → erro inline "Já existe uma pasta com esse nome nesse local.".
7. "Abrir pasta" → abre sem criar arquivos de exemplo.
8. Janela nova sem vault (retorno) → "Nenhum vault aberto", sem campo de nome, com recentes.
9. Perfil existente sem nome informado → nenhuma pergunta; Home sem nome.
10. "Criar vault…" pela sidebar → continua sem conteúdo de exemplo.
