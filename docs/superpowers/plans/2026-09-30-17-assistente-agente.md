# Plano 17 — assistente do agente

**Estado:** implementação e revisão concluídas. Suíte completa: 1.588 testes em 131 arquivos aprovados; build TypeScript + Vite aprovado. Conferência visual no app pelo dono permanece pendente; roteiro em `../PASSAGEM-2026-09-30.md`. Alterações sem commit e sem deploy.
**Desenho:** `../specs/2026-09-30-assistente-agente-design.md`.
**Origem:** passagem de 29/09, sete testes manuais realizados pelo dono e desenho de dois passos apresentado pelo Claude.

## Evidência antes da implementação

- `DialogoAgente.tsx`: cinco etapas fixas, provedor inicial OpenAI, reconfiguração no passo 2; ação final apenas no passo 5 e sempre “Ativar agente”.
- `rascunhoAgente.ts`: trocar para outro provedor deixa modelos vazios. Pular os passos 3/4 exige preencher os IDs lógicos automaticamente.
- `agenteStore.atualizarSaldo()`: exige configuração própria habilitada. Não atende à primeira configuração nem à preferência com agente desligado.
- `consultarCreditos`: distingue sucesso, sessão, plano e rede; `buscarSaldoCreditos` perde essa distinção. A UI nova precisa da primeira função.
- `App.abrirPreferencias("conta")`: já preserva o assistente e força a ordem correta dos portais. O painel deve consumir o mesmo callback.
- `abasPreferencias.ts`: a busca indexa “Modelos”; precisa acompanhar a apresentação própria “Créditos”.
- Vitest usa Node e arquivos `.test.ts`; não há ambiente DOM/Testing Library. Não instalar dependências para esta tarefa.
- Scripts existentes: `test` e `build` (TypeScript + Vite). Não existem scripts separados `lint` ou `typecheck`.

## Agentes e ordem

Todos os executores e revisores abaixo usam **`gpt-6-luna`**. O coordenador distribui uma tarefa por vez quando houver dependência ou arquivo compartilhado.
O esforço mede dificuldade de decisão, não tempo. As três análises de preparação já foram distribuídas a Luna com esforços high, medium e low.

| Tarefa | Effort | Responsabilidade | Depende de |
|---|---|---|---|
| A — saldo de apresentação e estados | high | Consulta assíncrona, identidade da sessão, recusas 401/403 e lógica testável | Implementada; 10 testes direcionados reportados como aprovados |
| B — assistente de dois passos | high | Defaults, navegação, ação final, conta, salvamento e preservação dos externos | Implementada; 10 testes direcionados reportados como aprovados |
| C — preferências e painel | medium | Créditos, busca, callback Conta e sinal de sessão no painel | Implementada e revisada; 71 testes do store e 36 de preferências/painel aprovados |
| D — revisão independente | high | Revisar diff, segurança, regressão dos externos e cobertura; solicitar correções cirúrgicas | Concluída: root revisou B; executor B revisou A/C em modo somente leitura; correções integradas, sem bloqueios finais |
| E — documentos e entrega | low | Documentos normativos, checks finais e roteiro manual adicional | Documentos atualizados; checks globais e passagem final concluídos por root |

As partes independentes de B podem começar durante A, com integração do hook somente após receber o contrato. Não rodar B e C simultaneamente: ambos podem precisar editar catálogo de agente, CSS de domínio e contratos de apresentação.
O revisor não implementa uma segunda solução; devolve problemas concretos ao executor responsável.
Não commit/deploy nesta rodada de planejamento. Na execução, commits somente por caminhos explícitos, após revisar o diff; nenhum acesso à VPS.

## A — contrato de consulta e apresentação

**Ler:** `src/servico/{saldoCreditos,creditos,modoServidor,sessao}.ts`, `contaStore.ts`, `agenteStore.ts` (somente para entender os invariantes de saldo).

**Criar, se não houver equivalente:** hook `src/hooks/use-saldo-creditos-conta.ts`, lógica pura de consulta/estado e tipos de domínio em `src/types/creditos-conta.ts`. Testes `.test.ts` junto da lógica pura.
Não migrar o saldo do motor a um store novo nem remover as condições de `atualizarSaldo()`.

Contrato a entregar para B/C:

```text
entrada: ativo, sessão atual e conta carregada
saída discriminada: inativo | verificando | sem-sessao | plano-insuficiente
                    | consultando | disponivel(saldo) | indisponivel-rede
                    | acesso-nao-confirmado
```

