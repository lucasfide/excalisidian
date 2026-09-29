# IA do Excalisidian — restante da análise de 28/09 (rodada 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** fechar os bugs menores e as inconsistências que sobraram da análise da IA própria (depois das
cinco correções do plano 15), sem mexer no assistente de configuração (próximo foco, plano à parte).

**Architecture:** seis tarefas. T1–T4 no app, T5 no servidor, T6 só documentação. T3 e T4 tocam
`agenteStore.ts` e rodam em sequência; as demais em arquivos próprios.

**Spec:** `docs/11-agente-ia.md` (§3.2, §4, §5, §6.2, §7), `docs/18-servidor.md` (§3, §4, §5),
ADR-38, ADR-43, ADR-44. Origem: análises de funcionamento e de interface de 28/09 (resumo na conversa).

## Global Constraints

- Português do Brasil em nomes, comentários e textos. Texto novo de interface no catálogo
  (`src/i18n/catalogo/`) com pt-BR e en; nunca literal em JSX **novo** (a migração dos literais antigos
  continua adiada pelo dono do produto — ADR-36 — não é escopo aqui).
- Nenhum valor visual fora dos tokens (`docs/06-design-system.md`); nenhuma classe de cor padrão do Tailwind.
- Commit sempre por caminho explícito. **Edições ALHEIAS não commitadas** em `servidor/implantacao/backup.sh`,
  `servidor/implantacao/excalisidian-backup.service`, `servidor/src/armazenamentoSync.ts`, `servidor/src/rotas.ts`,
  `servidor/src/sync.test.ts`, `src/estado/syncStore*.ts`, `src/sync/*`: nunca editar nem commitar.
- Testes: `npm test` e `npx tsc --noEmit` na raiz (hoje 1517); `cd servidor && npm test && npx tsc --noEmit`
  (hoje 142). Sem jsdom: só módulos puros e stores com dublês têm teste.
- Os seis provedores de chave própria não mudam de comportamento, salvo onde a tarefa diz.

## Review Focus

1. Usuário no Acre/Amazonas: a data de renovação dos créditos mostra o dia 1º, não o dia 31.
2. Duas mensagens enviadas rápido no chat não podem sair sem a resposta da primeira no histórico.
3. Falha do fornecedor: o dono do produto consegue ver na VPS **por que** falhou, sem texto de nota nem chave no log.
4. App aberto por mais de 30 dias sem reiniciar: a sessão não vence (é renovada antes).
5. "Testar conexão" com sessão vencida ou conta grátis não pode dizer "Conexão funcionando".

---

### Task 1 (esforço baixo): Medidor e painel — data, plural, redundância, convite

**Files:** `src/ui/excalisidian/PainelAgente.tsx`, `src/ui/excalisidian/BalaoAgente.tsx` (só se o item 5
for real), `src/i18n/catalogo/agente.ts`, `src/servico/creditos.ts` (+test) se a formatação da data virar
função pura.

1. Data de renovação (`MedidorCreditos`): formatar com `timeZone: "America/Sao_Paulo"`, dia e mês curto
   por extenso (`{ day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }`, no idioma corrente).
   Extrair para uma função pura `formatarRenovacao(ms, idioma)` em `src/servico/creditos.ts`, testada:
   `Date.UTC(2026, 9, 1, 3, 0, 0)` → contém "1" e "out" em pt-BR (não "30"/"set"), mesmo se o fuso da
   máquina for UTC−5 (o teste não depende do fuso local porque o formatador fixa o fuso).
