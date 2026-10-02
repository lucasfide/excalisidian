# 11 — Agente de IA

Este documento é normativo e autocontido, no mesmo molde do doc 10: modelo de dados,
provedores, pipeline, interface, textos, requisitos e as decisões por trás de tudo. Os outros
documentos só apontam para cá.

Escrito em 12/09/2026, a partir de pedido direto do usuário. Entra no roadmap como Fatia 10
(doc 08).

---

## 1. O que é

Um agente de IA **100% opcional** que acompanha a escrita de uma nota e participa do assunto:
relaciona o que está sendo escrito com outras notas do vault, faz perguntas, aponta gaps,
traz conteúdo e (quando o provedor suportar) pesquisa na web.

O fluxo tem dois estágios, cada um com seu modelo configurável:

1. **Gateiro** (modelo barato): lê o começo da nota uma única vez, identifica o assunto e
   decide se vale convidar o usuário. O convite aparece como toast (§6.1); sem aceite, nada mais
   acontece.
2. **Assistente** (modelo forte): só depois do aceite, acompanha a escrita em ciclos
   disparados por inatividade, lê o diff desde o último ciclo, recupera notas relacionadas
   no índice local e devolve sugestões estruturadas.

### Princípios

- **Desligado por padrão, e fica desligado.** Sem configuração, nenhum traço do agente
  aparece na UI — nem painel, nem comando, nem aviso. O produto não pede, não insiste, não
  interrompe para sugerir que o agente seja ligado. A única menção permitida é discreta:
  a IA do Excalisidian aparece como mais uma opção na lista de provedores do assistente de
  configuração (§3.2), ao lado dos provedores de chave própria — não como anúncio recorrente
  (ver ADR-31, `docs/09-decisoes-e-incertezas.md`).
- **Nada sai da máquina sem participação explícita.** Sem o aceite do convite (ou sem o
  usuário iniciar uma conversa manual), nenhuma chamada de rede é feita.
- **O vault continua sendo o produto.** O agente lê notas; ele nunca escreve nem edita
  arquivos do vault por conta própria. Sugestão de conteúdo é texto no painel — quem cola na
  nota é o usuário.
- **Custo visível.** Tokens e custo estimado da sessão sempre à vista no painel; tetos
  opcionais (sem teto por padrão — decisão 10.4).
- **RNF5 intacto:** o app continua funcionando 100% offline; o agente é a única exceção e
  só existe quando configurado.

### O que NÃO tem (v1)

- Sem escrita automática no vault (nem nota, nem frontmatter, nem link).
- Sem OAuth de assinatura de terceiros (Claude Pro/Max etc.) — os seis provedores de chave
  própria continuam só por API key (decisão 10.1). Existe, à parte, um sétimo provedor
  autenticado pela própria conta do Excalisidian, sem chave digitada (§3.2, ADR-35).
- Sem embeddings/vetores locais — a recuperação usa o índice de busca e o grafo de links.
- Sem streaming no painel (respostas chegam inteiras; ver doc 09, incerteza).
- Sem agente no canvas — só notas (`.md`). Desenho pode ser *relacionado* (entra na
  recuperação pelo texto extraído), mas o agente não acompanha edição de desenho.
- Sem histórico de conversa sincronizado entre máquinas (fica na pasta de memória local).

---

## 2. Configuração

### 2.1 Onde mora

Preferência **de máquina** (não de vault): `settings.json` em `%APPDATA%` via plugin-store,
chave única `agente`:

```json
{
  "habilitado": false,
  "provedor": "openai",
  "chaves": { "openai": "sk-proj-…" },
  "baseUrls": {},
  "modeloGateiro": "gpt-5.4-mini",
  "modeloAssistente": "gpt-5.6-luna",
  "thinking": "baixo",
  "webSearch": false,
  "tetoDiarioUsd": null
}
```

Este arquivo é um detalhe de persistência: **o usuário nunca o edita à mão**. Toda a
configuração acontece pelo assistente de configuração (§6.3), que valida cada passo antes
de gravar.

| Campo | Regra |
|---|---|
| `habilitado` | master switch. `false` = agente não existe na UI. |
| `provedor` | id do catálogo (§3). |
| `chaves` | uma API key por provedor, para trocar sem redigitar. |
| `baseUrls` | override opcional por provedor (passo "Avançado" do assistente); ausente = URL do catálogo. |
| `modeloGateiro` / `modeloAssistente` | provedores externos: escolhidos da lista no assistente (§6.3), podendo ser o mesmo modelo. IA do Excalisidian: recebem automaticamente os identificadores lógicos `leitura-rapida` e `acompanhamento`; não são editáveis na interface. |
| `thinking` | profundidade de raciocínio, só tem efeito em modelos que suportam (`gpt-5*`/`o*` via `reasoning_effort`): `padrao` (não envia o parâmetro), `baixo`, `medio`, `alto`. `minimal` existe no tipo por compatibilidade mas saiu da UI: a família gpt-5.6 recusa o valor (verificado na API 13/09 — ela aceita `none`/`low`/`medium`/`high`/`xhigh`). Anthropic/Gemini ignoram o campo na v1. |
| `webSearch` | liga o tool nativo do provedor (§5.4). Só aparece se o provedor suportar. |
| `tetoDiarioUsd` | `null` = sem teto (padrão). Número = pausa automática ao atingir. |

**Risco registrado:** a chave fica em texto puro no `settings.json` (`%APPDATA%`), como em
qualquer app desktop sem keychain própria. Aceito para o MVP; upgrade previsto: crate
`keyring` (DPAPI no Windows) atrás do mesmo contrato de leitura/escrita. A chave nunca vai
para o log, nunca para a memória do vault, nunca para telemetria.

### 2.2 Pasta de memória

Por vault, em `%APPDATA%/Excalisidian/agente/<hashVault>/` — o mesmo `hashVault` de
`indice/cache.ts`. Fora do vault de propósito (decisão 10.2): transcript de IA é dado
derivado e potencialmente sensível, não deve entrar no Git sem o usuário perceber.

```
agente/<hashVault>/
├── participacao.json   aceite/recusa por nota
├── resumos.json        cache de resumo por nota (invalidado por mtime+size)
├── fatos.json          memória de longo prazo
└── conversas.json      conversas manuais, uma por nota (chave: caminho)
```

Tudo descartável por definição (mesma regra de `cache/` e `workspace/`, doc 02 §1): apagar
a pasta não perde dado do usuário, só memória derivada. O acesso do usuário é pela tela de
configurações (§6.3): botão "Abrir pasta do agente" (comando Rust `revelar_pasta`, abre o
Explorer na pasta; cria-a se não existir) e "Limpar memória" (esvazia os quatro arquivos,
com confirmação).

#### `participacao.json`

```json
{ "versao": 1, "porPath": { "Projetos/Nota.md": "aceito" } }
```

Valores: `aceito`, `recusado`, `adiado`. `recusado` é definitivo para aquela nota — o
convite nunca reaparece. `adiado` ("Agora não") permite novo convite quando a nota mudar de
assunto (novo gateiro, §5.2). Renomear/mover uma nota migra a entrada (mesmo pipeline do
rename).

#### `resumos.json`

```json
{ "versao": 1,
  "porPath": { "Projetos/Nota.md": { "mtimeMs": 1, "size": 2, "resumo": "…" } } }
```

Resumo de até ~60 palavras gerado pelo **modelo gateiro**, uma vez por versão do arquivo.
Invalidação por `mtimeMs+size`, igual ao cache de metadados. Teto de 400 entradas (LRU por
uso); estourou, descarta as menos usadas — é cache, não dado.

