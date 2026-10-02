# Plano 21 — correção da revisão dos planos 17–20 (Codex)

Revisão de 01/10 sobre os commits `7056cb1` e `c0161ba`. O comportamento entregue fica; o que
muda é a forma (padrão visual, nomes, estrutura) e um limite de crescimento. Ler antes:
`CLAUDE.md`, `docs/06-design-system.md` (normativo), `docs/05-arquitetura-e-stack.md` §2.

Regras para quem executa:
- **Não commitar.** O revisor commita por caminho explícito.
- Use `git mv` para mover/renomear arquivos (preserva histórico).
- Não mude comportamento além do pedido. Não refatore o que não está listado.
- Ao terminar cada tarefa: `npx tsc --noEmit` e `npx vitest run` verdes. Node do PATH pode ser
  14; se `npx` falhar, use o Node 24 instalado (o Codex usou) sem trocar o global.
- Relatório final curto: o que mudou por arquivo, comandos rodados e resultado, dúvidas.

---

## Tarefa 1 — estrutura, nomes e padrão visual

### 1.1 Pastas e nomes (regra: português, camelCase/PascalCase como o resto do projeto)

Mover e renomear, atualizando todos os imports:

| De | Para |
|---|---|
| `src/components/features/cabecalho-painel-lateral.tsx` | `src/ui/excalisidian/CabecalhoPainelLateral.tsx` |
| `src/components/features/painel-lateral-agente.tsx` | `src/ui/excalisidian/PainelLateral.tsx` (componente `PainelLateral`) |
| `src/components/features/convite-agente-toast.tsx` | `src/ui/excalisidian/ConviteAgente.tsx` (componente `ConviteAgente`) |
| `src/components/features/creditos-agente.tsx` | `src/ui/excalisidian/CreditosAgente.tsx` |
| `src/hooks/use-saldo-creditos-conta.ts` | `src/servico/useSaldoCreditosConta.ts` |
| `src/servico/estado-creditos-conta.ts` (+ `.test.ts`) | `src/servico/estadoCreditosConta.ts` (+ `.test.ts`) |
| `src/ui/excalisidian/acao-conta-painel.ts` (+ `.test.ts`) | `src/ui/excalisidian/acaoContaPainel.ts` (+ `.test.ts`) |
| `src/agente/regras-memoria.ts` | `src/agente/regrasMemoria.ts` |

Tipos de `src/types/`:
- `atividade-agente.ts`, `atualizacoes-agente.ts`, `avisos-agente.ts`, `conversa-agente.ts`,
  `memoria-agente.ts` → conteúdo vai para `src/agente/tipos.ts` (arquivo de tipos do agente que já
  existe). `memoria.ts` continua reexportando `Fato`/`CandidatoFato` como hoje.
- `creditos-conta.ts` → conteúdo vai para o topo de `src/servico/estadoCreditosConta.ts`.
- Apagar `src/types/`, `src/hooks/` e `src/components/` quando vazias.

Em `PainelAgente.tsx`, traduzir identificadores em inglês: `MemoryGroup` → `GrupoMemorias`,
`MemoryMeta` → `MetaMemoria`, props `title/facts/formatDate/onConfirm/onReject/onDelete/onEdit/fact`
→ `titulo/fatos/formatarData/aoConfirmar/aoRejeitar/aoApagar/aoEditar/fato`, variáveis
`source/category/drafts/erroDrafts/next/state` → `origem/categoria/rascunhos/errosRascunho/proximo/atual`.
Procurar outros identificadores em inglês nos arquivos novos e traduzir do mesmo jeito.

### 1.2 Cores: tirar as classes proibidas e apagar os arquivos de "tradução"

`CLAUDE.md` proíbe as classes de cor padrão do Tailwind/shadcn. O Codex usou essas classes e criou
CSS para remapeá-las. Substituir no JSX, direto pelas classes de token, conforme a tabela (que é o
mapeamento que os próprios arquivos CSS faziam):

