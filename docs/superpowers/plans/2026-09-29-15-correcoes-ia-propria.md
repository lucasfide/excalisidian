# Correções da IA própria (rodada 1) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** corrigir os cinco problemas importantes achados na análise de 28/09 da IA do Excalisidian:
mensagem errada sem internet, repetição infinita de pedidos, pedido que trava para sempre, sessão
trocada a cada mudança de preferência, e o assistente de configuração que vaza chave entre provedores
e deixa conta grátis ativar a IA paga.

**Architecture:** quatro tarefas independentes em arquivos quase disjuntos. Tarefa 1 no transporte
(`src/agente/cliente.ts`). Tarefa 2 na política de novas tentativas do `agenteStore` (regras puras num
módulo novo, testado). Tarefa 3 na sessão: rota nova no servidor que consulta a sessão sem trocá-la,
`contaStore.sincronizarComCofre()` e o agente tentando de novo uma vez num 401 quando o token mudou.
Tarefa 4 no `DialogoAgente`.

**Spec:** `docs/11-agente-ia.md` (§3.2, §5, §7), `docs/18-servidor.md` (§1, §4, §5), ADR-35, ADR-38.
Análise que originou o plano: resumo na conversa de 28/09 (bugs 1–5 da análise de funcionamento e
bugs 1 e 5 da análise de interface).

## Global Constraints

- Português do Brasil em nomes, comentários e textos. Texto novo de interface no catálogo
  (`src/i18n/catalogo/`), com pt-BR e en; nunca literal no JSX novo.
- Commit sempre por caminho explícito. **A árvore tem edições ALHEIAS não commitadas** em
  `servidor/implantacao/backup.sh`, `servidor/implantacao/excalisidian-backup.service`,
  `servidor/src/armazenamentoSync.ts`, `servidor/src/rotas.ts`, `servidor/src/sync.test.ts`,
  `src/estado/syncStore*.ts`, `src/sync/*` — nunca editar nem commitar esses arquivos. Se um teste
  falhar só por causa deles, registrar e seguir.
- Testes: `npm test` (raiz, hoje 1455) e `cd servidor && npm test` (hoje 135 com as edições alheias).
  `npx tsc --noEmit` nos dois. Sem jsdom: só módulos puros e stores com dublês têm teste.
- Nada muda para os seis provedores de chave própria além do que cada tarefa diz.

## Review Focus

1. Usuário offline por horas: o agente não pode ficar chamando a rede a cada poucos segundos.
2. Duas janelas abertas, uma muda o tema: a outra não pode perder a sessão nem o agente parar.
3. Notebook dorme com pedido em andamento: ao voltar, o agente não fica preso em "pensando".
4. Créditos acabam no meio do mês: o agente para de chamar o servidor e diz por quê, e volta sozinho
   quando o saldo existir de novo.
5. Assistente: escolher OpenAI, colar chave, voltar, escolher Anthropic e ativar não grava a chave da
   OpenAI na Anthropic.

---

### Task 1: Rede e tempo máximo no transporte

**Files:** Modify `src/agente/cliente.ts`, `src/agente/cliente.test.ts`.

Problema: `lancar` classifica como `escopo` qualquer erro com "url" na mensagem, e o reqwest diz
"error sending request for url (...)" em toda queda de rede — o usuário lê "base URL fora das
permissões". E não há tempo máximo: só `connectTimeout`.

- [ ] Testes primeiro (em `cliente.test.ts`, com o `fetchMock` existente):
  - rejeição com `new Error("error sending request for url (https://api.excalisidian.com/v1/chat/completions)")` → `FalhaAgente("rede")`;
  - rejeição com `new Error("url not allowed on the configured scope: https://x.exemplo/")` → `FalhaAgente("escopo")`;
  - `lancar` repassa um `signal` ao fetch (conferir `init.signal` instanceof `AbortSignal`);
  - rejeição com um `DOMException` de nome `"TimeoutError"` ou `"AbortError"` → `FalhaAgente("rede")`.
- [ ] Implementação em `lancar`:
  - `const TEMPO_MAXIMO_MS = 100_000;` com comentário: acima dos 90 s do servidor (doc 18 §5.1),
    para o servidor responder primeiro; libera o agente se a conexão morrer (notebook dormiu).
  - `fetch(url, { ...init, connectTimeout: TIMEOUT_CONEXAO_MS, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) })`.
  - `escopo` só quando a mensagem casa `/not allowed on the configured scope/i`; todo o resto `rede`.
- [ ] `npm test` e `npx tsc --noEmit`; commit
  `fix(agente): queda de rede nao vira erro de base URL e pedido tem tempo maximo`.

---

### Task 2: Novas tentativas com espera crescente e pausa por créditos

**Files:** Create `src/agente/tentativas.ts` + `src/agente/tentativas.test.ts`; modify
`src/estado/agenteStore.ts`, `src/ui/excalisidian/PainelAgente.tsx` (só se o texto da linha de status
precisar mudar), `src/i18n/catalogo/agente.ts`, `docs/11-agente-ia.md` (§5.0/§5.1/§7).

