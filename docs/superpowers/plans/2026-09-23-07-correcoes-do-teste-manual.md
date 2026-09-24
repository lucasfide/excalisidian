# Correções do teste manual de 23/09/2026 — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corrigir os cinco defeitos que o dono do produto achou testando o app, com a causa de
cada um já confirmada no código (investigação do planejador), e com testes que verificam o
**efeito que o usuário vê** — árvore, índice, aba aberta — e não só o que foi gravado no disco.

**Lição que motiva o rigor:** os testes do plano 04 só olhavam o disco (`adaptador.escreverTexto`
foi chamado com X). O defeito real estava no passo seguinte, que nenhum teste cobria. Toda
tarefa abaixo exige um teste que falharia com o defeito presente.

## Global Constraints

- Português do Brasil em nomes e comentários. Texto de interface só pelo catálogo, pt-BR e
  inglês, sentence case, sem emoji.
- Testes só de módulos puros ou de stores com dependências mockadas (padrão de
  `src/estado/contaStore.test.ts`) — sem jsdom, sem `.test.tsx`.
- **Guarda de higiene de commit:** trabalho não commitado do usuário em `src/editor/` (vários
  arquivos modificados e `src/editor/extensoes/caminhoDaNota*.ts` não rastreados),
  `src/layout/AbaDocumento.tsx`, arquivos não rastreados do glossário e documentos não
  rastreados em `docs/superpowers/`. **Não toque nesses arquivos** — a única exceção é
  `src/editor/extensoes/sincronizarTituloComArquivo.ts`, que NÃO está modificado pelo usuário
  (confira com `git status --short` antes). Antes de cada commit, `git status --short` e
  `git diff --cached --stat`; `git add` só com caminho explícito; nunca `git add -A`,
  `git add .` ou `git commit -a`. Tarefas rodam em paralelo: se o `git commit` falhar por
  `index.lock`, espere alguns segundos e tente de novo — nunca apague o lock.
- Não suba o app. O usuário testa.

---

### Task A: "Entrar na conta" no assistente não traz as Configurações para frente (sonnet, low)

**Causa confirmada:** o usuário abre o assistente a partir das Configurações, que continuam
abertas por baixo. "Entrar na conta" chama `setPreferenciasAbertas(true)` com elas já abertas:
nada monta de novo, o portal não é reanexado ao `body`, e elas ficam atrás do assistente. A
revisão anterior só considerou o caminho com as Configurações fechadas.

**Files:** `src/app/App.tsx`, e onde a decisão for extraída para teste.

- [ ] Ao pedir as Configurações a partir do assistente, remontar o `DialogoPreferencias`
  (ex.: uma `key` numérica incrementada em `aoAbrirConta`), para que o portal seja reanexado
  por último ao `body` e o `Dialog` volte ao topo da `fila` do Esc. Conferir em `Dialog.tsx` que
  o cleanup/push da `fila` fica correto com a remontagem (o Esc tem que fechar primeiro as
  Configurações, depois o assistente). A seção Conta tem que ficar visível (o `secaoInicial`
  já rola até ela).
- [ ] Os dois caminhos têm que funcionar: Configurações fechadas → assistente → "Entrar na
  conta"; e Configurações abertas → "Configurar agente" → "Entrar na conta".
- [ ] Atualizar os dois comentários de `App.tsx` sobre ordem de montagem para incluir este caso.
- [ ] Sem teste de componente possível; descreva no relatório, passo a passo, os dois fluxos e
  a ordem dos elementos no `body` e na `fila` em cada um.
- [ ] Commit: `fix(agente): entrar na conta traz as configuracoes para frente do assistente`.

### Task B: resolver conflito e simular conflito atualizam árvore, índice e aba aberta; simulação numera (sonnet, medium)

