# Fase B — adequação do código — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar do código o que não sobreviveu às decisões de 23/09/2026 (o código de
recuperação), e terminar as correções do plano 03 que ficaram pendentes — uma delas pela
metade, não commitada, e com um defeito que derruba a tela de Configurações.

**Architecture:** três tarefas sequenciais, pequenas. A primeira remove um módulo sem
consumidor. A segunda assume trabalho interrompido que está na árvore sem commit. A terceira
fecha as correções que nem começaram.

**Spec:** `docs/superpowers/specs/2026-09-23-adequacao-docs-servicos-online.md`, ADR-33 e
ADR-36 em `docs/09`. Pendências de origem: revisão final do plano 03, registrada em
`.superpowers/sdd/2026-09-21-03-conta-e-sessao/progress.md`.

## Global Constraints

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários.
- Todo texto de interface sai do catálogo (`src/i18n/catalogo/`), por `useTexto()` dentro de
  componente e `traduzirAgora()` fora. Nunca literal no JSX. Toda chave nova precisa de
  português e inglês — há teste que cobra.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de
  `src/estilos/globals.css`. Nenhuma classe de cor padrão do Tailwind.
- `Dialog` renderiza por portal. Não usar animação com preenchimento `both` em elemento que
  possa ter descendente `position: fixed`.
- Testes só de módulos puros: não há jsdom nem testing-library, e não existe `.test.tsx`.
- **O app funciona inteiro sem conta.** Nada pode bloquear, avisar ou atrasar quem nunca
  criou uma.
- **Os seis provedores de chave própria do agente continuam intactos.** O Ollama tem
  `precisaChave: false` como o provedor próprio, mas `exigeConta: false` — nenhuma condicional
  nova pode pegá-lo junto.
- **Higiene de commit:** a árvore tem trabalho não commitado do usuário em `src/editor/`,
  `src/layout/AbaDocumento.tsx` e arquivos não rastreados do glossário. Commit sempre por
  caminho explícito, conferindo `git status --short` e `git diff --cached --stat` antes;
  nunca `git add -A` nem `git add .`. Se o diff trouxer algo que o agente não escreveu, parar.
- O dev server não roda nesta fase (foi encerrado por falta de memória). Nenhum agente sobe
  outro. Conferência visual fica com o usuário.

---

### Task 1: Remover o código de recuperação

**Esforço:** low.

**Files:**
- Delete: `src/conta/codigoDeRecuperacao.ts`
- Delete: `src/conta/codigoDeRecuperacao.test.ts`
- Modify: `docs/16-codigo-de-recuperacao.md` (só a frase que diz que o módulo "será removido")

**Por quê:** ADR-33 decidiu que não há código nem frase de recuperação. O módulo nunca teve
consumidor — nenhuma tela o usa.

- [ ] **Step 1:** confirmar que nada importa o módulo: procurar `codigoDeRecuperacao` e
  `CodigoDeRecuperacao` em `src/`. Esperado: só os dois arquivos que serão apagados. Se houver
  outro, PARAR e relatar.
- [ ] **Step 2:** apagar os dois arquivos com `git rm`.
- [ ] **Step 3:** em `docs/16`, trocar a menção de que o módulo "será removido" por "foi
  removido em 23/09/2026". Nenhuma outra mudança no documento.
- [ ] **Step 4:** `npm test` e `npm run build`. Esperado: todos passando, com 10 testes a
  menos que antes (os do módulo removido).
- [ ] **Step 5:** um commit.

---

### Task 2: Assumir a correção interrompida

**Esforço:** medium.

**Files (já modificados na árvore, sem commit, SÓ com trabalho do agente interrompido):**
- `src/app/App.tsx`
- `src/ui/excalisidian/DialogoPreferencias.tsx`
- `src/ui/excalisidian/DialogoAgente.tsx`
- `src/i18n/catalogo/agente.ts`
- `src/i18n/catalogo/conta.ts`

**Contexto:** um agente aplicava a onda de correções da revisão final do plano 03 quando o
limite de uso da sessão o interrompeu. Ele commitou as correções 1 e 2 (`edae269`, `df772fd`)
e deixou pela metade, sem commit e sem revisão, partes das correções 3, 5 e 6. O controlador
conferiu: os cinco arquivos acima contêm **apenas** trabalho desse agente — nenhum trabalho do
usuário.

**O que o trabalho interrompido tenta fazer:**

- **Correção 3 — indicador de carregamento da conta.** Enquanto a sessão é verificada na
  abertura do app (até 20 segundos), a seção Conta e o passo de conta do assistente mostram um
  estado neutro ("Verificando sua conta…"), em vez de afirmar que o usuário está deslogado.
- **Correção 5 — o passo de conta do assistente não é mais um beco sem saída.** Ganha um
  botão "Entrar na conta", que abre as Configurações já na seção Conta, **por cima do
  assistente e sem fechá-lo** — o usuário não perde o que preencheu.
- **Correção 6b — erro de login não sobrevive a fechar e reabrir** as Configurações.
- **Correção 6d — a seção Conta é um formulário de verdade:** Enter envia, e o
  preenchimento automático do navegador distingue "entrar" de "criar conta".

**DEFEITOS CONHECIDOS no trabalho interrompido — corrigir antes de qualquer commit:**