Problema: depois de uma falha que não seja de sessão/plano, a leitura inicial (gateiro) apaga a
tentativa e o `finally` reagenda em 5 s; o ciclo de acompanhamento não grava `ultimoCicloTexto` e roda
de novo em 10 s (até 4 pedidos por vez). Offline ou com créditos esgotados isso vira um laço infinito.

Regras (puras, em `tentativas.ts`, testadas):
- `ESPERAS_APOS_FALHA_MS = [5_000, 30_000, 120_000, 600_000]`.
- `esperaAposFalha(falhasSeguidas: number): number | null` — `falhasSeguidas` ≥ 1; devolve a espera da
  posição `falhasSeguidas - 1`; além do fim da lista, `null` (desiste até a nota crescer).
- Testes: 1 → 5000; 4 → 600000; 5 → null; 0 → 5000 (defensivo).

No `agenteStore`:
- Por nota: `falhasGateiro[path]`, `falhasCiclo[path]` e `bloqueadoAte[path]` (epoch ms), em memória.
- Gateiro, erro não definitivo: incrementa `falhasGateiro[path]`; se `esperaAposFalha` der número,
  `bloqueadoAte[path] = Date.now() + espera` e apaga `tentativasGateiro[path]` (libera nova leitura
  depois da espera); se der `null`, mantém `tentativasGateiro[path]` (só tenta de novo quando a nota
  crescer 50%, regra que já existe) e zera o contador. Resposta que não parseia conta como falha
  (mesmo esquema). Veredito válido zera o contador e o bloqueio.
- Ciclo, erro não definitivo: mesmo esquema com `falhasCiclo[path]`; quando der `null`, grava
  `ultimoCicloTexto[path] = texto` (a próxima rodada exige 200 caracteres novos) e zera o contador.
  Sucesso zera. `falhasSeguidas` global (grito na 3ª falha) continua como está.
- `agendar()`: se `bloqueadoAte[path]` estiver no futuro, o timer daquela nota espera
  `max(INATIVIDADE_*, bloqueadoAte - agora)` em vez da inatividade normal.
- Créditos esgotados (`FalhaAgente("creditos")`) em qualquer caminho (gateiro, ciclo, resumo, chat):
  `pausaPorCreditos = true`; `set({ status: "erro", erroAtual: textoDoErro(e) })`; nenhum gateiro nem
  ciclo roda enquanto `pausaPorCreditos` (o chat continua permitido — é ação explícita e mostra a mesma
  mensagem). Sai da pausa quando: `atualizarSaldo()` receber saldo com `usados < total`, ou a sessão ou
  a configuração mudarem (mesmos pontos que já zeram `erroDefinitivo`). Enquanto em pausa, um timer de
  30 min chama `atualizarSaldo()` (um só timer, cancelado ao sair da pausa).
- Qualquer resposta bem-sucedida do provedor (gateiro, ciclo ou chat) zera `erroDefinitivo` e
  `pausaPorCreditos` e chama `agendar()` — cobre quem virou premium depois de um 403.
- Doc 11: registrar a política (esperas 5 s → 30 s → 2 min → 10 min por nota, depois só quando a nota
  crescer; créditos esgotados pausam o segundo plano até haver saldo). A frase da interface "O agente
  tenta de novo quando você escrever mais" continua verdadeira; não mudar texto sem necessidade.
- Testes do store, se o arquivo `agenteStore.test.ts` já tiver infraestrutura para isso: um teste de
  que duas falhas seguidas do gateiro agendam 5 s e depois 30 s (com timers falsos do vitest); se a
  infraestrutura não permitir sem esforço desproporcional, registrar no relatório e cobrir só o módulo
  puro.
- Commit: `fix(agente): espera crescente entre tentativas e pausa quando os creditos acabam`.

---

### Task 3: Sessão estável entre janelas

**Files:**
- Server: create `servidor/src/rotasSessaoAtual.ts` + `servidor/src/rotasSessaoAtual.test.ts`;
  modify `servidor/src/app.ts` (registrar como plugin próprio sob `/v1`, igual às rotas de IA — **não**
  editar `rotas.ts`); `servidor/src/sessao.ts` só se precisar de uma função de leitura com `expira_em`.
- App: `src/conta/ServicoConta.ts`, `src/conta/ServicoContaHttp.ts` (+test), `src/conta/ServicoContaFake.ts`,
  `src/conta/ServicoContaFakeDev.ts` (+tests se existirem para os métodos), `src/estado/contaStore.ts`
  (+test), `src/app/flushEntreJanelas.ts` (+test), `src/estado/agenteStore.ts`.
- Docs: `docs/18-servidor.md` (§1 lista de rotas, §4 sessões), `docs/11-agente-ia.md` §3.2 (401 com
  token trocado).