2. Plural: "1 crédito restante" / "{restantes} créditos restantes" (en: "1 credit left" / "{restantes}
   credits left"). Nova chave `agente.creditos.restante` para o singular; escolher pela quantidade.
3. Redundância: no estado `esgotado`, não mostrar a linha "0 créditos restantes" — só a mensagem de
   esgotado com a data. No `acabando`, manter as duas linhas como estão.
4. Convite na nota errada: o convite só aparece no painel quando `convite.path` é a nota ativa; com
   outra nota aberta, não mostrar (o convite continua guardado no store e reaparece ao voltar à nota).
5. Balão com toggle duplo: conferir se clicar no balão com o painel aberto fecha e reabre (o
   `pointerdown` de fora-do-painel em captura + o `onClick` do balão). Se for real, excluir o balão do
   teste de "clique fora" (ex.: marcar o botão do balão com um atributo e ignorá-lo no handler). Se não
   for real, registrar no relatório por quê.
- Commit: `fix(agente): medidor com data no fuso de Brasilia, plural e convite so na nota certa`.

---

### Task 2 (esforço médio): Mensagens de erro próprias da IA do Excalisidian e limite de tamanho

**Files:** `src/agente/tipos.ts`, `src/agente/cliente.ts` (+test), `src/i18n/catalogo/agente.ts`,
`src/estado/agenteStore.ts` (só o pré-cheque do chat), `docs/11-agente-ia.md` §7.

Hoje, para o provedor próprio, 502/503 dizem "Verifique a conexão", 429 `limite` diz "O provedor limitou",
413 vira "provedor". Novos códigos de `ErroAgente`, só produzidos quando `provedor.exigeConta`:
- `instavel` (502, 503, 504): "A IA do Excalisidian está instável agora. Tente de novo em instantes." /
  "Excalisidian AI is unstable right now. Try again in a moment."
- `limite` (429 com `{"codigo":"limite"}`): "Muitos pedidos seguidos. Espere um minuto." /
  "Too many requests in a row. Wait a minute."
- `tamanho` (413): "Esta conversa ficou grande demais. Limpe a conversa para continuar." /
  "This conversation got too large. Clear it to continue."
- `creditos` continua como está; 429 sem corpo reconhecido continua `cota`. Provedores de chave própria:
  nada muda.
- Pré-cheque no chat (`enviarMensagem`): se o texto digitado passar de 100.000 caracteres, não enviar;
  mostrar "Mensagem longa demais para o agente (máximo de 100 mil caracteres)." / "Message too long for the
  agent (100k characters maximum)." e manter o texto no campo.
- Os códigos novos são transitórios para a política de tentativas do plano 15 (não definitivos).
- Testes em `cliente.test.ts` para cada status × provedor próprio e o contraste com chave própria.
- Doc 11 §7: linhas novas.
- Commit: `fix(agente): mensagens proprias da IA do Excalisidian para instabilidade, limite e tamanho`.

---

### Task 3 (esforço médio): Saldo sempre atual e "Testar conexão" de verdade

**Files:** `src/servico/saldoCreditos.ts` (+test), `src/estado/agenteStore.ts` (+test),
`src/ui/excalisidian/PainelAgente.tsx` (só se precisar), onde "Testar conexão" é exibido
(procure `testarConexao`).

1. `consultarCreditos(token, baseUrl?, fetchImpl?)` em `saldoCreditos.ts`:
   `{ ok: true, saldo } | { ok: false, motivo: "sessao" | "plano" | "rede" }` (401 → sessao, 403 → plano,
   resto → rede). `buscarSaldoCreditos` passa a usar essa função (mesma assinatura e contrato: `null` em
   qualquer falha).
2. `testarConexao` do provedor próprio: usar `consultarCreditos` com o token atual. `ok` → "Conexão
   funcionando." e grava o saldo no store; `sessao`/`plano` → os textos `agente.erro.sessao`/`agente.erro.plano`;
   `rede` → o texto de rede. Sem token → texto de sessão, sem ir à rede.
3. `atualizarSaldo`: contador de sequência (só a resposta da chamada mais recente grava); saldo volta a
   `null` imediatamente quando o provedor deixa de ser o próprio ou o agente é desligado (em
   `aplicarConfig`) e quando a sessão muda (no assinante do `contaStore` que já existe) — seguido de uma
   busca nova se o painel estiver aberto; um timer agenda uma busca para `renovaEm + 1 min` quando houver
   saldo (um timer só, substituído a cada saldo novo, cancelado ao desligar).
- Testes: sequência (duas respostas fora de ordem → vale a mais nova); reset ao trocar de provedor;
  testarConexao com 200/401/403/rede.
- Commit: `fix(agente): saldo sem valor velho e testar conexao consulta o servidor`.

---

### Task 4 (esforço médio): Chat com estado próprio e recarga do agente sem apagar o motivo

**Files:** `src/estado/agenteStore.ts` (+test), `src/ui/excalisidian/PainelAgente.tsx`.

1. Estado do chat separado do segundo plano: `enviandoChat: boolean` no store, ligado do início ao fim de
   `enviarMensagem`; o botão Enviar e o indicador "pensando…" da conversa usam `enviandoChat`, não o
   `status` global (que o `finally` do ciclo/gateiro pode baixar no meio da conversa). O balão continua
   usando `status`. Enviar com `enviandoChat` ligado não faz nada.
2. `carregar()` do agente (chamado quando outra janela muda preferências): hoje força
   `status = statusBase` e apaga o erro sem zerar `erroDefinitivo`/pausa. Passar a preservar o estado de
   erro quando `erroDefinitivo` ou `pausaPorCreditos` estiverem ligados (mesmo texto de antes), e só limpar
   quando a configuração carregada for diferente da atual (aí vale o mesmo que `aplicarConfig`: zera os
   dois e reagenda).
- Testes: duas mensagens seguidas → a segunda só sai depois da primeira terminar (ou é ignorada enquanto
  `enviandoChat`); `carregar()` com erro definitivo mantém o erro; com config diferente, limpa.
- Commit: `fix(agente): chat com estado proprio e recarga entre janelas sem apagar o motivo do erro`.

---

### Task 5 (esforço alto): Servidor — registro das falhas do fornecedor e uma nova tentativa

**Files:** `servidor/src/fornecedorIa.ts` (+test), `servidor/src/rotasIa.ts` (+test),
`servidor/src/log.ts` só se precisar de um helper, `docs/18-servidor.md` (§3 logs, §5.1, §5.4).
**Não** editar `servidor/src/rotas.ts`.

1. Registro por pedido de IA (uma linha JSON extra no stdout, além da linha de log por requisição que já
   existe): `{ evento: "ia", modelo: <lógico>, resultado: "ok" | "falha", motivo?, statusFornecedor?,
   codigoErroFornecedor?, provedorEscolhido?, idGeracao?, motivoFim?, tokensEntrada?, tokensSaida?,
   tokensCache?, custoMicroUsd?, duracaoFornecedorMs, tentativas }`.
   - `motivo`: `"http" | "tempo" | "rede" | "json" | "sem_texto"`.
   - Do corpo de erro do OpenRouter, só `error.code` e `error.metadata.provider_name` — **nunca**
     `error.message`, `metadata.raw` nem qualquer texto (podem ecoar o prompt).
   - Da resposta boa: `id` (gen-…), `provider` (nome do provedor escolhido pelo OpenRouter), `finish_reason`,
     tokens e `usage.prompt_tokens_details.cached_tokens`.
   - Nunca: e-mail, id de conta, token, chave, texto de mensagem.
   - `FalhaFornecedor` passa a carregar esses campos (sem texto) para a rota registrar.
2. Uma nova tentativa no servidor: se a primeira chamada falhar por `http` com status 429 ou ≥ 500, por
   `rede` ou por `tempo`, **e** tiverem passado menos de 15 s desde o início, tentar mais uma vez. O tempo
   máximo total continua 90 s (a segunda tentativa usa o que sobrou). Cobrança só da tentativa boa.
3. Testes: registro sem texto/chave/e-mail em sucesso e em falha (com corpo de erro que contém o texto da
   mensagem em `error.message` e `metadata.raw`); nova tentativa acontece em 502 rápido e não acontece em
   400 nem depois de 15 s; débito uma vez só.
4. Doc 18: o que o registro contém e o que nunca contém; a nova tentativa.
- Commits: código+testes, depois docs. Implantação fica com o orquestrador.

---

### Task 6 (esforço alto): Sessão renovada antes de vencer

**Files:** `src/estado/contaStore.ts` (+test), `docs/18-servidor.md` §4.

Sessões valem 30 dias e só são renovadas na abertura do app; quem nunca reinicia o app é deslogado.
- Um timer no `contaStore` (um só por janela): a cada 6 h, e também logo depois de `carregar`/`entrar`/
  `sincronizarComCofre` adotar uma sessão, se `expiraEm - agora < 7 dias`, chamar a mesma rotina de renovar
  do `carregar()` (grava no cofre e emite `app://prefs-mudou`, para as outras janelas adotarem pelo
  `sincronizarComCofre`). Respeitar o contador `geracao`. Falha de rede: tenta de novo no próximo tique;
  `expirada`: mesmo tratamento do `carregar()`.
- Duas janelas renovando ao mesmo tempo: a janela de graça de 120 s do servidor cobre; não criar
  coordenação nova.
- Testes com timers falsos: perto de vencer → renova uma vez e emite; longe → não chama o servidor; timer
  não duplica ao chamar `carregar` várias vezes; `sair` cancela o timer.
- Doc 18 §4: renovação automática quando faltam menos de 7 dias.
- Commit: `fix(conta): sessao renovada antes de vencer com o app aberto`.

---

### Task 7 (esforço baixo): Documentação em dia

**Files:** `docs/11-agente-ia.md`, `docs/09-decisoes-e-incertezas.md`.
- Doc 11 §4 (estado): incluir `pausado`, `saldoCreditos`, `enviandoChat`, pausa por créditos.
- Doc 11 §7: na linha "Assistente — passos", incluir o passo "Conta" do provedor próprio.
- Doc 11 §5: conferir contra o código o que a análise apontou como desatualizado (§5.1 `pergunta`, §5.3
  `precisaWeb`/botão "útil") e ajustar o texto para o comportamento real.
- ADR-43 "Uso esperado": acrescentar a medição real de 28/09 (10 pedidos, US$ 0,0029, 3 créditos — cerca
  de 0,3 crédito por pedido) e a nota de que as estimativas em base de pico são históricas (ADR-44).
- Commit: `docs: agente em dia com o codigo (estado, passos, uso medido)`.
