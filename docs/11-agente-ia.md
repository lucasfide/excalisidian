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
   decide se vale convidar o usuário. O convite aparece no balão; sem aceite, nada mais
   acontece.
2. **Assistente** (modelo forte): só depois do aceite, acompanha a escrita em ciclos
   disparados por inatividade, lê o diff desde o último ciclo, recupera notas relacionadas
   no índice local e devolve sugestões estruturadas.

### Princípios

- **Desligado por padrão, e fica desligado.** Sem configuração, nenhum traço do agente
  aparece na UI — nem balão, nem comando, nem aviso. O produto não pede, não insiste, não
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
| `modeloGateiro` / `modeloAssistente` | escolhidos da lista do provedor no assistente (§6.3); o mesmo modelo pode ocupar os dois. |
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

Append-only, deduplicado por texto idêntico, teto de 100 fatos (FIFO: o mais antigo sai).
Entra no prompt do assistente como bloco único de até ~1.200 tokens (corta pelos mais
recentes). O assistente propõe fatos na saída estruturada (§5.3); o app grava sem perguntar
— mas o painel lista os fatos e o usuário pode apagar qualquer um.

#### `conversas.json`

```json
{ "versao": 1,
  "porPath": { "Projetos/Nota.md": { "atualizadaEm": "…", "mensagens": [ { "papel": "usuario", "texto": "…" } ] } } }
```

Uma conversa por nota na v1 (a chave é o caminho; nota nenhuma aberta = chave `""`).
Revisto na fase 4: o plano original era uma pasta com um arquivo por conversa — um único
arquivo com índice embutido simplifica a restauração no boot e o "limpar memória" sem
ganho perceptível do outro formato. "Limpar memória" apaga tudo. Cada envio manda só as
últimas 12 mensagens da conversa como histórico (`agenteStore.ts`); mais antigas continuam
salvas em disco, só não voltam ao contexto da próxima chamada.

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
- **Assistente de configuração** (§6.3) tem passos diferentes para este provedor: o passo da
  chave vira passo de conta (sem campo de chave), a listagem de modelos não vai à rede, o
  campo "Avançado · Base URL" some, e o passo de revisão esconde chave e limite de gasto.
- **Cota mensal em créditos, contada no servidor** (doc 18 §5) — o cliente só interpreta o
  saldo que chega (`src/servico/creditos.ts`), nunca conta localmente. Premium: 3.000
  créditos por mês; plano superior: 10.000 (o app não distingue, só mostra o total). O
  servidor existe e expõe `GET /creditos`. O app busca o saldo ao abrir o painel do agente e
  depois de cada resposta do provedor próprio; com a conta de teste do modo de
  desenvolvimento (servidor local) não busca. Qualquer falha deixa o saldo em `null` e o
  medidor **oculto**: nunca se mostra número inventado, e zero seria mentir sobre dinheiro.
- **Créditos esgotados:** 429 com corpo `{"codigo":"creditos"}` vira o código de erro
  `creditos`. Um 429 sem esse corpo continua sendo `cota` (limite momentâneo).
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
status: "desligado" | "ocioso" | "observando" | "pensando" | "erro"
participacaoAtual: "nenhuma" | "pendente" | "aceito"   (nota ativa)
convite: { tema, pergunta } | null
sugestoes: Sugestao[]            (da nota ativa, desde o último aceite)
uso: { tokensEntrada, tokensSaida, custoUsd, porDia }
painelAberto: boolean
conversa: Mensagem[]             (conversa manual em curso)
```

Ações: `carregar()`, `salvarConfig()`, `testarConexao()`, `responderConvite()`,
`enviarMensagem()`, `pausar()`, `retomar()`, `limparMemoria()`.

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

### 5.1 Gateiro

Entrada: até os primeiros 2.000 caracteres da nota (sem frontmatter). Saída JSON estrita:

```json
{ "valeParticipar": true, "tema": "orçamento de 2026",
  "confianca": 0.8, "pergunta": "Quer que eu acompanhe esta nota?" }