- Ativar consulta apenas para sessão premium carregada, provedor próprio e superfície aberta, no modo servidor real.
- Consultar com `consultarCreditos`; saldo zero é `disponivel`, não ausência de saldo.
- Resetar imediatamente por identidade da sessão/token; proteger também a renderização inicial após mudança, antes do efeito de reset.
- Invalidar pedidos em voo ao desmontar, mudar provedor ou sessão; testar resposta atrasada e ordem invertida de respostas.
- Não persistir token, saldo ou estado de UI em `settings.json`, logs ou armazenamento de navegador.
- Sem polling e sem repetir fetch em cada render. Deduplicar chamadas concorrentes das duas superfícies se necessário, limitando o mecanismo à consulta de apresentação.
- Conservar o timeout do serviço. Se ele não limitar todo o fetch/leitura, aplicar limite à consulta de apresentação sem alterar o transporte do agente.
- 401: uma recuperação limitada usando `sincronizarComCofre()` e `atualizarPlano()` existentes, sem modificar seus contratos. Sessão fica null por expiração confirmada → sem-sessao; token novo → nova consulta; sessão ainda presente com recusa/validação inconclusiva → acesso-nao-confirmado, botão “Tentar novamente” e conclusão bloqueada. Não chamar `sair()` nem limpar o cofre. 403: plano-insuficiente. Rede sem recusa de autenticação anterior: indisponivel-rede, que permite conclusão somente com sessão premium atual. Uma falha de rede durante confirmação de 401 não libera a ação final.
- Reutilizar `restantes`, `formatarCreditos`, `formatarRenovacao`. Não duplicar aritmética, calendário, cotas ou formatação.
- Um componente pequeno reutilizável em `src/components/features/creditos-agente.tsx` atende às duas superfícies, com props por `interface`. Sua implementação visual pode ficar com B após o contrato de A.
- Lógica pura define também a permissão da ação final; o JSX e o handler devem consumir a mesma regra.

**Aceite:** saldo funciona sem agente configurado/habilitado; nenhuma resposta de conta anterior aparece; 401/403 bloqueiam e rede termina sem saldo inventado.

## B — diálogo e configuração

**Arquivos existentes:** `src/ui/excalisidian/DialogoAgente.tsx`, `rascunhoAgente.ts` e teste; `src/i18n/catalogo/agente.ts`.
**Novos arquivos de domínio:** somente os necessários para lógica pura/visual compartilhada e CSS local de tokens.

1. Default Excalisidian quando disponível e sem config; conservar provedor salvo na reconfiguração.
2. Próprio com dois rótulos e passo 2 terminal. Externos com os cinco passos atuais.
3. Inicialização e troca para IA própria preenchem `MODELO_LEITURA`/`MODELO_ACOMPANHAMENTO`.
4. Renderizar estados e ações definidos no desenho, com um único botão de entrada e saída explícita para o plano grátis.
5. Preservar `aoAbrirConta` e rascunho; mudança de sessão atualiza a tela automaticamente.
6. No ramo próprio de `concluir`, fixar modelos e parâmetros apropriados. Não confiar apenas em campos de rascunho ocultos.
7. Conferir sessão e resultado relevantes novamente no handler final; se mudou a identidade desde a consulta, aguardar o estado da conta nova. Bloquear clique duplo; falha ao salvar deixa o diálogo aberto com mensagem adequada.
8. Externos mantêm chave, URL avançada, lista/fallback de modelos, pensamento, teto e revisão. Única alteração visível extra: “Salvar” para config existente.
9. Textos novos PT/EN. Não ampliar esta tarefa para tradução completa do componente.
10. Aplicar aliases semânticos de cores somente ao domínio alterado, com valores do tema atual. Não editar primitives nem tokens globais.

**Testes:** primeiro setup, disponibilidade do provedor, reconfiguração, 2/5 etapas, modelos fixos, retorno/troca de provedor, estados da conta, recusa final depois de troca de sessão, preservação de chaves/base URLs externas e ausência de gravação antes do final.
Lógica testada deve ser a usada pelos handlers; não criar testes que só conferem strings ou um array de rótulos.

## C — preferências e entrada pelo painel

**Arquivos:** `DialogoPreferencias.tsx`, `PainelAgente.tsx`, `src/app/App.tsx`, `abasPreferencias.ts` e teste; catálogos `prefs.ts`/`agente.ts`.

- Preferências próprias usam consulta A e componente de créditos B, também com agente desligado.
- Trocar título/descrição da linha apenas no provedor próprio; conservar “Reconfigurar”. Não sumir com a ação quando o saldo falha.
- Índice de busca passa a receber o provedor/capability necessário para indexar Créditos ou Modelos corretamente. Preservar IDs existentes quando isso evitar mudanças desnecessárias.
- Passar `aoAbrirConta` por `interface` de props do painel e ligá-lo ao callback existente em App, sem mudar o mecanismo global de preferências.
- Botão do painel apenas na IA própria, em ausência de sessão ou falha de sessão. Ausência de sessão sozinha não cobre 401 com sessão local ainda presente.
- No clique após falha de sessão, adotar/validar a conta pelo fluxo existente antes de abrir preferências. Expiração confirmada deixa Conta no formulário de entrada. Token válido recuperado retoma o fluxo; recusa sem expiração confirmada oferece tentativa novamente, sem chamar logout ou prometer login numa tela ainda conectada. Usar o mesmo contrato de recuperação limitada de A, sem duplicar lógica.
- Se necessário, acrescentar sinal tipado mínimo `erroDeSessao` ao `agenteStore` e seu teste, exclusivamente para essa apresentação. Atualizar nos caminhos de erro de gateiro/ciclo/chat e limpar nos mesmos pontos em que o erro correspondente é limpo/substituído. Não refatorar a política de erros ou tentativas.
- Nenhum botão de entrada em erro de rede/plano/créditos ou em provedor externo.