| Proibida | Token |
|---|---|
| `bg-background`, `bg-popover`, `bg-card` (em CreditosAgente) | `bg-superficie` |
| `bg-muted`, `bg-card` (em PainelAgente) | `bg-lavagem` |
| `text-foreground`, `text-card-foreground` | `text-tinta` (no BalaoAgente era `tinta-media`, mas ele será apagado) |
| `text-muted-foreground` | `text-tinta-suave` em PainelAgente (exceto no bloco de erro/conta: `text-tinta-media`); `text-tinta-media` em DialogoAgente, CreditosAgente, DialogoPreferencias |
| `border-border` | `border-regua` |
| `border-input` | `border-regua-forte` |
| `bg-primary` / `text-primary` / `border-primary` / `outline-primary` | `bg-cristal` / `text-cristal` / `border-cristal` / `outline-cristal` |
| `text-primary-foreground` | `text-superficie` |
| `text-destructive` | `text-bordo` |
| `text-warning` | `text-ocre-tinta` |
| `hover:text-foreground` | `hover:text-tinta` |

Depois apagar: `src/ui/excalisidian/painel-agente.css`, `dialogo-agente.css`,
`preferencias-agente.css`, `balao-agente.css`, `src/components/features/creditos-agente.css`,
`painel-lateral-agente.css`, `convite-agente-toast.css`, e seus `import`. Também as classes-gancho
que só existiam para o CSS (`painel-agente`, `escopo-assistente-agente`, `creditos-agente`,
`preferencias-agente__explicacao`, `painel-agente__erro*`, `painel-agente__menu`).
- `.painel-agente__item` (itens do menu): reescrever em Tailwind com tokens —
  `flex w-full items-center rounded-controle px-3 py-1.5 text-left text-pequeno text-tinta hover:bg-lavagem focus-visible:bg-lavagem`.
- `textarea::placeholder` → `placeholder:text-tinta-suave` no próprio textarea.
- Toast do convite: os botões de ação do sonner já são estilizados pelo `Toaster` global de
  `App.tsx` (`toastOptions`). Remover o CSS próprio; se o botão ficar sem contraste, usar
  `classNames: { actionButton, cancelButton }` do sonner com classes de token
  (`bg-tinta text-superficie`, `bg-lavagem text-tinta border border-regua`).
- `PainelLateral` (ex-painel-lateral-agente.css): reescrever em classes Tailwind com tokens.
  Mantém o comportamento: largura = `larguraPainel` de tarefas (via `style={{ width }}`),
  `border-l border-regua`; abaixo de `lg` o agente vira painel inferior fixo (`max-lg:fixed
  max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[90] max-lg:w-full max-lg:h-[min(80dvh,42rem)]
  max-lg:border-t max-lg:shadow-sobreposicao`), divisória escondida nesse caso. Usar `hidden`
  como hoje.

Depois do passo, conferir que
`grep -rnE "muted-foreground|bg-background|border-border|bg-primary|text-destructive|border-input|bg-card|bg-popover|text-warning|text-primary|text-foreground|outline-primary" src`
não acha nada.

### 1.3 Tamanhos: voltar à escala do doc 06

O Codex usou alvos de 44px e texto de 16px; o app usa `BotaoIcone` de 32×32 e texto
`text-corpo` (15) / `text-pequeno` (13).
- Remover `h-11 w-11`, `min-h-11`, `min-h-20` dos botões e `BotaoIcone` (deixar o tamanho padrão
  do componente). `BotaoIcone tamanho={16} className="h-11 w-11"` em `SugestaoInline` → `BotaoIcone`
  sem `tamanho` nem classe de tamanho.
- `text-base` → `text-corpo` (textarea da conversa e da edição de memória).
- Textarea da conversa: como era antes do Codex — `min-h-9 ... border-regua-forte bg-superficie
  px-2 py-1.5 text-corpo text-tinta placeholder:text-tinta-suave ... focus-visible:outline-cristal`;
  botão Enviar `className="h-9 w-9"`.
- Cabeçalho do painel lateral (`CabecalhoPainelLateral`): altura 34px para alinhar com a barra de
  abas do dockview (mesmo padrão de `App.tsx`: `style={{ height: 34 /* --dv-tabs-and-actions-container-height */ }}`),
  `border-b border-regua bg-superficie px-1`. Abas como texto `meta`: inativa `text-tinta-suave
  hover:text-tinta`, ativa `text-tinta` com régua inferior de 2px `border-cristal`.
  Botões de ação/fechar: `BotaoIcone` padrão (32).