```

Parse defensivo. `valeParticipar: false` ou `confianca < 0.5`: não convida, e o rodapé do
painel diz por quê — "O agente leu esta nota e decidiu não participar por enquanto"
(revisão 13/09: a decisão era invisível, e invisível parecia bug). Nova tentativa só se a
nota crescer >50%. Falha de rede ou JSON inválido: mesma linha de status em versão de erro,
e a tentativa fica liberada para o próximo ciclo de inatividade (pane não consome a
espera de +50%). O convite, quando vem, aparece no balão (§6.1) com o tema detectado.

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
    { "tipo": "pergunta" | "conteudo" | "gap" | "notaRelacionada" | "achadoWeb",
      "texto": "…", "caminhoNota": "Projetos/X.md" } ],
  "novosFatos": [ "…" ],
  "precisaWeb": false }
```

- `notaRelacionada` exige `caminhoNota` resolvido no índice (senão descarta a sugestão —
  nunca inventa caminho).
- `novosFatos` entram em `fatos.json` (§2.2).
- Sugestões substituem as anteriores da mesma nota (não acumulam entre ciclos); o usuário
  pode marcar uma como "útil"/"dispensar" — dispensada some, útil fica fixada no topo.
- `precisaWeb: true` + `webSearch` ligado → segunda chamada com o tool nativo (§5.4),
  máximo 1 por ciclo; o resultado volta como sugestão `achadoWeb` com a URL no texto.

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
- `tetoDiarioUsd` configurado e atingido → status `pausado`, balão cinza, toast único:
  "Limite diário do agente atingido. Ele volta amanhã, ou você pode ajustar o limite."
  **Não implementado:** o campo "Limite diário de gasto em US$ (opcional)" é gravado, e
  `atingiuTeto`/`podeChamar` existem em `src/agente/orcamento.ts`, mas ninguém os chama —
  o teto não é aplicado e o toast nunca aparece. Como `precos` está vazio (§3.1), o custo
  estimado também é sempre zero.
- Sem teto por padrão: só o medidor. Pausa manual sempre disponível (balão → "Pausar").

---

## 6. Interface

### 6.1 Balão

Canto inferior direito, `position: fixed`, 16px das bordas, **acima do Toaster** (o sonner
ganha `offset` para não sobrepor). Redondo, 40px, `raio-pilula`, fundo `superficie`,
hairline `regua`, `sombra-ficha`; no tema escuro a hairline é obrigatória (regra geral do
doc 06). Ícone `bot` (lucide), 18px.

Só existe quando `habilitado`. Estados:

| Estado | Aparência |
|---|---|
| `ocioso` | ícone `tinta-suave` |
| `observando` | ícone `tinta-media` — **não implementado**: o tipo e o visual existem (`BalaoAgente.tsx`), mas nada no `agenteStore.ts` emite este status hoje; uma nota com participação aceita e sem ciclo em voo fica em `ocioso` mesmo depois do aceite |
| `pensando` | ícone + anel `ocre` pulsando (animação "pulso", 1,6s) |
| `convite` | badge `cristal` com `!` + card de convite aberto (§6.2) |
| `sugestões` | badge `cristal` com o número |
| `pausado` | ícone `tinta-suave` + barra diagonal (lucide `bot-off` quando existir; senão opacidade 50%) |
| `erro` | ícone `bordo`; clique mostra o erro no painel |

Clique alterna o painel. Tooltip com o estado (`title`, como os `BotaoIcone`).

### 6.2 Painel

Cartão flutuante ancorado acima do balão, 360px de largura, máx. 60vh de altura com scroll,
fundo `superficie`, `raio-ficha`, `sombra-sobreposicao`, hairline `regua` no escuro. Fora
do dockview de propósito (mesma razão do painel de tarefas, doc 10 §10.4): utilitário não
compete com abas. Fecha por Esc, clique fora, ou no balão.

