# Plano 18 — uso do painel do agente

**Estado:** implementação e revisão concluídas. Suíte completa: 1.588 testes em 131 arquivos aprovados; build TypeScript + Vite aprovado. Conferência visual e de teclado no app ainda pendente; roteiro em `../passagem-2026-09-30-painel-agente.md`. Sem commit/deploy.
**Desenho:** `../specs/2026-09-30-painel-agente-design.md`.

## Decisões

Conversa abre nas mensagens recentes. Separar Conversa, Sugestões e Memória em abas locais; contagens nomeadas dentro do painel. Balão usa ponto para atualizações desde a última abertura da nota e limpa ao abrir. Evitar seções abertas competindo por altura/rolagens dentro da conversa. Manter política de pausa/consumo, créditos, login, transporte e configurações.

## Distribuição e dependências

Todos os executores usam `gpt-6-luna`:

| Tarefa | Effort | Arquivos/responsabilidade | Ordem |
|---|---|---|---|
| A — novidades e balão | high | `agenteStore.ts`, teste existente, `BalaoAgente.tsx`, helper/tipos novos apenas se necessários; marcadores por nota, reconhecer abertura, lotes iguais, prioridades, reset/rename | Implementada; 71 testes dirigidos aprovados |
| B — interface e scroll | medium | `PainelAgente.tsx`, CSS local; abas, contexto, ações, scroll condicional e resposta recente; usar contrato A sem editar store | Implementada e integrada; erros TypeScript da tentativa inicial corrigidos; build final aprovado |
| C — revisão independente | medium | Somente leitura do diff A/B; bugs de nota errada, estado visto, scroll, teclado, crédito/login e efeitos tardios | Concluída; correções integradas, sem bloqueios na releitura final |
| D — documentação e roteiro | low | `docs/11-agente-ia.md`; coordenação conclui passagem/estado do plano e checks | Concluída; roteiro visual ainda precisa ser realizado no app |

As três análises iniciais já foram distribuídas: comportamento high, interface medium, aceite low. Coordenação escolheu abas em vez da alternativa de seções recolhíveis para reservar toda a área central ao conteúdo selecionado. O badge de inventário permanente foi substituído por aviso temporário, conforme problema relatado pelo dono.

## Contratos de execução

- A fornece ação tipada para reconhecer atualizações da nota e seletor/estado de novidades; não usa React para decidir se conteúdo é lido. Considerar painel aberto apenas no caminho ativo.
- B mantém scroll e aba locais; reconhece consulta ao abrir/trocar nota com o painel aberto. Abas não alteram persistência.
- Usar `interface` para novas props, sem `any`, cores semânticas locais, sem bibliotecas/primitive/global novo. Seguir nomes existentes em arquivos existentes e kebab-case em novos.
- Não alterar política de pausa nem dados de chat para implementar UI. Não misturar correção de rename de conversas existente com marcador temporário.
- Não sobrescrever mudanças anteriores do assistente ou transporte. Não commitar/deploy nem acessar VPS.

Contratos integrados: `novidades` guarda flags `sugestoes`/`resposta` por chave; `reconhecerAtualizacoes(path)` reconhece consulta; `chaveConversaAgente(path, docs)` usa `""` quando não há nota de texto carregada (incluindo desenhos). `caminhoChatEmVoo` identifica o destino da resposta em andamento, sem permitir pedidos simultâneos novos. Geração do vault descarta resultados antigos ao trocar espaço de trabalho/limpar memória. Rascunhos locais do painel são isolados por vault e chave de conversa.

## Evidência da execução

- `rtk npm test`: 131 arquivos/1.588 testes aprovados; teste dirigido de store: 71 aprovados (incluídos no total).
- `rtk npm run build`: aprovado, incluindo TypeScript; avisos de divisão de chunks/imports dinâmicos e tempo de plugins, sem erro.
- `rtk git diff --check`: aprovado.
- Nenhum breakpoint novo ou alterado. A largura local é `min(360px, 100vw - 2rem)`; nas faixas sm/md/lg/xl continua 360px, adaptando apenas janelas menores. Layout global e outros componentes não mudaram. Conferência visual nessas larguras ainda pendente.

## Verificação

Executar checks existentes ao integrar: `rtk npm test`, `rtk npm run build`, `rtk git diff --check`. Build contém TypeScript; não há lint/typecheck separados. Revisar testes existentes de store com a alteração mínima apropriada; não introduzir ambiente DOM ou dependências.

Roteiro manual adicional:

1. Conversa longa: fechar e reabrir mostra últimas mensagens; editor mantém posição.
2. Ler acima enquanto chega resposta: posição preservada; botão para resposta recente funciona. Enviar leva ao fim.
3. Conferir abas: sugestões/memória não empurram conversa, contagens nomeadas, autores distintos, ações sempre disponíveis.
4. Sugestões com painel fechado produzem ponto; abrir remove, itens continuam em Sugestões. Mesmo conteúdo repetido não recria novidade.
5. Nota A/B: conversas, sugestões, convite e ponto corretos; resposta tardia de A não afeta B. Memória permanece global.
6. Sem nota, convite, pausa, erro de rede/sessão e créditos: cabeçalho/contexto corretos, ações anteriores funcionam; mudanças de saldo/status não movem scroll.
7. Teclado: abas com setas/Home/End, Tab nas ações, Enter/Shift+Enter no campo, Esc fecha só painel. Janela estreita sem overflow horizontal.

Não capturar telas automaticamente ou afirmar aceite visual apenas a partir de teste de store. Na entrega registrar explicitamente breakpoints afetados pela largura local (caso a implementação use media query).

## Registro de execução B

- `PainelAgente.tsx`: três abas locais Conversa/Sugestões/Memória, contexto e conversa normalizados pelo helper do store, ações visíveis, rascunho por vault/conversa e caminho em voo contextualizado.
- A rolagem usa o container do painel: abertura/troca de contexto/envio levam ao fim; resposta nova só acompanha se a pessoa já estava no fim; caso contrário oferece “Ver resposta mais recente”. Mudanças de status/uso não comandam a rolagem.
- `painel-agente.css`: aliases semânticos locais preservam a paleta de caderno sem alterar tokens globais.
- Largura fluida limitada a 360px, sem breakpoint novo; nenhuma regra responsiva global foi alterada.
- `git diff --check` passou. A tentativa de build foi bloqueada pelo erro TS2783 em `agenteStore.ts:325` (tarefa A); os dois usos de `Array.at` no painel foram removidos para compatibilidade com o alvo atual.