#### `fatos.json`

```json
{ "versao": 1,
  "fatos": [ { "id": "f-1a2b3c4d", "texto": "O usuário chama o backend de «Core».",
               "notaOrigem": "Projetos/Nota.md", "criadoEm": "…" } ] }
```

Revisto em 01/10/2026 (plano 20): o formato legado acima permanece legível. Registros novos
incluem categoria (preferência/glossário/convenção), escopo (vault/projeto), chave, fonte,
evidência e estado (pendente/confirmado/substituído/rejeitado). Origem e data são preservadas.
O modelo propõe candidatos; evidência deve ocorrer literalmente na nota fornecida.
Somente confirmação explícita promove candidato para o contexto. Registros antigos sem
estado ficam disponíveis para revisão e não são confirmados automaticamente.
Até 100 candidatos pendentes são admitidos sem apagar anteriores; confirmados não sofrem
FIFO. Mesma chave/categoria/escopo substitui a versão confirmada anterior somente após
confirmação, preservando-a arquivada. Igualdade textual normalizada impede duplicatas exatas;
paráfrases com chaves diferentes não são fundidas automaticamente.
Chat e acompanhamento selecionam apenas confirmados aplicáveis ao escopo da nota,
inteiros, até 500 caracteres Unicode cada e 4.800 caracteres por contexto. Preferência
salva ou editada pelo usuário tem fonte explícita, sem evidência inventada de uma nota.

#### `conversas.json`

```json
{ "versao": 1,
  "porPath": { "Projetos/Nota.md": { "atualizadaEm": "…", "mensagens": [ { "papel": "usuario", "texto": "…" } ] } } }
```

Uma conversa por nota na v1 (a chave é o caminho; nota nenhuma aberta = chave `""`).
Revisto na fase 4: o plano original era uma pasta com um arquivo por conversa — um único
arquivo com índice embutido simplifica a restauração no boot e o "limpar memória" sem
ganho perceptível do outro formato. "Limpar memória" apaga tudo. Cada envio manda só as
últimas 12 mensagens manuais como histórico (`agenteStore.ts`); blocos automáticos de análise
não são enviados como falsas mensagens de chat. Mais antigas continuam salvas em disco.
Uma seleção limitada de trechos anteriores pode dar continuidade, identificada como histórico
anterior: não equivale a um resumo semântico produzido pelo modelo. Blocos de análise têm
identidade, fase/estado e sugestões; dados anteriores sem esses campos continuam legíveis.

### 2.3 Escrita e leitura

A pasta de memória vive no `%APPDATA%` do app e é persistida via **plugin-store** — o mesmo
mecanismo do layout de abas (`layout/persistencia.ts`) e do cache de metadados; o plugin
resolve caminho, permissão e gravação. (Revisão da fase 4: o plano previa escrita atômica
manual com tmp + rename — o plugin-store cobre o caso com um código a menos, e nenhum
desses arquivos precisa de atomicidade forte: são cache.) Debounce: `participacao` 500 ms,
`resumos` 2 s, `fatos` e `conversas` 1 s. Leitura: uma vez na abertura do vault. O watcher
não cobre `%APPDATA%` — não há recarga ao vivo, e não precisa.

---

## 3. Provedores

Catálogo declarativo em `src/agente/provedores.ts`. Três **dialetos** de API cobrem todos:

| Dialeto | Quem usa |
|---|---|
| `openai` (Chat Completions) | OpenAI, OpenRouter (incl. Zen e Go — mesmo endpoint, a diferença é o catálogo de modelos), Alibaba (DashScope compatible-mode), Ollama |
| `anthropic` (Messages) | Anthropic |
| `gemini` (generateContent) | Google Gemini |

