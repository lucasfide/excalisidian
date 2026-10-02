# Plano 19 — feedback e qualidade da memória do agente

**Estado:** primeira etapa implementada e revisada; suíte, build e diff aprovados.
Pedido direto de remover nome da nota já aplicado e conferido por suíte/build.
**Análise e desenho proposto:** `../specs/2026-09-30-decisoes-memoria-agente-analise.md`.

## Ordem sugerida para execução Luna 6

| Tarefa | Effort | Escopo | Dependência |
|---|---|---|---|
| A — atividade e novidade | high | Operações por ID/nota/vault, versões vistas das abas, memória global e primeiro ciclo; store/tipos e testes existentes | Definir contrato antes da UI |
| B — feedback visual | medium | Painel, CSS local e balão: atividade real em qualquer aba, pontos de novidade, reconhecimento só da aba consultada | Contrato A; não editar store simultaneamente |
| C — contexto/prompt/igualdade | high | Fatos inteiros e relevantes, recência, limite por item, prompt restritivo e dedupe exato normalizado; assistente/memória | Separada de A/B no código; integração store sequencial |
| D — auditoria final | medium | Somente leitura de diffs e contratos: concorrência, novidades ao atingir FIFO, sessão, falsos positivos e compatibilidade | Depois A/B/C |
| E — documentos e roteiro | low | docs11, evidência dos checks e conferência manual | Depois da revisão |

Distribuição executada após autorização: A por `execucao_feedback_estado` (Luna 6 high),
C por `execucao_memoria_contexto` (Luna 6 high). B e E pela coordenação: o limite de threads
impediu iniciar o executor medium. Revisão cruzada dos contratos pelos executores e pela
coordenação; não houve executor low separado. Os esforços da tabela são o desenho original.

Memória estruturada, candidatos para revisão e continuidade do chat são uma segunda
etapa: precisam de desenho de migração/controle antes de implementação. Nenhuma limpeza
automática de memórias anteriores faz parte deste plano.

## Aceite proposto

- Aceitar convite mostra atividade real enquanto houver trabalho; finalizar chat não
  apaga atividade de resumo/ciclo ainda em voo. Troca vault e erros limpam só suas operações.
- Sugestões/Memória indicam inclusões mesmo com Conversa aberta; abrir uma aba reconhece
  somente a versão consultada. FIFO com contagem constante ainda gera novidade por inclusão.
- Lote idêntico, fato rejeitado/duplicado e remoção de item não produzem falso aviso de inclusão.
- Primeira análise curta funciona sem tornar os ciclos seguintes pedidos sem alterações.
- Contexto usa fatos inteiros dentro do orçamento e não privilegia antigos por acidente.
- Exemplo “nota”/“nota de status” vira candidato a duplicata na etapa de revisão, sem fundir
  afirmações com valores, datas ou negações diferentes. Sem promessa de dedupe semântica perfeita.
- Sem novas chamadas/dependências apenas para filtros locais; sem alterações no backend,
  preços, modelos comerciais, pesquisa web ou regras de consentimento para notas.

Checks executados: 1.599 testes em 131 arquivos; build (`tsc && vite build`) aprovado,
com avisos existentes de chunks/imports dinâmicos; diff sem erros. Conferência no app
para fases, abas, foco e legibilidade permanece com o dono. Não alegar cobertura DOM
por teste de store. Roteiro: `../passagem-2026-09-30-feedback-memoria-agente.md`.