- Divisória: `w-2` de área de arraste com 1px visível `bg-regua`, como a do `PainelTarefas`.

### 1.4 Textos de interface fora do catálogo

O agente tem exceção (ADR-36: tradução das telas do agente adiada). Mas `CabecalhoPainelLateral`,
`PainelLateral`, `PainelTarefas` e `App.tsx` não são só do agente. Levar ao catálogo
(`src/i18n/catalogo/vault.ts` ou o domínio onde já ficam os textos de tarefas — procurar
"Tarefas" no catálogo), com português e inglês, e usar `useTexto()`:
`"Agente"`, `"Tarefas"`, `"Painel lateral"` (aria-label do nav), `"Colapsar painel lateral"`,
`"Expandir painel lateral"`, `"Largura do painel lateral"`. Inglês: Agent, Tasks, Side panel,
Collapse side panel, Expand side panel, Side panel width.

### 1.5 Balão morto

`BalaoAgente.tsx` não é mais importado por ninguém. Apagar o arquivo (e `balao-agente.css`).
Atualizar os comentários que citam ele: `src/sync/iconeStatus.ts:39` e
`src/ui/excalisidian/FaixaConflitos.tsx` (linhas ~6 e ~15) — o balão saiu; o canto inferior
direito agora só tem os toasts.

---

## Tarefa 2 — limite das análises na conversa e documentação

### 2.1 Limite de blocos de análise (TDD)

Hoje cada ciclo automático (`rodarCiclo` em `agenteStore.ts`) anexa um bloco `tipo: "analise"` à
conversa da nota, salvo em disco, sem limite. Regra nova: **cada nota guarda no máximo as 20
análises mais recentes**; mensagens do usuário e respostas do chat (`tipo` ausente ou
`"mensagem"`) nunca são cortadas por esta regra.
- Função pura em `src/agente/memoria.ts`: `podarAnalises(mensagens, max = 20)` — remove as análises
  mais antigas além de `max`, preservando a ordem do resto. Nunca remove análise `em-andamento`.
- Aplicar ao anexar o bloco novo em `rodarCiclo` e ao carregar conversas em `aoAbrirVault`.
- Testes em `memoria.test.ts` (corta só análises, mantém ordem, preserva em-andamento, abaixo do
  limite não muda) e um teste no `agenteStore.test.ts` mostrando que a 21ª análise de uma nota
  descarta a mais antiga e mantém as mensagens do chat.

### 2.2 Documentação normativa

- `docs/06-design-system.md`: a seção "Balão e painel do agente de IA" (~linha 599) e a linha do
  inventário `BalaoAgente` (~533) descrevem um balão flutuante e um cartão de 360px que não existem
  mais. Reescrever para o que está no código: painel lateral encaixado à direita da nota, dividindo
  o espaço com Tarefas (abas Agente/Tarefas no cabeçalho de 34px, mesma largura e divisória de
  Tarefas, abaixo de 1024px vira painel inferior); convite como toast; análises como blocos na
  conversa; memória por "O que o agente lembra" no menu `…`. Inventário: tirar `BalaoAgente`,
  incluir `PainelLateral`, `CabecalhoPainelLateral`, `ConviteAgente`, `CreditosAgente`.
  Ajustar a linha da tabela de ícones "agente de IA (balão)" e a referência ao "balão do agente
  pausado" (~633). Não inventar valores: só descrever o que o código usa.
- `docs/11-agente-ia.md`: §6.1 "Balão" e as menções ao balão (linhas ~21, ~30, ~386, ~394, ~454,
  ~460, ~478) → painel lateral/toast, com o mesmo cuidado.
- `docs/05-arquitetura-e-stack.md` §2: acrescentar `servico/estadoCreditosConta.ts`,
  `servico/useSaldoCreditosConta.ts`, `servico/saldoCreditos.ts` se faltar, e
  `agente/regrasMemoria.ts`.