| id | Nome | Base URL | Web search nativo |
|---|---|---|---|
| `anthropic` | Anthropic | `https://api.anthropic.com` | sim (`web_search`) |
| `openai` | OpenAI | `https://api.openai.com/v1` | sim, via Responses API (ver doc 09, incerteza) |
| `gemini` | Gemini | `https://generativelanguage.googleapis.com` | sim (`google_search`) |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | parcial (passthrough, não garantido) |
| `alibaba` | Alibaba (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | não |
| `ollama` | Ollama (local) | `http://localhost:11434/v1` | não |
| `excalisidian` | IA do Excalisidian | `BASE_URL_SERVICO` (§3.2) | não (v1) |

- **Base URL é editável** na tela de configuração (campo avançado): cobre gateways próprios,
  Azure OpenAI, instância Ollama em outra porta, e variantes do plano Alibaba.
- **Lista de modelos vem do provedor, não de digitação.** O assistente de configuração
  busca os modelos disponíveis com a chave informada (§6.3), pelo endpoint de listagem de
  cada dialeto:

  | Dialeto | Endpoint | Resposta |
  |---|---|---|
  | `openai` | `GET {base}/models` | `data[].id` (OpenAI, OpenRouter, DashScope e Ollama expõem este endpoint) |
  | `anthropic` | `GET /v1/models` | `data[].id` |
  | `gemini` | `GET /v1beta/models?key=…` | `models[].name`, sem o prefixo `models/` |

  O catálogo estático em `provedores.ts` continua existindo, mas com outro papel: marca os
  **sugeridos** por papel (gateiro: Haiku / GPT-4o mini / Flash / …; assistente: Sonnet /
  GPT-4o / Pro / …), que aparecem no topo da lista com o selo "Sugerido", e serve de
  fallback quando a listagem falha (rede bloqueada, provedor sem o endpoint). A lista
  buscada tem filtro por texto e uma última opção "Outro modelo…" (campo livre) — para
  modelo novo que o provedor já serve mas ninguém previu.

  Verificado em 13/09/2026 contra a API real da OpenAI: `GET /v1/models` responde, e
  `gpt-5.6-luna` aceita Chat Completions com `reasoning_effort: "low"` (o `usage` da
  resposta vem em `prompt_tokens`/`completion_tokens` — o medidor consome daí).
- Transporte: **`@tauri-apps/plugin-http`** (reqwest em Rust), nunca `fetch` do WebView —
  CORS e exposição da chave no renderer. Escopo de hosts declarado em
  `src-tauri/capabilities/main.json` (os sete hosts acima, incluindo `BASE_URL_SERVICO`).
  Base URL customizada fora do escopo: o app avisa e pede a permissão — ver doc 05.
- `Ollama` não exige chave (o passo da chave some no assistente; a listagem usa
  `GET {base}/models` sem autenticação).
- **Testar conexão**: a validação da chave acontece no próprio passo em que ela é colada —
  a busca de modelos JÁ é o teste (uma chamada real, com o erro traduzido no ato). Um
  botão "Testar conexão" separado continua disponível depois, na seção de configurações.

### 3.1 Estimativa de custo

Preços por milhão de tokens no catálogo (entrada/saída, por modelo sugerido). Modelo fora
do catálogo: custo estimado fica indisponível (mostra só tokens). Preços são aproximados e
revisáveis — o número exato é o billing do provedor. Sem telemetria: a contagem é local,
somando `usage` das respostas.

**Estado atual:** o campo `precos` do catálogo (`provedores.ts`) está vazio para os seis
provedores de chave própria — os números de 2026 não foram verificados contra o billing
(doc 09, incerteza 26), e inventar preço é pior que não ter. Até algum modelo ganhar preço
verificado, o medidor de uso (§5.6) mostra só tokens em qualquer um desses seis provedores,
nunca custo estimado. O sétimo provedor, IA do Excalisidian, não usa esse medidor — ver §3.2.

### 3.2 IA do Excalisidian (provedor próprio)

Sétimo provedor do catálogo, id `excalisidian`, dialeto `openai` — o servidor fala o mesmo
protocolo da OpenAI, sem caminho de rede novo no cliente (ADR-35,
`docs/09-decisoes-e-incertezas.md`). Diferenças em relação aos seis provedores de chave
própria:

- **Exige conta, não exige chave** (`exigeConta: true`, `precisaChave: false`). Autentica
  pela sessão da conta do Excalisidian (§ credencial em `cliente.ts`), não por API key
  digitada. Sem sessão ativa, a chamada falha com um código de erro próprio (`sessao`) antes
  de qualquer rede.
- **Identificadores lógicos de modelo** (`leitura-rapida`, `acompanhamento`), não nomes de
  modelo de um fornecedor específico — para poder trocar o modelo real por trás sem
  atualizar o app. **O nome do fornecedor de IA nunca aparece na interface.**
- **Assistente de configuração** (§6.3) usa dois passos para este provedor: Provedor → Sua
  conta. Os identificadores lógicos de modelo são preenchidos automaticamente; não há passos
  de chave, escolha de modelos ou revisão. O campo "Avançado · Base URL" também não aparece.
- **Cota mensal em créditos, contada no servidor** (doc 18 §5) — o cliente só interpreta o
  saldo que chega (`src/servico/creditos.ts`), nunca conta localmente. Premium: 3.000
  créditos por mês; plano superior: 10.000 (o app não distingue, só mostra o total). O
  servidor existe e expõe `GET /creditos`. O motor do agente busca o saldo ao abrir o painel e
  depois de cada resposta do provedor próprio; com a conta de teste do modo de
  desenvolvimento (servidor local) não busca. Qualquer falha deixa o saldo em `null` e o
  medidor **oculto**: nunca se mostra número inventado, e zero seria mentir sobre dinheiro.
- As superfícies de configuração e preferências também consultam `GET /creditos`, por meio de
  `consultarCreditos`, sem exigir agente configurado ou ligado. Consultam ao abrir a superfície
  ou quando a identidade da sessão muda; não fazem polling. Respostas atrasadas de outra sessão
  são descartadas. Saldo válido igual a zero continua sendo exibido.
- Na consulta de apresentação, `403` significa plano sem acesso. `401` inicia uma única
  recuperação limitada pela sincronização do cofre e pela validação do plano: token novo permite
  uma consulta, expiração confirmada volta ao estado sem sessão, e recusa inconclusiva bloqueia
  ativação até nova tentativa. Uma falha de rede sem recusa de autenticação anterior omite saldo
  e renovação, mas permite salvar se a sessão premium já estiver carregada. Rede durante a
  recuperação de um `401` não libera ativação. Essa consulta não altera a política de saldo do
  motor do agente.
- **Créditos esgotados:** 429 com corpo `{"codigo":"creditos"}` vira o código de erro
  `creditos`. Um 429 sem esse corpo continua sendo `cota` (limite momentâneo). Só no provedor próprio: 429 `{"codigo":"limite"}` vira `limite`; 413 vira `tamanho`; 502/503/504 viram `instavel`. Os três são transitórios para a política de tentativas (não param o segundo plano). Provedores de chave própria mantêm `cota`/`provedor`.
- **401 com o token trocado por outra janela:** duas janelas compartilham o token pelo cofre; se
  outra janela renovou ou entrou enquanto um pedido voava com o token velho, o 401 não significa
  "deslogado". Num `sessao` do provedor próprio o agente adota o token do cofre
  (`contaStore.sincronizarComCofre`, que consulta e nunca renova) e, se o token mudou para outro
  não nulo, repete o pedido **uma vez**. Token igual, sem token ou segundo 401: erro definitivo
  como antes. O mesmo ponto único (`completarComSessao`) cobre gateiro, resumo, ciclo e chat.
- **"Testar conexão"** verifica a sessão em vez de responder "funcionando" sem testar nada.
- O modo com chave própria (os seis provedores acima) continua **gratuito e intacto**.
  Vende-se conveniência, não exclusividade.
- O agente continua **desligado por padrão** também com este provedor; nenhuma chamada de
  rede sem aceite do usuário.

---

## 4. Estado

`src/estado/agenteStore.ts` (zustand), espelhando o padrão dos outros stores:

```
config: ConfigAgente | null      carregada do settings.json
status: "desligado" | "ocioso" | "observando" | "pensando" | "pausado" | "erro"
pausado: boolean                 (pausa manual; o status mostra "pausado" quando não há trabalho em voo)
enviandoChat: boolean            (mensagem do chat em voo; outra só sai depois da resposta)
erroAtual: string | null         (motivo do último erro, mostrado no painel)
saldoCreditos: SaldoCreditos | null   (provedor próprio; null quando não há saldo confiável)
participacao: Record<caminho, Participacao>
convite: { path, tema } | null
sugestoes: Record<caminho, Sugestao[]>   (por nota; substituídas a cada ciclo)
usoSessao: { tokensEntrada, tokensSaida, custoUsd }
painelAberto: boolean
conversas: Record<caminho, MensagemChat[]>   (conversa manual por nota)
```

Ações: `carregar()`, `salvarConfig()`, `testarConexao()`, `responderConvite()`,
`enviarMensagem()`, `pausar()`, `retomar()`, `atualizarSaldo()`, `dispensarSugestao()`,
`limparMemoria()`.

`saldoCreditos` só existe no provedor próprio e volta a `null` quando a busca falha (mostrar
zero seria mentir sobre dinheiro). A pausa por créditos esgotados (§5.0) **não** usa `pausado`,
que é escolha do usuário: é uma flag interna do segundo plano, e o chat segue liberado.
`enviandoChat` bloqueia `enviarMensagem()` enquanto há um pedido em voo, para a resposta da
primeira mensagem entrar no histórico antes de a segunda sair.

Persistência: config no `settings.json`; uso do dia em memória + espelho em
`agente/<hash>/uso.json` (para o teto diário sobreviver a restart). `painelAberto` é
efêmero (como `concluidasExpandidas` do painel de tarefas).

---

## 5. Pipeline

### 5.0 Disparo (camada local, custo zero)

O agente **nunca** chama a rede por linha digitada. Condições para um ciclo do assistente,
todas obrigatórias:

1. `habilitado` e participação `aceito` na nota ativa;
2. ≥ **10 s** sem digitação na nota (debounce de inatividade, timer próprio — não é o do
   autosave);
3. ≥ **200 caracteres** novos desde o último ciclo (diff local; abaixo disso, nada);
4. nenhuma chamada em voo para a mesma nota;
5. teto diário não atingido (quando configurado) e agente não pausado.

O gateiro tem disparo próprio: nota ativa com ≥ 140 caracteres, participação ausente
(`participacao.json` sem entrada), 5 s de inatividade, uma tentativa por nota por sessão.

**Novas tentativas depois de falha** (rede, provedor fora do ar, resposta que não parseia —
não vale para sessão e plano, que param até a sessão ou a configuração mudarem). A espera é
por nota e cresce a cada falha seguida: **5 s → 30 s → 2 min → 10 min**
(`ESPERAS_APOS_FALHA_MS`, `src/agente/tentativas.ts`). Passada a última, o agente desiste da
nota até ela crescer (gateiro: +50%; ciclo: 200 caracteres novos desde o último ciclo).
Uma resposta boa zera o contador. Offline por horas, isso dá no máximo cinco pedidos por nota
e depois silêncio — no ciclo também, porque o primeiro resumo que falha por rede, sessão, plano, cota,
créditos, provedor, escopo ou chave interrompe a rodada inteira (só `modelo`/`resposta` caem no trecho
cru). O contador vive só em memória: reiniciar o app recomeça.

**Créditos esgotados** (`creditos`, provedor próprio, em qualquer caminho): o segundo plano
inteiro pausa — nenhum gateiro nem ciclo roda — e o painel mostra a mensagem de créditos. O
chat continua permitido (é ação explícita). A pausa termina quando o saldo do servidor volta
a ter crédito (`usados < total`), quando a sessão ou a configuração mudam, ou quando qualquer
resposta do provedor der certo; durante a pausa o app confere o saldo a cada 30 min. Uma
resposta bem-sucedida também limpa o erro definitivo (quem virou premium depois de um 403).

### 5.1 Gateiro

Entrada: até os primeiros 2.000 caracteres da nota (sem frontmatter). Saída JSON estrita:

```json
{ "valeParticipar": true, "tema": "orçamento de 2026", "confianca": 0.8 }
```

O modelo não escreve a pergunta do convite: o texto do convite vem do catálogo de interface, com
o `tema` detectado (`convite` guarda só `{ path, tema }`).

Parse defensivo. `valeParticipar: false` ou `confianca < 0.5`: não convida, e o rodapé do
painel diz por quê — "O agente leu esta nota e decidiu não participar por enquanto"
(revisão 13/09: a decisão era invisível, e invisível parecia bug). Nova tentativa só se a
nota crescer >50%. Falha de rede ou JSON inválido: mesma linha de status em versão de erro,
e a tentativa fica liberada depois da espera crescente do §5.0 (pane não consome a
espera de +50%; esgotadas as esperas, vale a regra de +50%). O convite, quando vem, aparece como toast (§6.1) com o tema detectado.

### 5.2 Convite

- **Aceitar** → participação `aceito`; primeiro ciclo do assistente roda imediatamente.
- **Recusar** → `recusado`, definitivo para a nota.
- **Agora não** → `adiado`; convite pode voltar se o assunto mudar.

### 5.3 Assistente

Por ciclo, monta o prompt com orçamento fixo (teto ~4.000 tokens de entrada):

| Bloco | Fonte | Teto |
|---|---|---|
| Fatos de memória | `fatos.json` (mais recentes) | ~1.200 tokens |
| Notas relacionadas | recuperação local (§5.5) → resumos em cache | ~1.500 tokens (3–5 notas) |
| Nota atual | texto integral até 6.000 chars; acima disso, cauda (últimas edições) + resumo | ~1.000 tokens |
| Diff do ciclo | linhas adicionadas/removidas desde o último ciclo | ~300 tokens |

Saída JSON estrita:

```json
{ "sugestoes": [
    { "tipo": "pergunta" | "conteudo" | "gap" | "notaRelacionada",
      "texto": "…", "caminhoNota": "Projetos/X.md" } ],
  "novosFatos": [ "…" ] }
```

No máximo 4 sugestões por ciclo e 2 fatos novos. O prompt não pede `precisaWeb` nem
`achadoWeb` (ver §5.4).

- `notaRelacionada` exige `caminhoNota` resolvido no índice (senão descarta a sugestão —
  nunca inventa caminho).
- `novosFatos` entram em `fatos.json` (§2.2).
- Sugestões substituem as anteriores da mesma nota (não acumulam entre ciclos); o usuário
  pode copiar ou dispensar uma — dispensada some. Não existe botão "útil" nem sugestão fixada.
- Web search **não está implementado**: não há campo `precisaWeb`, e um `achadoWeb` que o modelo
  devolva por conta própria é descartado na interpretação. O §5.4 é o desenho da fase 5.

### 5.4 Web search

Tool nativo do provedor, nunca scraping próprio: Anthropic `web_search`, Gemini
`google_search`, OpenAI via Responses API (incerteza no doc 09 — se não validar, OpenAI
fica sem web search na v1). Desligado por padrão na configuração.

### 5.5 Recuperação local (sem embeddings)

1. Termos-chave do diff (substantivos por frequência, stopword pt-BR) → `buscarConteudo`
   do índice minisearch (o mesmo da busca, `busca/minisearchIndex.ts`) → top 5.
2. Backlinks e outlinks diretos da nota ativa (`vaultStore.links`) → até 3.
3. Dedupe, exclui a própria nota, prioriza notas com participação `aceito`.
4. Cada nota entra como **resumo em cache** (`resumos.json`); sem resumo, gera com o
   modelo gateiro (1 chamada barata, assíncrona — o ciclo atual usa o trecho bruto de até
   400 chars em volta do match enquanto o resumo não existe).

### 5.6 Orçamento

- Contador local: tokens de entrada/saída do `usage` de cada resposta + custo estimado
  (§3.1), por sessão e por dia (`uso.json`).
- Visível no painel: "12,4 mil tokens · ~US$ 0,03 hoje".
- `tetoDiarioUsd` configurado e atingido → status `pausado`, toast único:
  "Limite diário do agente atingido. Ele volta amanhã, ou você pode ajustar o limite."
  **Não implementado:** o campo "Limite diário de gasto em US$ (opcional)" é gravado, e
  `atingiuTeto`/`podeChamar` existem em `src/agente/orcamento.ts`, mas ninguém os chama —
  o teto não é aplicado e o toast nunca aparece. Como `precos` está vazio (§3.1), o custo
  estimado também é sempre zero.
- Sem teto por padrão: só o medidor. Pausa manual sempre disponível (menu `…` do painel → "Pausar acompanhamento").

---

## 6. Interface

### 6.1 Abertura do painel e convite

Revisto em 01/10/2026: o balão flutuante saiu. Não há botão fixo no canto da tela; o canto
inferior direito só tem os toasts.

Só existe quando `habilitado`. O painel do agente se abre de três formas: pela aba "Agente" no
cabeçalho do painel lateral (a aba aparece junto da aba "Tarefas" quando o agente está
habilitado — doc 06, "Painel lateral do agente de IA"), ao permitir o convite no toast, ou
ao aceitar o convite dentro do painel já aberto.

O convite da nota ativa aparece como **toast** (`ConviteAgente`): "Posso ajudar com esta nota?",
com o tema detectado na descrição, botões "Permitir" e "Agora não", e 10 segundos de
duração. "Permitir" aceita o convite e abre o painel. "Agora não", fechar o toast ou deixá-lo
expirar adia o convite. O convite só aparece se for da nota ativa, e num lugar só (decisão do
dono, 01/10/2026): o toast vale só com o painel do agente fechado; com ele aberto, o convite
fica apenas no topo da conversa (§6.2). Abrir o painel com o toast na tela tira o toast sem
responder o convite (`localConvite.ts`).

O estado interno do agente (`ocioso`, `pensando`, `pausado`, `erro`) continua no
`agenteStore`, mas hoje não tem indicador visual fora do painel: o erro aparece no rodapé do
painel, e a pausa só no texto do item de menu ("Pausar acompanhamento"/"Retomar
acompanhamento"). O status `observando` continua sem ser emitido por nada. Também não há mais
ponto de "atualização" — o agente não sinaliza fora do painel que chegaram sugestões novas.

### 6.2 Painel

Revisto em 01/10/2026 (opção A, plano 20): painel lateral direito, fora das abas de
documentos, com Agente/Tarefas alternando o mesmo espaço. Em desktop (lg, 1024px em diante)
usa altura disponível e largura fluida de 20–27rem. Abaixo de lg, somente o agente vira
painel inferior. Sem alteração global de sm/md/xl. Clicar no editor não fecha o agente.
Esc dentro do painel, fechar e trocar para a aba Tarefas preservam o rascunho. Cabeçalho compacto, sem nome
da nota nem faixa vazia; contexto “Nota atual” junto ao campo.

A conversa é a tela principal, sem abas Sugestões/Memória. Histórico manual identifica
“Você” e “Agente”. Cada análise automática começa como um bloco do agente: mostra fase
real de leitura/consulta local/preparação e termina com sugestões ou erro no mesmo bloco.
Resultados anteriores são recolhíveis. Cada nota guarda no máximo as 20 análises mais
recentes (as mais antigas são descartadas ao anexar uma nova e ao reabrir o vault; análise
em andamento nunca é descartada); mensagens do usuário e respostas do chat não entram nesse limite. Cada sugestão mantém copiar, dispensar e abrir nota
relacionada, sem escrever automaticamente no editor. Memória candidata é indicada para
revisão, sem anúncio de aprendizado confirmado. Pesquisa web continua indisponível.

“O que o agente lembra” fica no menu e abre gerenciamento secundário com voltar à conversa.
Lista confirmados, candidatos, registros antigos a revisar e versões arquivadas; permite
confirmar/rejeitar, editar e apagar. Origem, evidência, escopo e data contextualizam a
lembrança. O botão explícito “Lembrar esta preferência” numa mensagem do usuário registra
uma preferência confirmada localmente; não extrai todas as mensagens automaticamente.
Não há contagem permanente de memórias no cabeçalho.

Convite mantém “Aceitar”, “Agora não” e “Recusar” no fluxo da conversa. Campo de pergunta
no rodapé, Enter envia e Shift+Enter quebra linha; entrada 16px e alvos mínimos de 44px.
Pausar acompanhamento suspende os gatilhos automáticos e mantém o chat manual disponível.
Rodapé mantém créditos/uso (§5.6) e ações de conta existentes. Atividades são independentes
por operação, nota e geração do vault; concluir uma não oculta outra ainda em andamento.

Desenhos e documentos ainda indisponíveis usam a conversa geral, como no motor; título,
histórico e avisos compartilham essa chave. Rascunhos são locais e separados por conversa e
espaço de trabalho. Quando uma resposta está em andamento em outra nota, isso é informado
sem mostrar o spinner como resposta da nota atual; permanece o bloqueio de pedidos
simultâneos existente. Trocar espaço de trabalho ou limpar memória invalida resultados
antigos, evitando que resposta/aviso anterior apareça na nova sessão.

Ao abrir/reabrir ou trocar de nota, a conversa mostra as mensagens recentes. Enviar uma mensagem
leva ao fim da conversa correspondente. Ao chegar resposta, acompanha automaticamente apenas
se a pessoa já estava perto do fim (48 px); caso esteja lendo acima, preserva a posição e mostra
“Nova atividade”. Voltar do gerenciamento de memória mostra o fim. Mudanças de crédito
não deslocam a conversa; novos blocos/resultados acompanham só quem já estava no fim.
A rolagem deve atuar no contêiner da conversa,
sem mover editor ou página; resposta tardia de outra nota não altera contexto nem posição atuais.

Quando o provedor é a IA do Excalisidian e a sessão está ausente ou foi recusada, o painel
oferece **Entrar na conta** e abre Preferências → Conta. O sinal de sessão recusada é distinto
de erro de rede, plano ou créditos; esses erros não exibem esse botão. O fluxo de abertura da
Conta valida a sessão antes de mostrar o formulário de entrada. Se a sessão ainda estiver
presente, o painel tenta recuperá-la: token novo retoma o fluxo, expiração confirmada abre a
entrada, e recusa inconclusiva oferece nova tentativa sem alegar que a pessoa está deslogada.

### 6.3 Configuração — assistente por etapas

O usuário nunca edita JSON nem digita nome de modelo no escuro. A configuração é um
**assistente em etapas** (`DialogoAgente`, um `Dialog` padrão com indicador de passos no
topo), e o `settings.json` (§2.1) é só onde o resultado fica guardado.

**Entradas** (nenhuma delas importuna — o produto não anuncia o agente por conta própria;
a única exceção é o provedor próprio aparecendo como mais uma opção no passo 1 do assistente,
§3.2):

- Configurações (`Ctrl+,` / engrenagem da sidebar) → seção "Agente de IA", colapsada por
  padrão, com o aviso fixo: "Opcional. Nada é enviado sem a sua configuração, e o agente
  só acompanha uma nota depois que você aceita o convite." Sem configuração, a seção tem
  um único botão primário: "Configurar agente".
- Paleta de comandos: "Agente: configurar".

**Etapas do assistente:** a IA do Excalisidian usa dois passos, **Provedor → Sua conta**. Na
primeira configuração, ela já vem selecionada quando está disponível; se a conta estiver
desativada no build, a seleção inicial é OpenAI. Na reconfiguração, o provedor salvo é mantido
e o assistente abre no segundo passo. Os provedores de chave própria mantêm os cinco passos
descritos na tabela.

| # | Passo | Conteúdo |
|---|---|---|
| 1 | **Provedor** | Cartões selecionáveis, um por provedor do catálogo (§3), com nome e uma linha de descrição ("Anthropic — Claude, exige chave de api.anthropic.com", "Ollama — modelos locais, sem chave nem nuvem", …). |
| 2 | **Chave da API** | Campo password + link "Onde consigo uma chave?" (abre a página de chaves do provedor no navegador). Colar e continuar dispara a busca de modelos — que **é** o teste de conexão: chave recusada mostra o erro traduzido (§7) no ato, sem sair do passo. Provedor sem chave (Ollama): o passo continua aparecendo (é o mesmo passo "Chave da API" do indicador de etapas), só que sem o campo — em vez dele, o texto "{Provedor} roda na sua máquina — não precisa de chave."; "Continuar" já dispara a busca de modelos sem autenticação. |
| 3 | **Modelo da leitura inicial** | Lista de modelos do provedor (buscada no passo 2, §3), com filtro por texto, os sugeridos para o papel no topo com selo "Sugerido", e "Outro modelo…" no fim (campo livre, para modelo que a listagem não trouxe). Rótulo em linguagem de produto: "Modelo da leitura inicial — barato e rápido, só decide se vale convidar". |
| 4 | **Modelo do acompanhamento** | Mesma lista, selos de sugerido para o papel, rótulo: "Modelo do acompanhamento — o que lê a nota e traz as sugestões". Pode ser o mesmo do passo 3 (seleção prévia se o usuário quiser). |
| 5 | **Revisão** | Resumo (provedor, chave mascarada `sk-…abcd`, os dois modelos), opcional "Pensamento (reasoning)" — só aparece quando o modelo da leitura inicial ou do acompanhamento é `gpt-5*`/`o*` no dialeto `openai` (§2.1) —, web search (toggle, só se o provedor suporta) e limite diário de gasto (número, vazio = sem limite). Botão final: "Ativar agente". |

Para a IA do Excalisidian, o passo **Sua conta** é terminal e substitui os passos de chave,
modelos e revisão. Mostra, conforme o estado: “Verificando sua conta…”; a instrução neutra
para entrar e o botão “Entrar na conta”; a mensagem do plano grátis e o link “Usar outro
provedor”; ou, em conta premium, e-mail, créditos restantes/total e data de renovação quando
o saldo foi confirmado. A explicação informa que cada pedido consome créditos conforme o
tamanho do texto enviado e da resposta. Saldo indisponível por rede fica omitido, sem valor
estimado. A ação final diz “Ativar agente” numa configuração nova e “Salvar” na reconfiguração.
Conta grátis volta ao passo Provedor; conta sem sessão abre Preferências → Conta por cima do
assistente e atualiza o estado ao retornar. Um `401` inconclusivo oferece “Tentar novamente”
e bloqueia a ação final; não é tratado como falta de internet.

- Navegação: "Voltar"/"Continuar" nos passos, Enter avança, Esc fecha o assistente inteiro
  (nada é gravado até o "Ativar agente" — fechar no meio não deixa configuração pela
  metade).
- O passo 2 tem um "Avançado" colapsado com a **base URL** do provedor (RF11.16): gateways
  próprios, Azure OpenAI, Ollama remoto, variantes do plano Alibaba. Mudar a base URL
  revalida a busca de modelos contra ela.
- Falha na busca de modelos por rede (não por chave): o passo oferece a lista estática de
  sugeridos do catálogo + "Outro modelo…", com o aviso "Não foi possível listar os modelos
  do provedor. Você pode escolher um sugerido ou digitar o nome."
- Reabrir o assistente com configuração existente: todos os passos vêm preenchidos, a
  chave mascarada (campo vazio = manter a atual; digitar = substituir).

Em Preferências → Agente, a IA do Excalisidian apresenta a linha **Créditos** com o mesmo
saldo e explicação, inclusive se o agente estiver desligado; “Reconfigurar” permanece
disponível quando a consulta falha. Provedores externos continuam mostrando **Modelos**.
O estado de conexão no painel deve oferecer acesso a Preferências → Conta conforme §6.2.
Essa entrada aparece somente diante de sessão ausente ou recusada e segue a recuperação
limitada descrita em §6.2.

**Depois de configurado**, a seção "Agente de IA" das Configurações mostra o resumo
(provedor, modelos) e as ações: "Desligar agente"/"Ligar agente" (o master switch — desligar
não apaga a configuração, volta a ligar sem reconfigurar), "Reconfigurar" (reabre o
assistente), "Testar conexão" (só com o agente ligado), "Abrir pasta do agente" e "Limpar
memória" (confirmação: "Apagar resumos, fatos, participações e conversas do agente? As
notas não são afetadas."). **Não implementado:** "Pausar agente"/"Retomar agente" nesta
seção — a pausa só existe pelo menu `…` do cabeçalho do painel (§6.2), não nas
Configurações.

### 6.4 Comandos e atalhos

- **Não implementado:** nenhum comando do agente existe na paleta hoje — nem "Agente:
  configurar", nem "Agente: pausar/retomar", nem "Agente: abrir painel". Os pontos de
  entrada reais são a seção "Agente de IA" das Configurações (§6.3) e o painel lateral (§6.1).
- Sem atalho de teclado novo na v1 (a aba "Agente" do painel lateral é o ponto de entrada; evitar colisão com o
  mapa existente).

---

## 7. Textos da interface

Português do Brasil, sentence case, sem emoji (doc 06, Voz da interface).

| Situação | Texto |
|---|---|
| Convite | "Esta nota parece tratar de {tema}. Quer que eu acompanhe?" |
| Convite — aceitar / adiar / recusar | "Aceitar" / "Agora não" / "Recusar" |
| Campo de conversa | "Perguntar sobre esta nota" |
| Estado ocioso (tooltip) | "Agente" |
| Estado observando (tooltip) | "Agente — acompanhando esta nota" |
| Estado pensando (tooltip) | "Agente — pensando" |
| Estado pausado (tooltip) | "Agente — pausado" |
| Medidor de uso | "{n} tokens · ~US$ {v} hoje" |
| Teto atingido (toast) | "Limite diário do agente atingido. Ele volta amanhã, ou você pode ajustar o limite." — **não implementado** (§ uso e custo) |
| Chave inválida (401/403, provedores de chave própria) | "A chave da API foi recusada pelo provedor. Confira a chave nas configurações." |
| Sem sessão (401 do provedor próprio, código `sessao`) | "Entre na sua conta do Excalisidian para usar a IA incluída no plano." (ADR-38) |
| Conta sem direito à IA paga (403 do provedor próprio, código `plano`) | "A IA do Excalisidian faz parte do plano premium. Sua conta está no plano grátis." (ADR-38) |
| Créditos esgotados (429 `creditos`, provedor próprio) | "Seus créditos de IA deste mês acabaram." (inglês: "You are out of AI credits for this month.") |
| Segundo plano parado por créditos | mesma mensagem de "Créditos esgotados", no painel, até o saldo voltar (§5.0). Nenhum texto novo. |
| Serviço instável (502/503/504, provedor próprio, código `instavel`) | "A IA do Excalisidian está instável agora. Tente de novo em instantes." (inglês: "Excalisidian AI is unstable right now. Try again in a moment.") |
| Limite por minuto (429 `{"codigo":"limite"}`, provedor próprio, código `limite`) | "Muitos pedidos seguidos. Espere um minuto." (inglês: "Too many requests in a row. Wait a minute.") |
| Conversa grande demais (413, provedor próprio, código `tamanho`) | "Esta conversa ficou grande demais. Limpe a conversa para continuar." (inglês: "This conversation got too large. Clear it to continue.") |
| Mensagem digitada com mais de 100.000 caracteres (chat, antes de enviar) | "Mensagem longa demais para o agente (máximo de 100 mil caracteres)." (inglês: "Message too long for the agent (100k characters maximum)."). Não envia e o texto fica no campo. |
| Cota do provedor (429, demais casos; e todo 429 de chave própria) | "O provedor limitou as chamadas agora. Tente de novo em instantes." |
| Provedor fora do ar (5xx/rede; em chave própria também 413 e 502/503/504) | "Não foi possível falar com o provedor. Verifique a conexão." |
| Modelo inexistente (404) | "O provedor não conhece o modelo «{modelo}». Confira o nome nas configurações." |
| Resposta inválida (JSON fora do schema) | no gateiro: linha de status no rodapé do painel ("A análise desta nota falhou. O agente tenta de novo quando você escrever mais.") e a tentativa fica liberada; na conversa: "O provedor devolveu uma resposta que não pude entender. Tente outro modelo." (`textoDoErro`, `src/agente/cliente.ts`). O estado `erro` após 3 falhas seguidas com "O provedor devolveu respostas inválidas. Tente outro modelo." **não está implementado**. |
| Gateiro decidiu não participar | "O agente leu esta nota e decidiu não participar por enquanto." |
| Sem rede (offline) | "Sem conexão com o provedor. Verifique a rede e tente de novo." (quando o detalhe do erro indica rede; senão cai no texto de "Provedor fora do ar") |
| Limpar memória (confirmação) | "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas." |
| Aviso da seção de configurações | "Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite." |
| Assistente — botão da seção sem config | "Configurar agente" |
| Assistente — passos da IA do Excalisidian | "Provedor" · "Sua conta" |
| Assistente — passos de provedor externo | "Provedor" · "Chave da API" · "Leitura inicial" · "Acompanhamento" · "Revisão" |
| Assistente — navegação externa | "Voltar" / "Continuar" / "Ativar agente"; na reconfiguração, "Salvar" |
| Assistente — conta sem sessão | "Entre na sua conta do Excalisidian para usar a IA incluída no plano." + "Entrar na conta" |
| Assistente — conta grátis | "A IA do Excalisidian faz parte do plano premium. Sua conta está no plano grátis." + "Usar outro provedor" |
| Assistente — conta premium | e-mail, saldo restante/total e renovação quando confirmados; explicação de consumo de créditos; ação "Ativar agente" ou "Salvar" |
| Preferências — IA do Excalisidian | linha "Créditos", saldo/data quando confirmados e explicação; "Reconfigurar" continua disponível |
| Preferências — provedores externos | linha "Modelos" |
| Painel — sessão ausente/recusada da IA do Excalisidian | "Entrar na conta" abre Preferências → Conta após validar/recuperar a sessão |
| Assistente — passo 2, link | "Onde consigo uma chave?" |
| Assistente — passo 3, rótulo | "Modelo da leitura inicial — barato e rápido, só decide se vale convidar" |
| Assistente — passo 4, rótulo | "Modelo do acompanhamento — o que lê a nota e traz as sugestões" |
| Assistente — selo de modelo | "Sugerido" |
| Assistente — opção de modelo fora da lista | "Outro modelo…" |
| Teste de conexão bem-sucedido | "Conexão funcionando." |
| Listagem de modelos falhou (rede) | "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome." |
| Listagem de modelos falhou (chave) | o texto de "Chave inválida" acima, no ato, sem sair do passo |

Erros nunca bloqueiam a escrita: o agente falha em silêncio relativo (estado `erro`,
mostrado no rodapé do painel), e o editor segue intocado.

---

## 8. Ícones

Estende a tabela do doc 06 (lucide, traço 1.5):

| Uso | Ícone |
|---|---|
| agente (painel lateral, convite) | `bot` |
| pausar / retomar | `pause` / `play` |
| fechar painel | `x` |
| sugestão: pergunta | `help-circle` |
| sugestão: conteúdo | `file-text` |
| sugestão: gap | `circle-alert` |
| sugestão: nota relacionada | `corner-down-left` |
| sugestão: achado web | `globe` |
| copiar sugestão | `copy` |
| dispensar sugestão | `x` |
| abrir pasta do agente | `folder-open` |
| limpar memória | `eraser` |

---

## 9. Requisitos funcionais

| RF | Descrição | Prioridade |
|---|---|---|
| RF11.1 | Configurar sem editar arquivo: IA do Excalisidian em dois passos (provedor → conta), com sessão premium confirmada antes de ativar; indisponibilidade de saldo por rede não bloqueia se não houve recusa de autenticação. Provedores externos usam cinco passos (provedor → chave → leitura inicial → acompanhamento → revisão), com busca de modelos validando a chave no ato. Na reconfiguração, a ação final é “Salvar”. | P0 |
| RF11.2 | Com o agente desabilitado ou não configurado, nenhum traço do agente aparece na UI nem pedido é enviado à IA. A consulta de créditos só ocorre quando a pessoa abre explicitamente o assistente ou Preferências, e serve apenas para apresentar saldo/estado da conta. | P0 |
| RF11.3 | Gateiro: analisar a nota ativa uma vez por sessão e convidar o usuário a participar, com o tema detectado. | P0 |
| RF11.4 | Convite com Aceitar / Agora não / Recusar; recusar é definitivo por nota; a decisão persiste entre sessões. | P0 |
| RF11.5 | Assistente: ciclos disparados por inatividade (10 s) + volume de diff (200 chars), nunca por linha digitada. | P0 |
| RF11.6 | Sugestões estruturadas (pergunta, conteúdo, gap, nota relacionada) no mesmo bloco de análise da conversa, com copiar, dispensar e fonte. | P0 |
| RF11.7 | Recuperação local por minisearch + backlinks, com resumos em cache invalidados por mtime+size. | P0 |
| RF11.8 | Medidor de tokens e custo estimado por sessão/dia no painel; teto diário opcional com pausa automática. | P1 |
| RF11.9 | Conversa sobre a nota ativa (ou geral), persistida em `conversas.json`; análises automáticas e chat no mesmo fluxo, com leitura preservada ao chegar conteúdo e memória confirmada no contexto. | P1 |
| RF11.10 | Memória estruturada proposta como candidata; confirmação/edição/rejeição pelo usuário em “O que o agente lembra”, acessível pelo menu, sem aba permanente ou FIFO de confirmados. | P1 |
| RF11.11 | Pasta de memória em `%APPDATA%` por vault, com "Abrir pasta do agente" e "Limpar memória" nas configurações. | P1 |
| RF11.12 | Web search pelo tool nativo do provedor, desligado por padrão, máx. 1 por ciclo. | P2 |
| RF11.13 | Painel lateral com abas Agente/Tarefas e convite por toast (§6.1), só visíveis com o agente habilitado. (O balão com estados e ponto de atualização foi removido em 01/10/2026.) | P0 |
| RF11.14 | Pausar/retomar acompanhamento pelo menu do agente; chat manual permanece disponível. Paleta de comandos: não implementado (§6.4). | P1 |
| RF11.15 | Falha de rede/provedor nunca bloqueia a edição nem perde conteúdo; erro visível só no painel. | P0 |
| RF11.16 | Base URL editável por provedor (gateways próprios, Ollama remoto). | P2 |
| RF11.17 | Lista de modelos buscada do provedor (endpoint por dialeto, §3), com filtro, sugeridos no topo e fallback estático quando a listagem falha. | P0 |

---

## 10. Decisões

### 10.1 API key primeiro, OAuth depois

OAuth de assinatura (usar o plano Claude Pro/Max do usuário, como fazem OpenClaw/Hermes)
exige fluxo PKCE com deep link ou servidor local, client ID próprio, e vive em zona
cinzenta dos ToS dos provedores para apps de terceiros. API key é oficial, funciona em
todos os provedores e custa uma fração. Condição de reversão: se o custo de API virar
objeção real de uso, uma fase própria implementa OAuth por provedor (começando pelo que o
usuário usar).

### 10.2 Memória em %APPDATA%, não no vault

Transcripts e fatos de IA são derivados e sensíveis; commitá-los no Git sem aviso violaria
a confiança do vault. A pasta de config do vault (`.excalisidian/`) continua só com o que é
do produto (vault.json, tarefas.json). Condição de reversão: se o usuário quiser memória
portável entre máquinas, exportar/importar a pasta (arquivo único) resolve sem movê-la.

### 10.3 Dois modelos, não um

O gateiro roda especulativamente (pode não virar convite aceito); o assistente só roda com
aceite. Separar permite custo quase nulo no estágio 1 e qualidade onde importa. Usar o
mesmo modelo nos dois campos é permitido e suportado.

### 10.4 Sem teto de gasto por padrão

Pedido explícito do usuário. O controle é o medidor visível + pausa manual + teto opcional.
Risco aceito: um vault com escrita intensa e web search ligado gasta sem bloqueio automático
até o usuário configurar o teto.

### 10.5 Recuperação sem embeddings

minisearch + grafo de links já existem e cobrem o caso de uso (notas relacionadas por
termo e por link) sem modelo de embedding local nem índice vetorial. Condição de reversão:
se a qualidade da recuperação decepcionar em uso real, embeddings locais (ex.: modelo ONNX
pequeno no WebView) entram como camada adicional — o contrato de `recuperacao.ts` isola a
troca.

### 10.6 Agente nunca escreve no vault

Limite duro de segurança e confiança: a IA sugere, o usuário cola. Mesmo "criar nota a
partir da sugestão" é ação do usuário (botão que cria nota vazia com o título sugerido,
como qualquer criação). Condição de reversão: nenhuma enquanto o produto for local-first.

### 10.7 Configuração por assistente, modelos listados do provedor

Pedido explícito do usuário: configurar não pode exigir editar JSON nem digitar nome de
modelo. O assistente em etapas (§6.3) guia de provedor a modelo, e a lista de modelos vem
do endpoint de listagem do próprio provedor (§3) — o usuário escolhe entre nomes reais,
com os sugeridos marcados. A busca de modelos doubles como teste de conexão: erro de chave
aparece no passo em que ela foi colada, não depois. Condição de reversão: nenhuma — isto é
piso de usabilidade, não trade-off. O custo é manter os endpoints de listagem dos três
dialetos (tabelados no §3, verificados na fase 1).

---

## 11. Arquitetura

Segue a estrutura do doc 05.

| Arquivo | Responsabilidade |
|---|---|
| `src/agente/tipos.ts` | `ConfigAgente`, `Sugestao`, `FatoMemoria`, `EstadoAgente`, `UsoTokens`. |
| `src/agente/provedores.ts` | catálogo (§3), validação de base URL, preços. Puro. |
| `src/agente/cliente.ts` | `completar(mensagens, opts)` e `listarModelos(provedor, chave)` nos 3 dialetos sobre plugin-http; mapeia erros HTTP para os textos do §7. |
| `src/agente/orcamento.ts` | contagem de tokens/custo, teto diário, `podeChamar()`. Puro. |
| `src/agente/gatilhos.ts` | camada 0 (§5.0): debounce de inatividade, diff local, limiares. Puro. |
| `src/agente/gateiro.ts` | prompt + parse defensivo da saída (§5.1). |
| `src/agente/assistente.ts` | montagem do prompt com tetos (§5.3), parse da saída, ciclo. |
| `src/agente/recuperacao.ts` | top-k local (§5.5) sobre `buscarConteudo` + `vaultStore.links`. |
| `src/agente/memoria.ts` | persistência local, candidatos/evidência/escopo, confirmação/substituição e seleção de memória. |
| `src/agente/webSearch.ts` | **não implementado** — arquivo não existe ainda; a ativação do tool nativo por dialeto (§5.4) é a fase 5 (§13), ainda pendente. |
| `src/estado/agenteStore.ts` | estado + ações (§4). |
| `src/ui/excalisidian/PainelLateral.tsx` | coluna lateral que divide o espaço entre Tarefas e agente, com largura redimensionável (§6.2). |
| `src/ui/excalisidian/CabecalhoPainelLateral.tsx` | cabeçalho de 34px com as abas Agente/Tarefas, ações e recolher. |
| `src/ui/excalisidian/ConviteAgente.tsx` | convite como toast (§6.1). |
| `src/ui/excalisidian/CreditosAgente.tsx` | cartão de saldo de créditos nas configurações e preferências do agente. |
| `src/ui/excalisidian/PainelAgente.tsx` | conteúdo do painel do agente (§6.2). |
| `src/ui/excalisidian/DialogoAgente.tsx` | assistente de configuração em etapas (§6.3) + a seção "Agente de IA" das Configurações que o abre. |

Montagem: `PainelLateral` (que contém `PainelTarefas` e `PainelAgente`) e `ConviteAgente` entram
no `App.tsx`.
`agenteStore.carregar()` roda no boot junto com `prefsStore`; a participação e os gatilhos
assinam `workspaceStore.caminhoAtivo` e `documentosStore.editar` por `subscribe` — sem
alterar os stores existentes.

Rede: `@tauri-apps/plugin-http` com escopo de hosts em `capabilities/main.json`. Streaming
(SSE) fica para uma fase própria se a latência da conversa manual incomodar (doc 09,
incerteza).

---

## 12. Testes mínimos

Na linha do doc 05 §10 — poucos, mas estes:

1. `provedores.ts`: validação de base URL (aceita as do catálogo e localhost com porta;
   recusa esquema não-http(s)).
2. `cliente.ts` (mock do plugin-http): os 3 dialetas montam o request certo (headers,
   corpo) e mapeiam 401/429/404/5xx para os códigos de erro do §7; `listarModelos` nos 3
   dialetas (formato de resposta de cada endpoint, §3) e o fallback quando a listagem
   falha.
3. `gateiro.ts`: JSON válido vira convite; JSON inválido/garbage não convida e não lança.
4. `gatilhos.ts` (fake timers): 10 s + 200 chars disparam 1 ciclo; digitação contínua não
   dispara; diff abaixo do limiar não dispara.
5. `assistente.ts`: prompt respeita os tetos (nota gigante entra como cauda+resumo);
   saída com `caminhoNota` inexistente é descartada.
6. `memoria.ts`: round-trip dos 4 arquivos; `recusado` nunca re-convida; rename migra a
   participação; LRU de resumos.
7. `orcamento.ts`: contagem e custo por dialeto; teto atingido → `podeChamar() === false`.
8. `recuperacao.ts`: exclui a própria nota, dedupe entre minisearch e backlinks, prioriza
   participação aceita.
9. Fluxo de créditos de apresentação: premium com saldo zero continua sendo saldo válido;
   respostas de outra sessão são descartadas; `401` recupera uma vez, `403` bloqueia por plano,
   e falha de rede sem recusa anterior omite o saldo. Rede durante recuperação de `401` não
   libera a ação final. Cobrir a regra pura e os handlers que a usam, sem teste de renderização.
10. Assistente: IA própria tem dois passos e modelos lógicos preenchidos; provedores externos
    preservam cinco passos e os dados de chave/base URL ao trocar provedor; a regra usada pelo
    handler diferencia ativar de salvar. Cobrir navegação e autorização com funções puras/store,
    não só uma lista de rótulos.
11. Preferências: busca escolhe “Créditos” para IA própria e “Modelos” para externos; saldo
    indisponível não remove “Reconfigurar”. O painel e o layout/portal precisam de conferência
    manual, pois o Vitest usa ambiente Node sem DOM.

---

## 13. Fases de entrega

| Fase | Entrega | Pronto quando | Status |
|---|---|---|---|
| 1 | Infra: plugin-http escopado, assistente de configuração (§6.3) com `listarModelos`, `cliente.ts` (3 dialetas), conversa manual no painel, ponto de entrada mínimo (na época, um balão; hoje a aba "Agente") | configurar do zero pelo assistente em < 1 minuto sem digitar nome de modelo; "Perguntar sobre esta nota" responde com tokens contados; chave inválida é recusada no passo 2 com o texto do §7; sem config, zero traço na UI | **feita 13/09/2026** (testada em tela pelo usuário) |
| 2 | Gateiro + convite + participação persistida | convite 1× por nota/sessão; recusar silencia para sempre | **feita 13/09/2026** — falta validar em tela |
| 3 | Pipeline contínuo: gatilhos, diff, recuperação, resumos, orçamento | sugestões aparecem sem estourar teto; medidor bate com o billing; pausar corta tudo | **feita 13/09/2026** — falta validar em tela |
| 4 | Memória de longo prazo (fatos), conversas persistidas, pasta do agente nas configurações | apagar a pasta não quebra nada; fatos entram no contexto | **feita 13/09/2026** — falta validar em tela |
| 5 | Web search pelo tool nativo do provedor (§5.4) | busca pontual no ciclo com `precisaWeb` | pendente — o toggle fica escondido até lá (nenhum dialeto implementa o tool; `achadoWeb` é descartado na interpretação) |

Dependência: fase 3 usa `busca/minisearchIndex.ts` (Fatia 8, pronta desde 12/09/2026).
