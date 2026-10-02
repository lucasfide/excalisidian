# Passagem — uso do painel do agente

## Entrega

Planejamento, implementação e revisão concluídos após os prints do dono. O antigo “4” era
a quantidade de sugestões da nota, não mensagens nem aprendizados. Agora a contagem fica
na aba Sugestões; o balão usa ponto temporário para atualizações desde a abertura.

- **Conversa**, **Sugestões (N)** e **Memória (N)** têm áreas separadas. Memória identifica o
  escopo do espaço de trabalho; sugestões mostram seu tipo e ações sempre disponíveis.
- Abrir/reabrir ou trocar nota seleciona Conversa nas mensagens recentes. Resposta recebida
  acompanha quem está no fim; quem lê acima mantém a posição e recebe **Ver resposta mais recente**.
- Ponto significa novas sugestões ou nova resposta para a conversa atual; abrir reconhece
  essas atualizações e remove o ponto sem apagar conteúdo. Memória, mensagens do usuário,
  consumo/status/erro e lotes idênticos não criam ponto.
- Nota, desenho e conversa geral compartilham o contexto do motor. Rascunhos ficam isolados
  por espaço de trabalho/conversa. Respostas de outro espaço de trabalho são descartadas;
  resposta em outra nota não é exibida como se pertencesse à atual.
- Créditos, entrada na conta e ações de pausa continuam nos seus lugares. Nenhuma mudança
  no servidor, dependências, primitives ou layout global; sem commit/deploy.

## Distribuição e arquivos

Luna 6 **high**: store e balão; **medium**: painel/rolagem e revisão independente;
**low**: documentação. Coordenação integrou os contratos, fechou documentação e rodou checks.

Arquivos desta continuação: `src/estado/agenteStore.ts` e teste existente,
`src/types/atualizacoes-agente.ts`, `src/ui/excalisidian/BalaoAgente.tsx`,
`balao-agente.css`, `PainelAgente.tsx`, `painel-agente.css`, `docs/11-agente-ia.md`,
plano 18 e desenho do painel. Mudanças anteriores do assistente e temporizador HTTP
permanecem na árvore e estão descritas em `PASSAGEM-2026-09-30.md`.

## Verificação realizada

- `rtk npm test`: **1.588 testes em 131 arquivos aprovados**.
- Store dirigido: **71 testes aprovados**, incluídos no total.
- `rtk npm run build`: **aprovado**, com TypeScript e Vite.
- `rtk git diff --check`: aprovado.
- Revisão independente final: sem bloqueios nos caminhos tratados.

A tentativa inicial de build encontrou TS2783 no objeto de flags e usos de `.at`
incompatíveis com a configuração TypeScript; ambos foram corrigidos antes do build final.
Persistem avisos de imports dinâmicos/chunks e tempo de plugins, sem erro.

**Conferência visual e de teclado ainda pendente.** Vitest é Node; testes de store não
comprovam foco, aparência e rolagem no WebView. Não foram feitas capturas automáticas.

Responsividade: nenhum breakpoint foi criado/alterado. Largura local é
`min(360px, 100vw - 2rem)`; sm/md/lg/xl mantêm 360px. Em janelas menores, o painel cabe
na largura disponível. A posição desktop e regras de outras telas não mudaram.

## Conferência do dono no app

1. Abrir uma conversa longa, fechar e reabrir: últimas mensagens visíveis sem rolar;
   a nota no editor mantém sua posição.
2. Rolar para mensagens antigas e enviar/aguardar resposta: envio vai ao fim; resposta
   recebida durante leitura acima mantém posição e oferece botão para a resposta recente.
3. Conferir as abas: contagens identificadas, sugestões sem empurrar conversa, autores
   distintos, copiar/dispensar/abrir nota/apagar aprendizado acessíveis.
4. Aguardar atualização com painel fechado: ponto no balão. Abrir: ponto some, conteúdos
   continuam. Dispensar e receber um lote idêntico não recria o aviso.
5. Trocar entre notas A/B enquanto chega resposta: histórico/contexto/convite corretos.
   Abrir desenho ou início: conversa geral. Trocar espaço de trabalho durante pedido:
   resposta antiga não aparece no novo. Rascunhos não atravessam esses contextos.
6. Pausa, créditos e entrada na conta continuam funcionando; saldo/status não movem scroll.
   Enter e botão Enviar têm a mesma disponibilidade; Shift+Enter insere linha.
7. Navegar abas com setas/Home/End, ações com Tab e fechar com Esc. Reduzir largura da
   janela: textos/caminhos sem rolagem horizontal; conferir também janela desktop normal.

Plano: `plans/2026-09-30-18-painel-agente.md`.
Desenho: `specs/2026-09-30-painel-agente-design.md`.
