# Painel do agente — conversa, sugestões e memória

## Origem e objetivo

O dono relatou precisar rolar até a conversa a cada abertura e não entender o badge persistente “4”. Os prints mostram sugestões longas e memória acima da conversa na mesma área rolável. Melhorar somente painel e balão, preservando a estética de caderno, configuração, transporte e política de consumo.

## Evidência antes da implementação

- `PainelAgente.tsx`: ordem convite → sugestões → fatos globais → conversa. O efeito de scroll depende de `conversa.length`, `status` e `enviandoChat`, sem `aberto` ou caminho da nota.
- `BalaoAgente.tsx`: número é `sugestoesAtivas.length`, não uma contagem de itens não vistos. O tooltip não explica isso. Convite no balão não é filtrado pela nota ativa.
- Sugestões são substituídas a cada ciclo, não persistidas. Conversa é por caminho, incluindo `""` sem nota. Fatos pertencem ao espaço de trabalho e têm origem na nota.

## Interface escolhida

Cabeçalho: **Agente**, controle de pausa/retomada, fechar. Segunda linha: título da nota atual, com caminho completo acessível; sem nota, **Conversa geral**. Exibir pausa explicitamente quando existente, sem redefinir regras do motor.

Três abas dentro do painel:

| Aba | Conteúdo | Escopo |
|---|---|---|
| Conversa | Mensagens identificadas por **Você** e **Agente**, envio e resposta em andamento | Nota atual; conversa geral sem nota |
| Sugestões (4) | Recomendações automáticas, tipos escritos, Copiar, Dispensar, abrir nota relacionada | Nota atual |
| Memória (7) | “O que o agente aprendeu neste espaço de trabalho”; fatos e ação Apagar | Todo o espaço de trabalho |

**Conversa** é selecionada ao abrir/reabrir e trocar de nota. Novos resultados não trocam a aba escolhida. Cada aba tem uma única área rolável; sugestões e memória não ocupam altura da conversa. Contagens das abas representam itens disponíveis, com rótulo explícito; não são notificações.

Convite da nota atual aparece de forma compacta antes das abas, com ações existentes. Não mostrar convite de outra nota. Conteúdo vazio usa texto contextual: “Pergunte algo sobre esta nota.”, “Nenhuma sugestão para esta nota.” ou “O agente ainda não guardou aprendizados neste espaço de trabalho.”

Campo de pergunta permanece no rodapé, sempre disponível nas três abas; ao enviar, seleciona Conversa. Placeholder contextual por nota/conversa geral. Mantidos Enter/Shift+Enter e regras atuais de habilitação; não alterar comportamento de pausa, teto ou créditos nesta tarefa. Créditos/uso e erros continuam no rodapé. Ações dos itens ficam visíveis, sem depender de hover.

Rascunhos ficam apenas no estado local, isolados por espaço de trabalho e conversa. A devolução de uma mensagem longa mantém o rascunho na conversa original. Enter respeita a mesma disponibilidade do botão Enviar. Quando há resposta em outra nota, o painel informa esse estado sem atribuir o spinner à nota atual; mantém o bloqueio global de envio já existente.

Preservar fontes, superfícies, réguas e caráter editorial existentes. Mapear cores semânticas localmente nas superfícies alteradas. Sem edição de primitives, tokens globais, biblioteca ou layout do app. O painel mantém posição desktop; largura deve caber em janelas estreitas sem scroll horizontal. Não introduzir layout mobile global nem sheet nesta tarefa desktop.

## Rolagem

1. Abrir/reabrir ou trocar nota: selecionar Conversa e mostrar últimas mensagens após montar o conteúdo.
2. Enviar: ir ao fim da conversa da nota do envio.
3. Resposta recebida: acompanhar somente se a conversa já estava perto do fim (limiar local de 48 px).
4. Pessoa lendo acima: preservar posição; mostrar botão **Ver resposta mais recente**, que leva ao fim. Não deslocar por status, créditos, erros ou sugestões.
5. Selecionar Conversa após outra aba: mostrar fim da conversa; não afetar scroll do editor ou página. Usar referência do container, não `scrollIntoView` global.
6. Resposta tardia de outra nota não altera posição/contexto da atual.