**Testes:** consulta própria desligada, falha sem perda da ação, indexação Créditos/Modelos, sinal de sessão nos três caminhos, limpeza após recuperação/troca de config/sessão e seleção da ação Conta; 401 com token de outra janela, expiração confirmada e confirmação inconclusiva, sem logout destrutivo ou CTA de login que leve apenas a “Conectado como”.
Posicionamento, portal e clique visível entram no roteiro manual; não alegar cobertura DOM a partir de teste de helper.

## D — revisão e checks

Revisor Luna high lê o diff inteiro e o desenho antes de aprovar:

- Sessão e plano não podem ser contornados no handler final; rede não é confundida com 401/403.
- Saldo pertence à sessão atual e não depende de configuração prévia.
- Config própria não contém modelos vazios, URLs customizadas ou opções externas herdadas.
- Nenhuma ativação automática, chamada de IA para testar conexão ou envio de nota antes do aceite.
- Cinco passos externos, fluxo de portal e recuperação do motor continuam preservados.
- CSS é local, cores semânticas, props com interface, nenhum any, nenhuma dependência nova.
- Busca das preferências e texto restante/total correspondem ao que a tela mostra.
- Nenhuma mudança em telas ou serviços fora do escopo; verificar status para não misturar alterações de outra origem.

Executores rodam testes direcionados após suas mudanças. Depois da revisão, rodar uma vez:

```powershell
rtk npm test
rtk npm run build
rtk git diff --check
rtk git status --short
```

Não há lint/typecheck separados; o build inclui TypeScript. Sem alteração de servidor, não é necessário executar sua suíte nesta tarefa.
Se aparecer falha, reportar e resolver dentro do escopo; não declarar conclusão com check pendente. Não repetir a suíte inteira após documentação apenas.

## E — documentação e roteiro do dono

Atualizar somente as seções correspondentes em `docs/11-agente-ia.md` (§6.2, §6.3, testes/RF11.1 conforme localização atual), e registrar a decisão do fluxo em `docs/09-decisoes-e-incertezas.md` usando o próximo ADR livre verificado na execução.
Criar passagem nova indicando implementação/checks efetivamente realizados e os sete testes antigos já realizados pelo dono. Não reescrever planos históricos 15/16.
Commit sugerido da implementação: `feat(agente): simplify Excalisidian setup and show credits`.
Commit de documentos, se separado: `docs: record agent setup flow and manual checks`.

Roteiro manual adicional, após implementação, com servidor real:

1. Primeira configuração: próprio já selecionado; somente Provedor → Sua conta. Fechar antes de ativar não liga o agente.
2. Sem conta: mensagem neutra e botão de entrada; login por cima do assistente; ao voltar, conta e saldo atualizados automaticamente.
3. Conta grátis: link volta ao provedor; selecionar externo mantém os cinco passos.
4. Premium: e-mail, créditos restantes/total e renovação; ativar. Reconfigurar mostra “Salvar” e mantém valores corretos. Conferir cota superior apenas se já houver conta disponível.
5. Com sessão premium carregada, ficar offline: saldo/data desaparecem após a consulta falhar, e é possível salvar. Ao voltar à tela online, saldo reaparece.
6. Preferências próprias: Créditos e Reconfigurar, inclusive desligado; buscar “créditos” encontra a linha. Externo mantém Modelos.
7. No painel, aviso de sessão acompanha botão de entrada que abre Conta; erro de rede não ganha esse botão. Conferir Esc/retorno e foco no caso de preferências já abertas.
8. Iniciar a busca de modelos de um provedor externo, abandoná-la voltando ao provedor e escolher a IA do Excalisidian; confirmar que a resposta atrasada da busca não leva o assistente de volta ao passo 3.

Não criar contas, apagar configuração do dono, forçar falhas no servidor ou capturar telas automaticamente para cumprir o roteiro. Usar sessões/ambientes de teste já disponíveis.

## Retomada

Execução concluída: A e B foram implementadas em paralelo parcial; seus executores reportaram 10 testes direcionados aprovados cada. C foi integrada, incluindo Preferências e o botão do painel com recuperação limitada de sessão. Root revisou B; o executor B revisou A/C sem editar esses arquivos. Correções foram integradas e a releitura final não apontou bloqueios. Root executou a suíte completa (1.588 testes/131 arquivos) e o build, ambos aprovados. A passagem de 30/09 contém o roteiro manual adicional ainda pendente.
Se surgir necessidade real de mudar hook utilitário, tema ou primitive global, perguntar o alcance antes de executar, conforme instrução do dono. Os contratos deste plano foram definidos para evitar essa necessidade.
