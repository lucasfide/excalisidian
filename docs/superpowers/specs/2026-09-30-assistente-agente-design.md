# Assistente do agente — continuação de 30/09/2026

Base: `PASSAGEM-2026-09-29.md` e desenho apresentado pelo Claude, reproduzido pelo dono nesta sessão.
O dono informou que realizou todos os sete testes da seção “O que o dono do produto precisa testar”.
Nenhuma falha foi relatada nesta sessão. Isso é registro do teste manual do dono, não uma nova execução automatizada.

O desenho e o plano foram preparados na rodada anterior. A implementação foi autorizada em 30/09/2026 e está em andamento conforme `../plans/2026-09-30-17-assistente-agente.md`.

## Escopo

Melhorar a configuração da IA do Excalisidian, a linha correspondente nas preferências e a entrada na conta pelo painel do agente.
Provedores externos mantêm cinco passos; na reconfiguração, a ação final passa a dizer “Salvar”.
Cobrança, upgrade, nome do plano superior, tradução completa das telas antigas, sincronização, VPS e pendências menores da passagem ficam fora desta tarefa.

## Interface

Manter a aparência de caderno editorial, fontes, espaçamentos, controles e transições existentes.
A mudança de conteúdo ocorre nas três superfícies citadas, sem redesenhar o diálogo ou o painel.

IA do Excalisidian: **Provedor → Sua conta**. Não há passos de modelos ou revisão.
Na primeira configuração, selecionar a IA do Excalisidian se ela estiver disponível na lista.
Na reconfiguração, preservar o provedor salvo e abrir o segundo passo, como hoje.
Se `CONTA_DISPONIVEL` ocultar o provedor próprio, selecionar OpenAI; nunca selecionar uma opção invisível.

| Situação em “Sua conta” | Conteúdo | Ação |
|---|---|---|
| Conta ainda carregando | “Verificando sua conta…” em texto neutro | Não oferecer ativação |
| Sem sessão, ou sessão recusada | “Entre na sua conta do Excalisidian para usar a IA incluída no plano.” | Botão primário “Entrar na conta” |
| Conta grátis, ou acesso recusado por plano | “A IA do Excalisidian faz parte do plano premium. Sua conta está no plano grátis.” | Link “Usar outro provedor”, volta ao passo 1 |
| Premium e saldo disponível | Quadro com e-mail e saldo/renovação; explicação abaixo | “Ativar agente”, ou “Salvar” na reconfiguração |
| Premium, consultando saldo | E-mail e explicação; nenhum número provisório | Aguardar a primeira consulta antes da ação final |
| Premium, consulta de saldo falhou por rede | E-mail e explicação; omitir saldo/renovação | Permitir ativar/salvar |
| Créditos recusaram a sessão, mas a conta ainda não confirmou expiração | “Não foi possível verificar o acesso à IA. Tente novamente.”, sem saldo | “Tentar novamente”; não ativar |

A verificação inicial de saldo termina no limite de tempo já usado pelo serviço; não pode deixar a tela esperando indefinidamente.
“Voltar” permanece disponível no passo 2, inclusive durante consulta de saldo.
Não mostrar um botão “Continuar” desabilitado junto do convite para entrar ou do aviso de plano grátis.
Não duplicar “Entrar na conta” no corpo e no rodapé: posicionar uma única ação principal junto do texto.

Exemplo de composição premium (valores apenas ilustrativos, jamais mocks na implementação):

```text
Provedor → Sua conta

email da conta
2.740 de 3.000 créditos restantes este mês · renova em 1 de out.

Cada pedido ao agente gasta uma parte dos créditos,
conforme o tamanho do texto enviado e da resposta.

Voltar                                      Ativar agente
```

“2.740” significa créditos **restantes**, calculados por `restantes(saldo)`; não são créditos usados.
A frase completa acima substitui o trecho truncado na mensagem do Claude e não promete um custo fixo por pedido.
O total vem do servidor: tanto 3.000 quanto 10.000 são tratados sem nome comercial de plano e sem cotas hardcoded.
Usar `formatarCreditos` e `formatarRenovacao`; manter fuso de Brasília e arredondamento existente.
Saldo zero real continua visível; não é falha de rede. A configuração pode ser salva, e a política atual de créditos esgotados continua valendo.

“Sem internet” permite concluir apenas quando existe sessão premium já carregada.
Se a abertura do app offline não recuperar a sessão, mostrar o caminho para entrar; não inventar autenticação offline.

## Conta, preferências e painel