**Causa confirmada:** o app ignora de propósito o eco do watcher para as próprias gravações
atômicas (`vaultStore.reconciliar` → `deveIgnorarEvento`, doc 02 §10). Por isso todo ponto que
grava pelo adaptador chama depois `recarregarArvore()` e `reindexarArquivo(caminho)` (ver
`src/vault/criar.ts`, `renomear.ts`, `lixeira.ts`). `conflitosStore.resolver` e
`simularConflito` gravam e não fazem isso: o arquivo só aparece quando outra ação recarrega a
árvore — "demorou pra aparecer". Pior: "ficar com a outra versão" sobrescreve o original; se ele
estiver aberto numa aba, a aba mostra o conteúdo velho e o autosave pode gravá-lo de volta por
cima da versão escolhida.

**Decisão do dono do produto para a simulação:** se já existir um arquivo com o nome de teste,
a simulação cria com `(2)`, `(3)`… (mesma numeração de sempre, `caminhoLivre`), e nunca recusa
nem sobrescreve. A marca de conteúdo de teste e a recusa com aviso saem.

**Files:** `src/estado/conflitosStore.ts` (+ teste), `src/sync/simularConflito.ts` (+ teste),
`src/i18n/catalogo/conflito.ts` (remover `conflito.simular.jaExiste` se ficar sem uso), e onde
for preciso tocar no `documentosStore` (só se faltar uma operação — prefira as existentes).

- [ ] Leia `vaultStore.reconciliar`, `documentosStore` (`recarregarDoDisco`, timers de
  autosave, `aoEventoExterno`) e `src/vault/criar.ts`/`renomear.ts` inteiros antes de mudar.
- [ ] `conflitosStore.resolver`: depois de gravar, `recarregarArvore()` e `reindexarArquivo`
  de cada caminho gravado. Se o caminho original estiver aberto numa aba e foi sobrescrito
  ("ficar com a outra versão"): a aba passa a mostrar a versão escolhida, e **não pode existir
  janela de tempo em que um autosave pendente grave o conteúdo antigo por cima** — cancele o
  autosave pendente ANTES de gravar e recarregue do disco depois. Para desenho, confira como o
  `EditorDesenho` reage a `recarregarDoDisco` (o comentário do `aoEventoExterno` diz que
  desenho nunca recarrega em silêncio — aqui não é silêncio, o usuário escolheu; confirme que a
  cena troca, e se não trocar, relate antes de inventar mecanismo novo). "Ficar com esta"
  (a local) não grava nada no original e não deve recarregar a aba.
  O store não deve importar `vaultStore`/`documentosStore` diretamente se isso quebrar a
  testabilidade; injetar por parâmetro (como o adaptador já é) é aceitável.
- [ ] `simularConflito`: usa `caminhoLivre` para os dois arquivos (nota e desenho), grava,
  recarrega árvore e reindexa; o conflito registrado aponta para o caminho real escolhido; sem
  marca, sem recusa. Mantenha: comando só em `import.meta.env.DEV` e fora do bundle de produção
  (rode `npm run build` e procure em `dist/` por "conflito de teste" e `simular-conflito`).
- [ ] Testes que FALHAM com o defeito atual (escreva antes, mostre falhando): resolver chama
  `recarregarArvore` e `reindexarArquivo` com o caminho certo; "ficar com a outra" com o
  original aberto recarrega a aba e o conteúdo da aba passa a ser o escolhido; autosave pendente
  do conteúdo antigo não grava depois da resolução (use timers falsos do vitest); "ficar com esta"
  não recarrega a aba; simulação com arquivo de mesmo nome existente cria `(2)` e o original do
  usuário fica intacto byte a byte; simulação atualiza árvore e índice.
- [ ] Docs: ADR-32, seção "Decisões tomadas na execução", acrescentar (linguagem simples): a
  resolução atualiza a lista lateral e a aba aberta na hora; a simulação numera em vez de recusar.
- [ ] Commit(s): `fix(sync): resolver e simular conflito atualizam lista e aba aberta` (e docs
  separado se preferir).

### Task C: título editado vira nome de arquivo mesmo saindo da nota por clique (sonnet, medium)

**Causa confirmada:** `sincronizarTituloComArquivo.ts` só renomeia quando o cursor sai da
linha 1 **dentro do mesmo editor** (`selectionSet`). Clicar em outra nota, em outra aba ou na
sidebar não muda a seleção desse editor — o arquivo fica com o nome velho e o H1 com o novo.
Defeito anterior aos serviços online (commit `f75fbbb`).

