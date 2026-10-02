# Passagem — painel A, sugestões na conversa e memória

## Entrega autorizada

Plano 20: opção A escolhida pelo dono. Sugestões no mesmo bloco da conversa, sem segunda
aba. Memória estruturada, acessível pelo menu, com revisão antes de entrar no contexto.
Distribuição real: Luna 6 high `memoria_estruturada`, Luna 6 high `conversa_estado`,
Luna 6 medium `painel_conversa`; coordenação integrou lateral/App e revisou os contratos.

## Mudanças

- Wrapper `src/components/features/painel-lateral-agente.tsx` integra Agente/Tarefas no
  espaço direito. Tarefas mantém conteúdo, largura e preferência existentes. Clique no
  editor não fecha o agente. Abaixo de lg (1024), somente o agente vira painel inferior;
  sem mudanças globais de sm/md/xl. Entrada 16px e alvos de ação 44px.
- Conversa em `PainelAgente.tsx`: bloco de análise por ID com fase real e sugestões,
  resultados antigos recolhidos, copiar/dispensar/abrir nota preservados. Sem título da
  nota, linha vazia, abas de sugestões/memória ou badge permanente de aprendizados.
- `MensagemConversaAgente` preserva mensagens antigas. Ao reabrir, uma análise gravada
  em andamento vira interrupção, evitando spinner infinito. Fonte/rename e vault são
  tratados no store. Chat/ciclo simultâneos mantêm suas atividades independentes.
- Menu “O que o agente lembra”: confirmar/rejeitar/editar/apagar, origem/data/evidência,
  candidatos e registros antigos para revisão, confirmados e arquivo de substituições.
- Fatos estruturados com categoria/escopo/chave/fonte/estado. Modelo não confirma sozinho.
  Evidência é validada contra os mesmos 6.000 caracteres finais da nota enviados ao modelo.
  Texto igual não reaparece no mesmo escopo. Chaves de projeto respeitam fronteira de pasta.
  Até 100 pendentes sem excluir anteriores; confirmados não são descartados por FIFO.
- “Ações → Lembrar esta preferência” salva uma declaração explícita do usuário e oferece
  desfazer. Não extrai indiscriminadamente todas as mensagens. Edição fica identificada
  como declaração do usuário; não conserva uma citação incompatível como prova.
- Memória confirmada aplicável entra em chat e acompanhamento, orçamento 4.800 caracteres,
  fatos inteiros de até 500 code points. Última análise concluída entra no chat como dados
  de referência, até 2.400 caracteres. Blocos automáticos não são falsas falas no histórico.
  Últimas 12 mensagens manuais + até seis trechos parciais anteriores de 120 caracteres:
  continuidade limitada, não resumo semântico integral. Nenhuma chamada adicional ao modelo.
- Pausar acompanhamento controla os gatilhos, mantendo perguntas manuais disponíveis.

## Compatibilidade e limites

Fatos antigos permanecem em disco e disponíveis para revisar; sem estado, não entram
automaticamente no prompt. Confirmar um registro antigo adota convenção/vault, com origem
de confirmação pelo usuário. Longos exigem edição antes de confirmar. Não houve limpeza de
dados pessoais, migração destrutiva, instalação, alteração de servidor ou deploy.
Paráfrases com chaves diferentes ainda podem virar candidatos; não há dedupe semântica
perfeita. Citação presente prova a origem do trecho, não a verdade da interpretação.
Status de projeto é contexto recuperado das notas, não uma lembrança permanente nova.

## Checks

Suíte completa: 1.610 testes/131 arquivos aprovados. TypeScript sem erros. Build Vite
aprovado, com avisos existentes de tamanho/imports dinâmicos e tempo de plugins.
`git diff --check` aprovado. Node do PATH era 14; checks usaram o Node 24 já instalado,
sem trocar a versão global. Uma fixture de reload falhou na primeira suíte e foi corrigida
antes da repetição aprovada. Conferência visual manual não executada; nenhuma captura automática.
Árvore continua sem commit, com alterações anteriores preservadas.

## Roteiro curto para conferir no app

1. Abrir agente: lateral direita, nota utilizável. Alternar Tarefas/Agente e usar Ctrl+\.
   Reabrir preserva rascunho e mostra fim da conversa. Abaixo de 1024: painel inferior.
2. Aceitar convite: atividade dentro da conversa; ao terminar, sugestões no mesmo bloco.
   Enviar pergunta durante acompanhamento: terminar um pedido não apaga o outro.
3. Ler acima enquanto chega resultado: posição preservada e “Nova atividade ↓”. Expandir
   análise antiga, copiar/dispensar sugestão e abrir nota relacionada.
4. No menu, conferir memória pendente/antiga versus confirmada. Rejeitar candidato não
   deve entrar no contexto. Confirmar atualização arquiva a anterior; editar registra fonte
   do usuário. Apagar remove só a lembrança escolhida. O link de revisão some após resolver.
5. Declarar preferência e usar Ações → Lembrar esta preferência. Conferir Desfazer e ausência
   de duplicação ao repetir. Perguntar sobre preferência e sobre sugestão da última análise.
6. Reiniciar ou trocar vault durante análise: nenhum spinner antigo eterno ou resposta no
   espaço errado. Memória de outro projeto não deve aparecer no contexto da nota atual.
7. Pausar acompanhamento e fazer pergunta manual: chat responde, gatilhos continuam pausados.

Próximas melhorias só mediante novo escopo: recuperação semântica/embeddings, resumo semântico
de conversas longas, dedupe de paráfrases com avaliação e streaming de respostas.

## Correção de consistência entre Agente e Tarefas

Os dois modos agora usam `cabecalho-painel-lateral.tsx`: mesmas abas, indicador ativo,
altura e posição do botão de fechar. Removida a segunda linha de cabeçalho de Tarefas
quando integrada ao agente. O menu continua específico do agente, com espaço reservado
na outra aba para manter o alinhamento.

A largura salva de Tarefas passa a valer para ambos no desktop, com uma divisória
compartilhada, arrastável e ajustável pelas setas do teclado. A troca de abas não muda
a largura da nota. Mantidos os breakpoints existentes: abaixo de `lg` (1024px),
Agente continua como painel inferior; nenhum breakpoint foi adicionado ou alterado.

Verificação: 23 testes existentes de tarefas/ação de conta passaram; TypeScript e build
aprovados, com os avisos existentes de chunks/imports dinâmicos/plugins.
Conferência visual no aplicativo ainda não executada.
