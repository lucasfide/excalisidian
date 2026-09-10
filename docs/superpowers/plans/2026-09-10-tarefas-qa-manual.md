# Manual QA Roteiro — Painel de Tarefas

**Ambiente:** `npm run tauri dev` com um vault de teste limpo.

**Nota prévia — Itens pendentes de confirmação manual (flagged pela SDD):**
1. Drop-line pixel placement & drop feel durante o arrasto
2. Modal não tem animação de deslizamento (§5.5 especifica "deslizar")
3. Clicar no botão de status já aceso no modal move a tarefa para o topo de sua seção (comportamento inesperado)

---

## §2.2 — Arquivo ausente e corrompido

- [ ] **Arquivo ausente:** Apague `.excalisidian/tarefas.json`, abra o app, crie uma tarefa. Confirme que o arquivo foi criado com a estrutura correta.
- [ ] **Arquivo ausente + reabrir:** Feche o app sem editar nada. Reabra. Rode `git status` — deve estar limpo (RNF7: abrir sem editar não gera diff).
- [ ] **Arquivo corrompido:** Coloque a string `lixo` no arquivo, abra o app. Confirme:
  - Toast de erro aparece: "Não foi possível ler as tarefas. O arquivo pode estar corrompido; ele não será sobrescrito até você criar uma tarefa nova."
  - Painel aparece vazio (sem travamento).
  - Arquivo não é sobrescrito.
  - Criar uma tarefa sobrescreve o arquivo.

---

## §3 — Agrupamento, intervalos, visibilidade

- [ ] **Seções em ordem e intervalos:** Crie tarefas em cada seção (uma por seção). Confirme:
  - Ordem fixa: Atrasado (se houver) → Hoje → Amanhã → Essa semana → Próxima semana → Concluídas.
  - Cabeçalhos de semana: "Essa semana · [intervalo]" e "Próxima semana · [intervalo]".
  - Intervalo mesmo mês: `6–12 de setembro`.
  - Intervalo cruzando mês: `28 de setembro – 4 de outubro`.
  - Contador discreto no cabeçalho de cada seção.

- [ ] **Atrasado vazio:** Crie tarefas só em "Hoje" e seções futuras. Confirme que Atrasado não aparece.

- [ ] **Concluídas colapsada:** Conclua uma tarefa (checkbox), ela vai para Concluídas. Confirme que Concluídas começa colapsada. Clique para expandir/recolher.

- [ ] **Virada do dia:** Mantenha o app aberto e mude o relógio do sistema para o dia seguinte (ou aguarde meia-noite). Confirme:
  - Uma tarefa em "Hoje" não concluída passa para "Atrasado".
  - A lista se reagrupa sem o usuário reabrir o app.

---

## §4.1 — Painel: alternância, atalho, largura persistida