De cima para baixo:

1. **Cabeçalho**: "Agente" + estado + botão pausar/retomar (`pause`/`play`) + fechar (`x`).
2. **Convite** (quando há): "Esta nota parece tratar de **{tema}**. Quer que eu acompanhe?"
   + botões "Aceitar" (primário) / "Agora não" (fantasma) / "Recusar" (fantasma, `tinta-suave`).
3. **Sugestões**: lista; cada item com ícone por tipo (`help-circle` pergunta, `file-text`
   conteúdo, `search-check` gap? — ver §8, `corner-down-left` nota relacionada, `globe`
   achadoWeb), texto, e ação por item: "Copiar" (insere na área de transferência) e
   "Dispensar". Nota relacionada é clicável como `LinkInterno`.
4. **Conversa**: histórico da conversa manual da nota ativa + campo "Perguntar sobre esta
   nota" (Enter envia, Shift+Enter quebra linha).
5. **Rodapé**: medidor de uso (§5.6) em `meta`/`tinta-suave`.

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

**Etapas do assistente:**

| # | Passo | Conteúdo |
|---|---|---|
| 1 | **Provedor** | Cartões selecionáveis, um por provedor do catálogo (§3), com nome e uma linha de descrição ("Anthropic — Claude, exige chave de api.anthropic.com", "Ollama — modelos locais, sem chave nem nuvem", …). |
| 2 | **Chave da API** | Campo password + link "Onde consigo uma chave?" (abre a página de chaves do provedor no navegador). Colar e continuar dispara a busca de modelos — que **é** o teste de conexão: chave recusada mostra o erro traduzido (§7) no ato, sem sair do passo. Provedor sem chave (Ollama): o passo continua aparecendo (é o mesmo passo "Chave da API" do indicador de etapas), só que sem o campo — em vez dele, o texto "{Provedor} roda na sua máquina — não precisa de chave."; "Continuar" já dispara a busca de modelos sem autenticação. |
| 3 | **Modelo da leitura inicial** | Lista de modelos do provedor (buscada no passo 2, §3), com filtro por texto, os sugeridos para o papel no topo com selo "Sugerido", e "Outro modelo…" no fim (campo livre, para modelo que a listagem não trouxe). Rótulo em linguagem de produto: "Modelo da leitura inicial — barato e rápido, só decide se vale convidar". |
| 4 | **Modelo do acompanhamento** | Mesma lista, selos de sugerido para o papel, rótulo: "Modelo do acompanhamento — o que lê a nota e traz as sugestões". Pode ser o mesmo do passo 3 (seleção prévia se o usuário quiser). |
| 5 | **Revisão** | Resumo (provedor, chave mascarada `sk-…abcd`, os dois modelos), opcional "Pensamento (reasoning)" — só aparece quando o modelo da leitura inicial ou do acompanhamento é `gpt-5*`/`o*` no dialeto `openai` (§2.1) —, web search (toggle, só se o provedor suporta) e limite diário de gasto (número, vazio = sem limite). Botão final: "Ativar agente". |

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

**Depois de configurado**, a seção "Agente de IA" das Configurações mostra o resumo
(provedor, modelos) e as ações: "Desligar agente"/"Ligar agente" (o master switch — desligar
não apaga a configuração, volta a ligar sem reconfigurar), "Reconfigurar" (reabre o
assistente), "Testar conexão" (só com o agente ligado), "Abrir pasta do agente" e "Limpar
memória" (confirmação: "Apagar resumos, fatos, participações e conversas do agente? As
notas não são afetadas."). **Não implementado:** "Pausar agente"/"Retomar agente" nesta
seção — a pausa só existe pelo balão e pelo cabeçalho do painel (§6.1, §6.2), não nas
Configurações.

