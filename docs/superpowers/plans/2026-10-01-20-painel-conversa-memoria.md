# Plano 20 — painel lateral, conversa e memória

Autorização: opção A escolhida; sugestões no mesmo bloco da conversa, sem segunda aba;
planejar e implementar as recomendações de memória discutidas em 01/10.

## Contrato de produto

- Agente usa a lateral direita, alternando com Tarefas. Editor permanece utilizável,
  sem fechamento ao clicar na nota. Contexto da nota junto ao campo, sem título repetido.
- Conversa é a tela principal. Cada análise automática tem um bloco com identidade:
  fase real em andamento → sugestões ou erro. Resultados anteriores são recolhíveis.
- Sugestões mantêm copiar/dispensar/abrir fonte. Não viram mensagens artificiais no
  histórico enviado ao modelo. Chegada de conteúdo mantém leitura antiga e oferece ir ao fim.
- Memória fica em “O que o agente lembra”, com voltar à conversa, editar e apagar.
  Não existe aba permanente nem contagem destacada de aprendizados.
- Novos registros modelo são candidatos estruturados com categoria, escopo, chave,
  fonte, evidência e data. A evidência deve constar no material fornecido. Só confirmação
  do usuário promove candidato ao contexto. Preferência salva explicitamente pelo usuário
  é confirmada diretamente e pode ser removida. Status de projeto permanece nas notas.
- Mesma chave/categoria/escopo é atualizada por substituição apenas após confirmação.
  Sem fusão por similaridade. Legado é preservado e consultável para revisar; não é
  automaticamente tratado como verdadeiro. Confirmados não são descartados por FIFO.
- Chat e acompanhamento usam seleção de memória confirmada respeitando escopo e orçamento.
  Continuidade curta usa histórico real recente e contexto anterior limitado; sem sumarização
  extra pelo modelo nem promessa de resumo semântico perfeito.

## Execução

| Responsável | Modelo/esforço | Arquivos |
|---|---|---|
| memoria_estruturada | Luna 6 high | memória, prompt, tipos de memória e testes existentes |
| conversa_estado | Luna 6 high | store, blocos de análise, integração e testes existentes |
| painel_conversa | Luna 6 medium | painel e CSS local, gerenciamento de memória |
| Coordenação | principal | wrapper lateral, App, revisão, documentação, checks gerais |

Contratos entre memória/store/UI definidos antes da integração. Revisão cruzada após entrega.
Árvore já contém alterações anteriores: não reverter, instalar dependências, editar primitives,
commitar ou publicar. Nenhuma alteração de servidor ou preço. Sem captura automática de tela.

## Compatibilidade e responsividade

Mensagens anteriores continuam legíveis; campos novos opcionais nos blocos. Arquivo legado de
fatos continua legível e não é regravado só por carregar. Dados de memória pertencem ao vault.
Atividade/resultado tardio de vault anterior é descartado; referências de nota acompanham rename.
Desktop a partir de lg (1024): lateral. Abaixo de lg: agente em painel inferior para preservar
editor; entrada 16px e alvos 44px. Sem alterações globais nos breakpoints sm/md/xl ou no
conteúdo interno de Tarefas; só a integração de alternância autorizada.

## Aceite/checks

Suíte existente, build TypeScript/Vite e diff. Conferência manual: lateral versus Tarefas,
análise/chat simultâneos, sugestões no bloco, fonte/copy/dispensar, reabertura/scroll,
memória candidato versus confirmado, substituição após revisão, preferências explícitas,
restart/vault/rename e ausência de vazamento de contexto de projeto.

Estado: implementação e revisão concluídas. Suíte completa 1.610 testes/131 arquivos,
TypeScript e build Vite aprovados, diff sem erros. Conferência visual no app fica com o
dono; testes de estado não demonstram layout DOM. Passagem e roteiro:
`../passagem-2026-10-01-conversa-memoria.md`.