- [ ] **Atalho `Ctrl+\`:** Pressione `Ctrl+\`. O painel fecha. Pressione novamente, abre.

- [ ] **Botão de alternância (sidebar esquerda):** Clique no botão com ícone `list-checks` no rodapé da sidebar esquerda. O painel alterna entre aberto/fechado.

- [ ] **Largura ajustável:** Com o painel aberto, passe o mouse sobre a divisória esquerda do painel. Cursor muda para resize. Arraste para a esquerda (280px mín.) e para a direita (480px máx.). Confirme que a largura é mantida.

- [ ] **Largura persistida:** Feche o app. Reabra. O painel mantém a largura que você definiu.

- [ ] **Estado persistido:** Feche o painel com `Ctrl+\` ou o botão. Feche e reabra o app. O painel permanece fechado.

---

## §5.1 — Nova tarefa em cadeia

**Caso 1: Enter com texto**
- [ ] Clique em "Nova tarefa" em Hoje. Um campo focado aparece.
- [ ] Digite "Tarefa 1", pressione Enter. A tarefa é criada, e um novo campo vazio aparece focado abaixo.

**Caso 2: Enter com campo vazio**
- [ ] Pressione Enter no campo vazio. O campo desaparece, a cadeia encerra.

**Caso 3: Blur com texto**
- [ ] Clique em "Nova tarefa" novamente. Digite "Tarefa 2", clique fora do campo. A tarefa é criada, a cadeia encerra.

**Caso 4: Esc**
- [ ] Clique em "Nova tarefa". Digite "Tarefa 3", pressione Esc. O campo desaparece, nenhuma tarefa é criada.

**Caso de borda (sexta/sábado):**
- [ ] Com hoje numa sexta, clique "Nova tarefa" em "Essa semana". Digite "Teste". A tarefa aparece em "Hoje" ou "Amanhã" (seção calculada), mas o campo de nova tarefa continua ancorado em "Essa semana".

---

## §5.2 — Reordenar e mover por arrasto

- [ ] **Reordenar na mesma seção:** Crie 3 tarefas em "Hoje". Passe o mouse sobre uma delas, a alça `grip-vertical` aparece. Arraste a tarefa para reordenar. Confirme que uma linha de 1px em `musgo` marca o alvo.

- [ ] **Mover entre seções:** Arraste uma tarefa de "Hoje" para "Amanhã". Ela desaparece de Hoje e aparece em Amanhã no topo.

- [ ] **Atrasado não recebe de fora:** Crie uma tarefa atrasada (vencimento no passado). Tente arrastar uma tarefa de "Hoje" sobre Atrasado. Nenhuma linha-alvo aparece, tarefa não solta.

- [ ] **Concluídas não aceita soltura:** Conclua uma tarefa (vai para Concluídas). Tente arrastar uma tarefa de "Hoje" sobre Concluídas. Nenhuma linha-alvo aparece.

- [ ] **Reabrir arrastando:** Arraste uma tarefa de Concluídas para Hoje. A tarefa é reabre (checkbox desmarcarado) e vai para Hoje.

---

## §5.3 e §5.4 — Checkbox e três formas de sair de Concluídas

**Checkbox (§5.3):**
- [ ] Em qualquer seção, marque o checkbox de uma tarefa. Ela sai da seção atual e aparece no topo de Concluídas.
- [ ] Em Concluídas, desmarque o checkbox. A tarefa volta para "Hoje".

**Três formas de sair de Concluídas (§5.4):**
1. [ ] Desmarcar o checkbox (verificado acima).
2. [ ] No modal, usar o button-group de status para mover para outra seção.
3. [ ] Arrastar a tarefa de Concluídas para outra seção (verificado acima).

---

## §5.5 — Modal de detalhe

- [ ] **Abre deslizando:** Clique numa tarefa. O modal abre da direita, cobrindo a largura do painel. O editor atrás permanece visível.

- [ ] **Fecha por Esc:** Pressione Esc. Modal fecha.

- [ ] **Fecha por clique fora:** Clique numa tarefa no painel atrás. O modal fecha.

- [ ] **Fecha por botão X:** Clique no botão de fechar (ícone `x`). Modal fecha.

**Título editável:**
- [ ] Clique no título. O campo fica editável. Mude o texto, pressione Enter. O título é salvo e o campo volta a aparecer como texto.
- [ ] Mude o título, clique fora. O título é salvo no blur.
- [ ] Limpe o campo (deixe vazio), clique fora. O título anterior é restaurado, o campo não fica vazio.

**Button-group de status:**
- [ ] O botão correspondente à seção atual está aceso. Clique noutro botão (ex.: "Amanhã"). A tarefa muda de seção, o modal continua aberto mostrando o novo estado.
- [ ] Quando a tarefa está atrasada, nenhum dos quatro primeiros botões fica aceso, e um rótulo "Atrasado" aparece discreto ao lado.

**Comentários:**
- [ ] Campo "Novo comentário" no fim. Digite um comentário, pressione Enter. O comentário é criado e aparece na lista acima.
- [ ] Pressione Shift+Enter para quebra de linha no comentário.
- [ ] Passe o mouse sobre um comentário. Aparecem ícones de editar e apagar.
- [ ] Clique editar. O texto fica editável inline. Mude, pressione Enter ou clique fora para salvar.
- [ ] Clique apagar. Um toast aparece: "Comentário apagado" com ação "Desfazer". Clique Desfazer; o comentário volta.
- [ ] Escreva um wikilink num comentário: `[[Nota importante]]`. Na exibição, o link é clicável.

**Reações da tarefa ao que acontece fora:**
- [ ] Com o modal aberto, conclua a tarefa pelo checkbox no painel. O modal continua aberto, o button-group passa a mostrar "Concluídas" aceso.

---

## §6 — Textos exatos

| Elemento | Texto esperado |
|---|---|
| Título do painel | `Tarefas` |
| Tooltip do botão (sidebar) | `Tarefas` |
| Cabeçalho de seção | `Atrasado` \| `Hoje` \| `Amanhã` \| `Essa semana · [intervalo]` \| `Próxima semana · [intervalo]` \| `Concluídas` |
| Botão de adicionar | `Nova tarefa` |
| Placeholder novo (input inline) | `Escreva o título e tecle Enter` |
| Placeholder comentário | `Escrever um comentário` |
| Marca comentário editado | `Editado` |
| Rótulo quando atrasada | `Atrasado` |
| Estado vazio (título) | `Nenhuma tarefa` |
| Estado vazio (apoio) | `Crie a primeira e ela aparece agrupada por prazo.` |
| Estado vazio (botão) | `Nova tarefa` |
| Toast arquivo corrompido | `Não foi possível ler as tarefas. O arquivo pode estar corrompido; ele não será sobrescrito até você criar uma tarefa nova.` |
| Toast apagar comentário | `Comentário apagado` (+ ação Desfazer) |

---

## Checklist de saída

- [ ] Nenhuma tarefa travou o app.
- [ ] Arquivo `tarefas.json` criado e estruturado corretamente.
- [ ] Seções calculadas corretamente, intervalos formatados.
- [ ] Arrasto funcionando, linha-alvo visível, restrições respeitadas (Atrasado/Concluídas).
- [ ] Modal abre/fecha conforme esperado.
- [ ] Todos os textos estão conforme a tabela §6.
- [ ] Estado de largura e painel persistido entre sessões.