### 6.4 Comandos e atalhos

- **Não implementado:** nenhum comando do agente existe na paleta hoje — nem "Agente:
  configurar", nem "Agente: pausar/retomar", nem "Agente: abrir painel". Os pontos de
  entrada reais são a seção "Agente de IA" das Configurações (§6.3) e o balão (§6.1).
- Sem atalho de teclado novo na v1 (o balão é o ponto de entrada; evitar colisão com o
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
| Cota do provedor (429, demais casos) | "O provedor limitou as chamadas agora. Tente de novo em instantes." |
| Provedor fora do ar (5xx/rede) | "Não foi possível falar com o provedor. Verifique a conexão." |
| Modelo inexistente (404) | "O provedor não conhece o modelo «{modelo}». Confira o nome nas configurações." |
| Resposta inválida (JSON fora do schema) | no gateiro: linha de status no rodapé do painel ("A análise desta nota falhou. O agente tenta de novo quando você escrever mais.") e a tentativa fica liberada; na conversa: "O provedor devolveu uma resposta que não pude entender. Tente outro modelo." (`textoDoErro`, `src/agente/cliente.ts`). O estado `erro` após 3 falhas seguidas com "O provedor devolveu respostas inválidas. Tente outro modelo." **não está implementado**. |
| Gateiro decidiu não participar | "O agente leu esta nota e decidiu não participar por enquanto." |
| Sem rede (offline) | "Sem conexão com o provedor. Verifique a rede e tente de novo." (quando o detalhe do erro indica rede; senão cai no texto de "Provedor fora do ar") |
| Limpar memória (confirmação) | "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas." |
| Aviso da seção de configurações | "Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite." |
| Assistente — botão da seção sem config | "Configurar agente" |
| Assistente — passos | "Provedor" · "Chave da API" · "Leitura inicial" · "Acompanhamento" · "Revisão" |
| Assistente — navegação | "Voltar" / "Continuar" / "Ativar agente" |
| Assistente — passo 2, link | "Onde consigo uma chave?" |
| Assistente — passo 3, rótulo | "Modelo da leitura inicial — barato e rápido, só decide se vale convidar" |
| Assistente — passo 4, rótulo | "Modelo do acompanhamento — o que lê a nota e traz as sugestões" |
| Assistente — selo de modelo | "Sugerido" |
| Assistente — opção de modelo fora da lista | "Outro modelo…" |
| Teste de conexão bem-sucedido | "Conexão funcionando." |
| Listagem de modelos falhou (rede) | "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome." |
| Listagem de modelos falhou (chave) | o texto de "Chave inválida" acima, no ato, sem sair do passo |

Erros nunca bloqueiam a escrita: o agente falha em silêncio relativo (estado `erro` no
balão), e o editor segue intocado.

---

## 8. Ícones

Estende a tabela do doc 06 (lucide, traço 1.5):

| Uso | Ícone |
|---|---|
| balão do agente | `bot` |
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
| RF11.1 | Configurar o agente por um assistente em etapas (provedor → chave → modelo da leitura inicial → modelo do acompanhamento → revisão), sem editar arquivo nem digitar nome de modelo no escuro; a busca de modelos valida a chave no ato. | P0 |
| RF11.2 | Com o agente desabilitado ou não configurado, nenhum traço dele aparece na UI e nenhuma chamada de rede é feita. | P0 |
| RF11.3 | Gateiro: analisar a nota ativa uma vez por sessão e convidar o usuário a participar, com o tema detectado. | P0 |
| RF11.4 | Convite com Aceitar / Agora não / Recusar; recusar é definitivo por nota; a decisão persiste entre sessões. | P0 |
| RF11.5 | Assistente: ciclos disparados por inatividade (10 s) + volume de diff (200 chars), nunca por linha digitada. | P0 |
| RF11.6 | Sugestões estruturadas (pergunta, conteúdo, gap, nota relacionada, achado web) no painel, com copiar e dispensar. | P0 |
| RF11.7 | Recuperação local por minisearch + backlinks, com resumos em cache invalidados por mtime+size. | P0 |
| RF11.8 | Medidor de tokens e custo estimado por sessão/dia no painel; teto diário opcional com pausa automática. | P1 |
| RF11.9 | Conversa manual sobre a nota ativa no painel, persistida em `conversas.json` (uma por nota na v1). | P1 |
| RF11.10 | Memória de longo prazo (fatos) proposta pelo assistente, listada e apagável pelo usuário. | P1 |
| RF11.11 | Pasta de memória em `%APPDATA%` por vault, com "Abrir pasta do agente" e "Limpar memória" nas configurações. | P1 |
| RF11.12 | Web search pelo tool nativo do provedor, desligado por padrão, máx. 1 por ciclo. | P2 |
| RF11.13 | Balão com os estados do §6.1, acima do Toaster, só visível com o agente habilitado. | P0 |
| RF11.14 | Pausar/retomar o agente pelo balão. Paleta de comandos: não implementado (§6.4). | P1 |
| RF11.15 | Falha de rede/provedor nunca bloqueia a edição nem perde conteúdo; erro visível só no balão/painel. | P0 |
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
| `src/agente/memoria.ts` | persistência da pasta de memória via plugin-store (§2.2–2.3), dedupe/FIFO de fatos, migração de rename. |
| `src/agente/webSearch.ts` | **não implementado** — arquivo não existe ainda; a ativação do tool nativo por dialeto (§5.4) é a fase 5 (§13), ainda pendente. |
| `src/estado/agenteStore.ts` | estado + ações (§4). |
| `src/ui/excalisidian/BalaoAgente.tsx` | balão e estados (§6.1). |
| `src/ui/excalisidian/PainelAgente.tsx` | painel (§6.2). |
| `src/ui/excalisidian/DialogoAgente.tsx` | assistente de configuração em etapas (§6.3) + a seção "Agente de IA" das Configurações que o abre. |

Montagem: `BalaoAgente` e `PainelAgente` entram no `App.tsx` dentro do `LimiteDeErro` do
shell (como `PainelTarefas`); o `Toaster` ganha `offset` dinâmico quando o balão existe.
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

---

## 13. Fases de entrega

| Fase | Entrega | Pronto quando | Status |
|---|---|---|---|
| 1 | Infra: plugin-http escopado, assistente de configuração (§6.3) com `listarModelos`, `cliente.ts` (3 dialetas), conversa manual no painel, balão mínimo | configurar do zero pelo assistente em < 1 minuto sem digitar nome de modelo; "Perguntar sobre esta nota" responde com tokens contados; chave inválida é recusada no passo 2 com o texto do §7; sem config, zero traço na UI | **feita 13/09/2026** (testada em tela pelo usuário) |
| 2 | Gateiro + convite + participação persistida | convite 1× por nota/sessão; recusar silencia para sempre | **feita 13/09/2026** — falta validar em tela |
| 3 | Pipeline contínuo: gatilhos, diff, recuperação, resumos, orçamento | sugestões aparecem sem estourar teto; medidor bate com o billing; pausar corta tudo | **feita 13/09/2026** — falta validar em tela |
| 4 | Memória de longo prazo (fatos), conversas persistidas, pasta do agente nas configurações | apagar a pasta não quebra nada; fatos entram no contexto | **feita 13/09/2026** — falta validar em tela |
| 5 | Web search pelo tool nativo do provedor (§5.4) | busca pontual no ciclo com `precisaWeb` | pendente — o toggle fica escondido até lá (nenhum dialeto implementa o tool; `achadoWeb` é descartado na interpretação) |

Dependência: fase 3 usa `busca/minisearchIndex.ts` (Fatia 8, pronta desde 12/09/2026).
