# Passagem — feedback e memória do agente

## Entrega

Plano 19, primeira etapa implementada. Estado e testes: Luna 6 high
`execucao_feedback_estado`. Prompt, seleção de contexto e igualdade: Luna 6 high
`execucao_memoria_contexto`. Interface, integração, documentos e checks gerais:
coordenação, pois a sessão recusou novos agentes pelo limite de threads.
Houve revisão cruzada dos contratos. Não atribuir execução medium/low a agentes inexistentes.

- Atividade por operação, nota e geração; leitura inicial, recuperação local, contexto,
  sugestões e chat aparecem acima das abas. Balão acompanha trabalho real na nota atual.
- Sugestões por nota e Memória por vault têm avisos independentes de inclusões. Selecionar
  reconhece somente a versão consultada; resultados posteriores voltam a sinalizar.
- Aceite inicial permite nota curta, com retries transitórios e backoff existentes,
  encerrando a pendência após sucesso ou esgotamento. Ciclos seguintes mantêm seus gatilhos.
- Fatos inteiros selecionados por relevância lexical/recência, orçamento de 4.800
  caracteres e limite individual de 500 caracteres Unicode. Prompt mais restritivo e
  dedupe textual NFC/caixa/espaços. Memória mostra origem e data existentes.

Arquivos principais: `src/estado/agenteStore.ts`, `src/types/atividade-agente.ts`,
`src/types/avisos-agente.ts`, `src/agente/{assistente,memoria,regras-memoria}.ts`,
`src/ui/excalisidian/{PainelAgente,BalaoAgente}.tsx` e CSS local do painel.

## Checks

- Suíte completa: 1.599 testes, 131 arquivos aprovados.
- Store dirigido: 75 testes aprovados; assistente/memória dirigidos: 23 aprovados.
- Build (`tsc && vite build`): aprovado; avisos existentes de tamanho de chunks e
  imports dinâmicos ineficazes permanecem.
- `git diff --check`: aprovado.
- Sem conferência manual no app nesta rodada; testes de store não demonstram layout DOM.
  Nenhum breakpoint novo, alteração de primitives, dependência ou deploy. Sem commit.

## O que o dono do produto precisa conferir

1. Aceitar convite em nota curta: atividade aparece e termina; falha temporária tem
   espera de retry, sem ciclo infinito após esgotar. Enviar chat durante acompanhamento:
   terminar uma operação não deve ocultar outra ainda ativa.
2. Manter Conversa aberta até chegarem resultados: pontos em Sugestões/Memória.
   Consultar uma aba reconhece apenas seu ponto. Nova inclusão volta a avisar mesmo
   se a aba ficou aberta; remoção não gera aviso. Contagens são inventário disponível.
3. Trocar nota/vault durante pedido: não mostrar atividade ou resultado da nota antiga
   na conversa atual. Reabrir conversa vai ao final; ao ler mensagens antigas, nova
   resposta oferece acesso ao final sem interromper a leitura.
4. Memória mostra origem/data, mantém fatos antigos e permite remover individualmente.
   Repetição com caixa/espaçamento diferente não acrescenta fato; números e negações
   diferentes não são considerados iguais pelo filtro textual.
5. Conferir legibilidade, foco e rolagem nas três abas. Não há título repetindo a nota.

## Continuação

Paráfrases do print ainda podem passar pelo filtro textual. Não houve fusão nem limpeza
automática de memórias anteriores. Segunda etapa: fatos estruturados com fonte/evidência,
candidatos semelhantes ou contraditórios para revisão recuperável, compatibilidade da
persistência e seleção de memória para o chat. O prompt orienta o modelo; não comprova
que uma afirmação é verdadeira. O chat continua sem gravar ou receber fatos duráveis.