- “Entrar na conta” abre Preferências → Conta por cima do assistente, preservando seu rascunho. Após entrar, o assistente se atualiza pelo `contaStore`, sem fechar e reabrir.
- Plano grátis conserva a atualização de plano que já acontece ao entrar no passo Conta. A consulta de créditos não substitui a verificação de direito de acesso.
- Preferências → Agente: somente no provedor próprio, “Modelos” vira “Créditos”. Mostrar saldo, renovação e a mesma explicação; manter “Reconfigurar”, inclusive quando o agente está desligado.
- Sem saldo confiável nas preferências, ocultar apenas o número/data; manter a linha, a explicação e “Reconfigurar”.
- Atualizar a busca das preferências para encontrar “Créditos” na IA própria; provedores externos continuam indexando “Modelos”.
- Painel: junto da mensagem que solicita entrada, mostrar “Entrar na conta”, abrindo a mesma aba Conta. Detectar a situação por sessão/código de falha, sem comparar texto traduzido.

## Comportamento e segurança

- Seleção de provedor e consulta de saldo não ativam o agente nem enviam notas à IA. Apenas a ação final salva a configuração.
- No provedor próprio, preencher automaticamente `MODELO_LEITURA` e `MODELO_ACOMPANHAMENTO`; persistir `thinking: "padrao"`, `webSearch: false`, `tetoDiarioUsd: null` e remover override de base URL desse provedor.
- Conservar as chaves e base URLs dos demais provedores, como no código atual; não copiar modelos externos para a IA própria.
- Antes de salvar, conferir novamente a sessão/conta, o provedor escolhido e eventuais recusas de sessão/plano. Desabilitar a ação enquanto salva para evitar clique duplo.
- 401/403 não são tratados como offline e bloqueiam a ação final. Após 401, usar `sincronizarComCofre()` e `atualizarPlano()` existentes: recuperar token de outra janela ou confirmar a expiração. Apenas a confirmação de expiração pelo fluxo de conta pode limpar a sessão; não chamar `sair()` por falha de saldo. Token novo permite uma nova consulta. Se a sessão continuar presente e o acesso continuar recusado, oferecer “Tentar novamente” em estado de acesso não confirmado, sem fingir que o formulário de login estará disponível. Sessão ausente abre entrada; 403 oferece outro provedor.
- Toda mudança de conta/token ou de provedor invalida imediatamente o resultado anterior; uma resposta atrasada não pode mostrar saldo de outra conta.
- A consulta nova atende apenas assistente/preferências. Reutiliza o serviço HTTP e os formatadores existentes; não modifica os timers, a pausa ou o saldo do motor do agente.
- Nenhum polling novo; consultar ao entrar na superfície e ao mudar a sessão relevante. Em DEV local, não consultar o servidor real nem fabricar saldo.

## Convenções desta execução

As instruções do dono nesta sessão prevalecem sobre os documentos antigos onde houver conflito: novos arquivos em kebab-case, props por `interface`, nenhum `any`, cores por tokens semânticos shadcn.
O repositório hoje usa `papel`, `tinta`, `regua` etc., e não oferece os aliases shadcn. Para atender ao pedido sem mudar o tema global, mapear somente nas superfícies alteradas os tokens semânticos aos valores já existentes, por CSS de domínio com seletores locais. Não alterar `globals.css` nem primitives compartilhados.
Exemplos de mapeamento local: `background` → `papel`, `card` → `superficie`, `foreground` → `tinta`, `muted-foreground` → `tinta-media`, `border` → `regua`, `primary` → `cristal`, `destructive` → `bordo`. Não inventar cores nem escrever hex/RGB/HSL.
Reutilizar os primitives existentes em `src/ui/`; nenhum arquivo em `src/components/ui/` será editado.
Textos novos entram nos catálogos existentes em PT/EN; a tradução completa das telas antigas continua adiada.
Não mudar breakpoints ou introduzir um fluxo mobile neste trabalho; conferir quebra de linha do saldo/e-mail nos tamanhos atuais do diálogo.

## Aceite

O assistente próprio termina no segundo passo e nunca salva modelos vazios ou parâmetros herdados de outro provedor.
Login atualiza a tela aberta; conta grátis tem saída explícita; offline não exibe números inventados.
As preferências mostram créditos e continuam reconfiguráveis; o painel abre a aba Conta.
Os provedores externos conservam os cinco passos, os campos, a listagem de modelos e a revisão.
Testes automatizados da lógica e build passam; o dono recebe somente o roteiro manual adicional desta mudança.