## Balão e novidades

Trocar o número flutuante por **um ponto** que significa “Atualizações desde a última abertura para esta nota”. Atualizações: novo lote de sugestões com conteúdo diferente ou nova resposta do assistente; não contar mensagens enviadas pelo usuário, fatos da memória, crédito, status, erro ou sugestão dispensada.

Abrir o painel na nota atual reconhece as atualizações dessa nota e remove o ponto, sem apagar sugestões, memória ou conversa. Isso significa **consultar o painel**, não provar que cada item foi lido. Com painel aberto na nota atual, atualizações não geram ponto no balão; o usuário já tem as abas com contagens e o indicador de resposta recente. Sugestões novas não mudam aba nem scroll.

Tooltip/nome acessível com ponto: “Agente — novas sugestões”, “Agente — nova resposta” ou “Agente — novas sugestões e resposta”. Sem ponto: estado atual. Prioridade convite da nota ativa (`!`) > ponto de atualização > estado. Abrir reconhece novidade; convite continua até aceitar/adiar/recusar. Não agregar notas inativas.

Marcadores temporários por nota no store; não persistir formato novo. Conversa carregada ao iniciar é considerada já consultada. Comparar lotes por conteúdo/tipo/caminho relacionado, não IDs regenerados pelo ciclo. Migração de caminho e limpezas devem tratar marcadores; manter política existente de conversas, sem corrigir renomeação de conversas neste objetivo.

Comparação mantém a assinatura do último lote recebido, independente do inventário após dispensar. Painel, balão e motor usam a mesma chave elegível: nota de texto carregada ou `""` para conversa geral (sem nota, desenho ou documento ainda indisponível). Respostas antigas são invalidadas por geração ao trocar espaço de trabalho/limpar memória, evitando anexação e aviso na nova sessão.

## Acessibilidade e limites

Abas com tablist/tab/tabpanel, estado selecionado e navegação por setas/Home/End, sem criar primitive compartilhado. Botões com nomes acessíveis, pausa explícita, copiar/dispensar acessíveis por teclado; preservar Esc/clique fora. Sem anúncio assertivo de cada lote ou salto de foco quando chega resposta.

Conferência DOM/manual permanece necessária: infraestrutura Vitest atual é Node. Testes de store/puras não comprovam posicionamento, foco ou rolagem visual. Não instalar dependências para esta tarefa.

## Implementação da tarefa B

- As três abas usam uma única área rolável por vez; a aba Conversa abre por padrão ao abrir o painel ou mudar a chave de conversa. O campo, créditos/uso e erros permanecem fora dessa área e visíveis em todas as abas.
- A chave de conversa vem de `chaveConversaAgente`, igual à regra do motor: nota comum aberta e carregada usa seu caminho; canvas `.draw.md`, nota ainda não carregada e ausência de nota usam a conversa geral. Rascunhos e erro de mensagem longa ficam isolados por vault e chave normalizada.
- Resposta em voo é identificada por chave de conversa. Ao olhar outra nota, o painel informa que a resposta pertence a outra conversa e não mostra spinner sob as mensagens atuais.
- A largura é `min(360px, viewport - 2rem)` em todos os tamanhos; nenhum breakpoint foi criado nem alterado. O campo e as abas mantêm alvos de toque de pelo menos 44px.
- A rolagem usa `scrollTop` do container local, nunca `scrollIntoView` global: abrir/trocar contexto/enviar vai ao fim; resposta nova preserva leitura acima e expõe “Ver resposta mais recente”. Status, saldo e erros não movem a conversa.
- Sem verificação visual de DOM, foco ou touch ainda; seguir o roteiro manual do plano após a integração A/B.