1. **Hook depois de return antecipado (derruba a tela).** Em `DialogoPreferencias.tsx`, na
   seção Conta, há um `if (!carregado) return …` e, DEPOIS dele,
   `const [acaoAtual, setAcaoAtual] = useState(…)`. Quando a conta termina de carregar, o
   componente passa a chamar um hook a mais do que na renderização anterior, e o React
   derruba a tela de Configurações. **Todos os hooks do componente precisam vir antes de
   qualquer `return`.**

2. **Gambiarra de ordem em `App.tsx` que o portal tornou desnecessária.** O trabalho
   interrompido duplica a renderização dos dois diálogos (Configurações e assistente) em dois
   ramos de JSX, só para inverter a ordem de montagem, com base no comentário antigo de que
   "a ordem no DOM desempata" quem fica por cima. **Isso deixou de ser verdade:** desde o
   commit `cbd6fd8`, `Dialog` renderiza por portal em `document.body`. Com portal, o elemento
   de cada diálogo é acrescentado ao `body` no momento em que o diálogo **abre**, então quem
   abre por último fica por cima — independentemente da ordem no JSX. Abrir Configurações de
   dentro do assistente já põe Configurações por cima; abrir o assistente de dentro de
   Configurações já põe o assistente por cima.
   **Tarefa:** confirmar esse raciocínio lendo `src/ui/Dialog.tsx`; se confirmado, remover a
   duplicação e voltar a UMA renderização de cada diálogo, mantendo o que é necessário
   (`secaoInicial`, o callback que abre a conta a partir do assistente). Atualizar o
   comentário antigo sobre ordem no DOM, que ficou falso. Se o raciocínio NÃO se confirmar
   lendo o código, PARAR e relatar — não manter a duplicação por via das dúvidas.

**Passos:**

- [ ] **Step 1:** ler o diff pendente dos cinco arquivos (`git diff <arquivo>`) e o
  `src/ui/Dialog.tsx` inteiro.
- [ ] **Step 2:** corrigir o defeito 1 (hooks).
- [ ] **Step 3:** resolver o defeito 2 (duplicação em `App.tsx`).
- [ ] **Step 4:** conferir que as correções 3, 5, 6b e 6d estão completas e coerentes. Todo
  texto novo no catálogo, nos dois idiomas.
- [ ] **Step 5:** `npm test` e `npm run build`.
- [ ] **Step 6:** commitar. As mudanças se entrelaçam nos mesmos arquivos, então separar um
  commit por correção pode ser impraticável; é aceitável um commit só, **desde que a mensagem
  liste as quatro correções e os dois defeitos corrigidos**.

---

### Task 3: As correções que não começaram

**Esforço:** medium.

**Files:**
- `src/agente/cliente.ts` e `src/agente/cliente.test.ts` (correção 4)
- `src/ui/excalisidian/DialogoAgente.tsx` (correção 6a)
- `src/estado/contaStore.ts` e `src/estado/contaStore.test.ts` (correções 6c e 7)

**Correção 4 — 401 do provedor próprio aparece como "chave recusada".** Em `cliente.ts`, os
status 401 e 403 viram `FalhaAgente("chave")`, que o usuário lê como "A chave da API foi
recusada pelo provedor. Confira a chave nas configurações." Para o provedor próprio a
mensagem está errada: o usuário não tem chave, tem sessão. Quando o provedor tem
`exigeConta`, 401 deve virar `FalhaAgente("sessao")`. Os seis outros provedores não mudam.
**Não** implementar renovação automática de sessão — é incerteza registrada no `docs/09`.
Teste: 401 com provedor próprio → `sessao`; 401 com um provedor de chave → `chave`.

**Correção 6a — código morto.** Em `DialogoAgente.tsx`, a chamada
`setErroChave(t("agente.erro.sessao"))` nunca tem efeito: o ramo do provedor próprio não
renderiza `erroChave`, e o botão que a dispararia está desabilitado nesse estado. Remover.

**Correção 6c — "Sair" sem retorno.** `contaStore.sair()` nunca marca `ocupado`, embora o
botão seja `disabled={ocupado}`. Com servidor lento, fica até 20 segundos clicável e sem
resposta. Marcar `ocupado` durante o `sair`. Teste: `ocupado` fica verdadeiro enquanto o
`sair` do serviço não resolve.

**Correção 7 — teste que faltava.** "Sair durante um carregamento em voo": o `sair` vence, e
o carregamento que termina depois não restaura a sessão nem regrava o token. O dublê
`ServicoContaControlavel` já existe em `contaStore.test.ts`. É o caminho que apaga disco, por
isso merece cobertura própria.

**Passos:** um ciclo de teste-primeiro por correção que tenha teste; um commit por correção.

---

## Depois da Fase B

- **Documentação acompanha o código:** ao fim da Task 3, atualizar a lista de pendências da
  Fatia 13 no `docs/08` e o item 2.4 da especificação, que hoje listam estas correções como
  abertas.
- **Token no cofre do sistema (ADR-34):** precisa de plano próprio, precedido de pesquisa — a
  escolha de como falar com o cofre do Windows aumenta a superfície de Rust do app, e o
  ADR-5 estabelece um limite para isso.
- **Plano 04 (conflitos de sincronização):** já está escrito e revisado; retoma depois.