**Files:** SOMENTE `src/editor/extensoes/sincronizarTituloComArquivo.ts` e um teste novo para
a lógica extraída (ex.: `src/editor/extensoes/sincronizarTituloComArquivo.test.ts` ou um módulo
puro ao lado). Não toque em `EditorNota.tsx` (trabalho não commitado do usuário).

- [ ] Disparar o rename também quando o editor **perde o foco** e quando o plugin é
  **destruído** (aba fechada), se o título mudou. O caminho usado tem que ser o da nota daquele
  editor, não o `caminhoAtivo` do momento do evento (na destruição, a aba ativa já pode ser
  outra): capture o caminho enquanto o usuário edita a linha 1 (quando o editor ganha foco ou
  entra na linha 1) e use o capturado. Não disparar rename duplicado (sair da linha 1 e depois
  perder o foco não pode renomear duas vezes).
- [ ] Extrair a decisão ("renomear agora? para qual título, de qual caminho?") para uma função
  pura testável, e testar: sair da linha 1 renomeia; perder o foco na linha 1 com título mudado
  renomeia; destruir com título mudado renomeia com o caminho capturado, mesmo com outro
  caminho ativo; título igual não renomeia; nada de rename duplo.
- [ ] Docs: `docs/04-regras-de-negocio.md` §3.1 (ou onde a regra do H1 estiver): o nome
  acompanha o título ao sair da linha 1, **ao sair da nota** (clique em outra nota, outra aba ou
  na barra lateral) e ao fechar a aba.
- [ ] Commit: `fix(editor): titulo vira nome do arquivo tambem ao sair da nota`.

### Task D: renomear permite ponto no fim do nome de nota e desenho (sonnet, low)

**Causa confirmada:** `comandoRenomear` (`src/app/comandos/criacao.ts`) valida o nome digitado
**sem** a extensão com `validarNomeArquivo`, que proíbe terminar em ponto. Mas o arquivo final
é `Nome..md` / `Nome..draw.md`, que o Windows aceita — `renomearArquivo` já valida o nome com a
extensão e aceitaria. A regra do ponto final só vale de verdade para **pasta** (o nome da pasta
é o nome final).

**Files:** `src/app/comandos/criacao.ts`, `src/vault/caminhos.ts` (se precisar de uma variante
de validação), `src/vault/criar.ts` e `src/vault/navegacao.ts` (onde `sanitizarNome` corta ponto
final de um nome que vai receber extensão), testes em `src/vault/*.test.ts`, docs 02 §9.

- [ ] Renomear nota/desenho: validar `nome + extensão` (a extensão do arquivo sendo renomeado).
  Pasta continua proibindo ponto e espaço no fim.
- [ ] Mesma correção onde um nome de nota vira arquivo por outros caminhos: `criarArquivo` em
  `criar.ts` e `navegacao.ts` (criar nota a partir de link) — o ponto final do nome base não
  deve ser cortado quando vem extensão depois. Espaço no fim continua cortado (é `trim`).
  Confira que `renomearArquivo` (usado pelo título da nota) já aceita.
- [ ] Verifique a resolução de links com ponto final: `[[Nota.]]` tem que achar `Nota..md`.
  Leia o resolvedor (doc 02 §5 e o código do índice/resolução) e teste; se não achar, corrija lá
  e registre.
- [ ] Testes que falham hoje: validação do renomear aceita "Frase." para nota e para desenho e
  recusa para pasta; criar nota "Frase." gera `Frase..md`; link `[[Frase.]]` resolve.
- [ ] Docs 02 §9: a regra "não pode terminar em ponto ou espaço" vale para o nome **final** do
  arquivo ou da pasta; em nota e desenho o nome final termina na extensão, então o ponto no fim
  do título é permitido.
- [ ] Commit: `fix(vault): nota e desenho aceitam ponto no fim do nome`.

### Ctrl+Delete (sem código)

O item 9 do roteiro de teste passou: "nada aconteceu" é o resultado certo (o atalho que apagaria
a cena inteira está bloqueado). A falha foi a redação do roteiro. Nenhuma tarefa.