Problema (confirmado em `src/app/flushEntreJanelas.ts:166`): todo evento `app://prefs-mudou` (tema,
largura, agente, entrar/sair) faz **todas** as janelas chamarem `contaStore.carregar()`, que faz
`renovar` — o servidor troca o token na hora, e o token antigo passa a dar 401 fora do próprio
`renovar`. Um pedido do agente em andamento com o token velho volta 401 e vira erro definitivo
"Entre na sua conta" com o usuário logado; com duas janelas, uma invalida o token da outra. E sair
numa janela deixa a outra "logada" (sem token, `carregar` não zera `sessao`).

Servidor — `GET /v1/sessoes/atual`:
- `preHandler: exigirSessao`; responde 200 `{ email, plano, expiraEm }` da sessão do Bearer, **sem
  trocar o token**; 401 sem sessão válida. Nunca devolve token.
- Testes: 401 sem Bearer; 200 com os dados; o mesmo token continua valendo depois (segunda chamada
  200); token substituído por `renovar` → 401.

App:
- `ServicoConta.consultar(token: string): Promise<Omit<Sessao, "token">>` — Http: `GET {base}/sessoes/atual`
  com Bearer; 401 → `FalhaConta("expirada")`; rede → `FalhaConta("rede")`; outro → `FalhaConta("servidor")`.
  Fakes implementam de forma coerente com o que já simulam.
- `contaStore.sincronizarComCofre(): Promise<void>` — lê o token do cofre (sem migração legada):
  - sem token → `definirTokenDaSessao(null)`, `set({ sessao: null, carregado: true })`;
  - token igual ao da sessão atual → nada;
  - token diferente → `consultar(token)`: sucesso → `definirTokenDaSessao(token)` e
    `set({ sessao: { ...dados, token }, carregado: true })`; `expirada` → `definirTokenDaSessao(null)`,
    `set({ sessao: null })` (não apaga o cofre — outra janela pode ter gravado um token novo nesse
    meio-tempo); `rede`/`servidor` → mantém o estado atual.
  - respeita o contador `geracao` do store como `carregar()` já faz.
- `flushEntreJanelas.ts`: no evento `prefs-mudou`, chamar `sincronizarComCofre()` no lugar de
  `carregar()`. `carregar()` (com `renovar`) continua só na abertura da janela.
- `agenteStore`: num `FalhaAgente("sessao")` do provedor próprio, antes de marcar erro definitivo:
  guardar o token usado, `await useContaStore.getState().sincronizarComCofre()`; se
  `tokenDaSessaoAtual()` agora for outro token não nulo, repetir o pedido **uma vez**; só se falhar de
  novo (ou o token não mudou) vira definitivo. Implementar num único ponto (um wrapper do `completar`
  usado pelos quatro caminhos), não copiado quatro vezes.
- Testes: `contaStore.test.ts` para os quatro ramos de `sincronizarComCofre`; `flushEntreJanelas.test.ts`
  ajustado para esperar `sincronizarComCofre`; `ServicoContaHttp.test.ts` para `consultar`; o wrapper
  do agente testado se couber na infraestrutura existente.
- Implantação no servidor **não** faz parte da tarefa (o orquestrador faz com autorização).
- Commits: um para o servidor, um para o app, um para docs.

---

### Task 4: Assistente de configuração — chave por provedor e plano

**Files:** `src/ui/excalisidian/DialogoAgente.tsx`; `src/i18n/catalogo/agente.ts` se precisar de texto novo.

Problemas: (a) trocar de provedor no passo 1 mantém `r.chave`, `r.baseUrl`, `r.modeloGateiro` e
`r.modeloAssistente` do provedor anterior — a chave da OpenAI acaba gravada como chave da Anthropic, e
qualquer chave sobrando vai para `chaves.excalisidian`; (b) no passo Conta, só se confere se há sessão,
não o plano — conta grátis ativa a IA paga e só descobre o erro depois.

- [ ] Ao escolher um provedor **diferente** do atual no passo 1: `chave` volta ao valor já salvo para
  aquele provedor (`config.chaves[novo] ?? ""`), `baseUrl` ao salvo para ele (`config.baseUrls[novo] ?? ""`),
  e os dois modelos voltam ao sugerido/salvo daquele provedor (seguir a mesma regra que o diálogo já usa
  ao abrir). Escolher o mesmo provedor não apaga nada.
- [ ] `concluir`: só grava `r.chave` quando `provedor.precisaChave` (nunca em `chaves.excalisidian`).
- [ ] Passo Conta do provedor próprio: com sessão mas `sessao.plano !== "premium"`, mostrar o texto
  `agente.erro.plano` (já existe no catálogo) no lugar da explicação e deixar "Continuar" desabilitado,
  do mesmo jeito que já se faz com `semSessao`.
- [ ] Sem teste de componente (não há jsdom). Se a lógica de "estado ao trocar de provedor" puder virar
  uma função pura pequena no mesmo arquivo ou num módulo ao lado, testá-la.
- [ ] `npm test`, `npx tsc --noEmit`; commit
  `fix(agente): assistente nao leva a chave de um provedor para outro e barra conta gratis na IA paga`.
