# Adequação da documentação aos serviços online — especificação

> **Para quem executa:** este arquivo é a fonte da verdade das decisões. Nenhum agente
> inventa conteúdo além do que está aqui. Onde este arquivo e um documento existente
> discordarem, este arquivo vence. Onde este arquivo for omisso, **pergunte** — não
> preencha.

**Escrito em:** 23/09/2026, pelo planejador, a pedido do usuário: "antes de mexer no código,
adeque a documentação que ficou desatualizada depois que começamos a codar".

**Branch:** `servicos-online`. Os documentos estão limpos na árvore desde `f12171f` (as
alterações pendentes do usuário foram commitadas ali, separadas).

---

## 1. Por que a documentação está desatualizada

Entre 21 e 23/09/2026, três planos de trabalho implementaram no aplicativo a adequação a
serviços online pagos (conta, IA própria, e a base para sincronização). A documentação
normativa foi escrita quando o produto era "para uma pessoa, sem conta, sem servidor", e
ainda afirma isso. O código hoje contradiz os documentos em vários pontos.

A etapa 01 do estudo de viabilidade — "reescrever os documentos normativos antes do código"
— nunca foi executada. Este trabalho é ela, com atraso, e já incorporando o que se aprendeu
implementando.

---

## 2. O que existe no código hoje (branch `servicos-online`)

Descreva o que existe; não descreva o que não existe como se existisse.

### 2.1 Tradução (i18n) — pronto

- `src/i18n/idioma.ts` — tipo `Idioma = "pt-BR" | "en"`, detecção pelo idioma do sistema.
- `src/i18n/tradutor.ts` — resolução chave → idioma pedido → português → a própria chave.
- `src/i18n/catalogo.ts` — porta de entrada única; monta `PT_BR` e `EN` por espalhamento.
- `src/i18n/catalogo/<domínio>.ts` — os textos, por domínio: `vault.ts`, `prefs.ts`,
  `agente.ts`, `conta.ts`.
- `src/i18n/useTexto.ts` — hook para componente React.
- `src/i18n/traduzirAgora.ts` — tradução fora de componente React (transporte, stores).
- `src/i18n/cobertura.test.ts` — trava: toda chave em português tem que ter inglês.
- Preferência de idioma em `prefsStore`, persistida; na primeira abertura detecta o idioma
  do sistema.

**Estado real da tradução:** só estão no catálogo as mensagens de erro de criar vault, o
seletor de idioma, os textos do agente de IA e a seção Conta. **O resto da interface continua
em português fixo no código.** Trocar o idioma hoje quase não muda nada visível — o usuário
testou e constatou. A migração das telas restantes foi **adiada por decisão do usuário**
(22/09), para depois de conta e sincronização.

### 2.2 Serviço online — pronto no cliente, sem servidor

- `src/servico/base.ts` — `BASE_URL_SERVICO = "https://api.excalisidian.app/v1"` e
  `CONTA_DISPONIVEL = true`.
  - **O domínio é placeholder e não está registrado.** Está no binário e na lista de
    permissões de rede do Tauri. Precisa ser registrado antes de o servidor subir.
- `src/servico/sessao.ts` — o token de sessão em memória ("porta-token"). Existe como módulo
  com estado, e não como store, porque `src/agente/cliente.ts` roda fora do React e não pode
  usar hook. A **interface** lê a sessão do `contaStore` (reativo); o **transporte** lê do
  porta-token. A duplicação é deliberada.
- `src/servico/creditos.ts` — interpreta o saldo de créditos que o servidor manda (não conta
  nada localmente). Formatação respeita o idioma corrente.

### 2.3 IA do Excalisidian — pronto no cliente

- Sétimo provedor do catálogo do agente (`src/agente/provedores.ts`), id `excalisidian`,
  dialeto `openai`, `exigeConta: true`, `precisaChave: false`.
- Dois modelos com **identificadores lógicos** (`leitura-rapida`, `acompanhamento`), não nomes
  de modelo de fornecedor — para trocar o modelo real por trás sem atualizar o app. **O nome
  do fornecedor de IA nunca aparece na interface.**
- Autenticação por sessão nos três dialetos (`credencial()` em `cliente.ts`). Sem sessão, a
  chamada para com código de erro próprio `sessao` antes de qualquer rede.
- Assistente de configuração: para o provedor próprio, o passo da chave vira passo de conta
  (sem campo de chave), a listagem de modelos não vai à rede, o campo "Avançado · Base URL"
  some, e o passo de revisão esconde chave e limite de gasto.
- Medidor em créditos no lugar de tokens. **Não renderiza enquanto não houver saldo real** —
  o endpoint de saldo não existe, e exibir zero seria mentir sobre dinheiro.
- "Testar conexão" do provedor próprio verifica a sessão em vez de responder "funcionando"
  sem testar nada.
- Os seis provedores de chave própria continuam **gratuitos e intactos**.
- O agente continua **desligado por padrão**; nenhuma chamada de rede sem aceite do usuário.

### 2.4 Conta — pronto no cliente, com pendências

- `src/conta/` — `tipos.ts`, `ServicoConta.ts` (entrar, criar, renovar, sair),
  `ServicoContaFake.ts` (em memória, para teste), `ServicoContaHttp.ts` (real).
- `src/estado/contaStore.ts` — estado da conta:
  - só o **token** é persistido, em `settings.json` (texto puro — ver decisão D4);
  - carrega na abertura, em `src/app/App.tsx`, sem bloquear a tela;
  - contador de geração impede que um carregamento atrasado sobrescreva um login recente;
  - **só "sessão expirada" apaga o token**; falha de rede ou de servidor preserva — abrir o
    app offline não desloga mais ninguém;
  - avisa as outras janelas (`app://prefs-mudou`), porque o app abre uma janela por vault.
- Seção "Conta" dentro de Configurações. **Em nenhum outro lugar** — sem banner, sem aviso,
  sem convite recorrente.
- E-mail inexistente e senha errada devolvem o **mesmo erro**, para não revelar quem tem conta.

**Pendências conhecidas, não resolvidas** (vão para a Fase B do trabalho):
- As telas ainda não usam o indicador de carregamento da conta: quem já tem conta pode ver
  "entre na sua conta" por alguns segundos na abertura.
- Um 401 do provedor próprio ainda aparece como "chave recusada".
- O passo de conta do assistente não tem botão para entrar — o usuário precisa fechar o
  assistente e ir às Configurações.

> **Nota (23/09, fim da Fase B):** as três pendências acima foram resolvidas — indicador de
> carregamento e botão de entrar no assistente no commit `a417158`, 401 virando falha de
> sessão no commit `a974946`. Este registro histórico não foi reescrito; ver `docs/08-roadmap.md`
> (Fatia 13) e ADR-38 para o estado atual.

### 2.5 Interface — correção feita nesta sessão

- `src/ui/Dialog.tsx` renderiza **por portal em `document.body`**. Motivo: qualquer ancestral
  com `transform` (inclusive `translateX(0)` residual de animação com `both`) vira bloco de
  contenção e confina o `fixed inset-0` do diálogo. Era o que deixava "Criar vault" espremido
  dentro da sidebar.
- A animação da sidebar perdeu o `both` pelo mesmo motivo.

### 2.6 A ser removido

- `src/conta/codigoDeRecuperacao.ts` e seu teste. Ver decisão D3. **Nenhuma tela o usa.**

---

## 3. As decisões

Cada decisão abaixo vira um ADR no `docs/09`. Os números são fixos.

### D1 → ADR-31 · Serviços online são opcionais e nunca atrapalham o uso local

- O núcleo do Excalisidian funciona **inteiro sem internet e sem conta**. Quem nunca criar
  conta não pode notar diferença: nenhuma tela bloqueia, nenhum aviso recorrente, nenhuma
  tela de login na abertura.
- O produto passa a ter serviços pagos opcionais: sincronização de vaults e IA própria.
- Menções aos serviços pagos são permitidas, **mas não invasivas** — palavras do usuário:
  "haverá menções, mensagens, avisos... mas não seremos invasivos". Hoje isso significa: a
  conta vive só em Configurações, e a IA própria aparece como mais uma opção na lista de
  provedores do agente.
- **Nada sai da máquina sem permissão explícita do usuário.** Sync e agente são opt-in.
- **O vault continua sendo o produto.** Cancelar a assinatura não tira nada de ninguém.
- Contexto: a visão original ("não quer sincronização paga, nem conta") foi escrita para a
  prova de conceito técnica. O usuário decidiu pivotar depois de usar o app e ver que o
  produto se sustenta.

### D2 → ADR-32 · Sincronização cifrada ponta a ponta; conflito vira tela, nunca merge

- O servidor **não consegue ler nada**: nem conteúdo das notas, nem nome dos arquivos, nem
  quantidade de notas. Recebe pacotes cifrados e um manifesto de versões.
- Conflito (mesma nota editada em dois computadores): o app **nunca junta as versões
  sozinho**. Mostra as duas lado a lado, com três saídas: ficar com esta, ficar com aquela,
  manter as duas. Até o usuário decidir, nada é apagado.
- Desenho não se compara como texto: duas versões de um `.draw.md` aparecem como duas telas,
  lado a lado.
- Estado: **a sincronização não existe.** O plano 04 cobre só a tela de conflitos, que opera
  sobre "duas versões do mesmo arquivo" sem depender de servidor.

### D3 → ADR-33 · Senha do vault escolhida pelo usuário, sem código de recuperação

Esta é a decisão mais delicada e precisa ser escrita com todo o cuidado.

- **Consequência central, que tem de estar na primeira frase do ADR:** como o servidor não lê
  nada (D2), **não existe "esqueci minha senha"**. Esquecer a senha do vault faz as cópias
  sincronizadas virarem lixo permanente. Ninguém consegue recuperar — nem o usuário, nem a
  empresa, nem o servidor.
- **O que NÃO se perde:** os arquivos no computador do usuário continuam lá, em Markdown,
  legíveis. Perde-se as cópias no servidor e o acesso a partir de outros computadores.
- A senha que cifra o vault é **escolhida pelo usuário**.
- **Não há código nem frase de recuperação.** Motivos:
  1. O código não é medida de segurança; é medida contra esquecimento. A segurança vem da
     senha e da derivação lenta. Uma segunda cópia da chave, em papel, só **reduz** a
     segurança (pode ser fotografada, perdida, roubada).
  2. Neste produto o desastre de esquecer é menor que num gerenciador de senhas ou num e-mail
     cifrado: as notas locais continuam intactas.
  3. O código acrescenta atrito na criação da conta (derruba conversão) e um segundo segredo
     que muita gente guarda mal.
  4. O usuário achou o código "muito sensível" e não sabia que ele existia.
- **Derivação lenta de chave** (Argon2id ou equivalente) é obrigatória: torna cada tentativa
  de adivinhar a senha cara de propósito. Necessária porque quem obtiver os pacotes cifrados
  ataca **offline**, sem limite de tentativas.
- **Chave envelopada desde o primeiro dia:** o vault é cifrado com uma chave aleatória, e
  essa chave é que é cifrada pela senha. Isso permite, no futuro, acrescentar uma forma de
  recuperação — guardando uma segunda cópia da mesma chave, cifrada de outro jeito — **sem
  reprocessar nada e sem afetar quem já usa**. É a única parte desta decisão que tem prazo:
  tem que estar no desenho antes de o primeiro usuário sincronizar.
- **Quando a senha é pedida:** uma vez por computador, ao conectá-lo à sincronização. A chave
  derivada fica no cofre do sistema operacional. **Nunca na abertura do app.**
- **A tela de criação de conta** diz, sem eufemismo, que a senha não pode ser recuperada, e
  que as notas locais continuam a salvo. Recomenda guardar a senha no gerenciador de senhas
  do navegador ou do sistema.
- Alternativas rejeitadas (entram na tabela do ADR):
  - Código gerado de 24 caracteres (implementado em 21/09 e removido): impossível de
    memorizar, fácil de errar ao copiar, sensível demais, e o usuário não sabia que existia.
  - Frase de palavras aleatórias como reserva: melhor que o código, mas mantém os problemas
    2 e 3 acima.
  - Senha humana sem derivação lenta: uma senha humana de 16 caracteres vale na prática 30 a
    45 bits de aleatoriedade, contra ataque offline ilimitado.
- Explicação longa para o usuário: `docs/16-codigo-de-recuperacao.md`.

### D4 → ADR-34 · Token de sessão no cofre do sistema operacional

- **Decisão do usuário (22/09):** o token da conta vai para o cofre do sistema operacional
  (keyring do Windows), não fica em texto puro no `settings.json`.
- **Estado real: NÃO está implementado.** Hoje o token está em `settings.json`, em texto
  puro, como o plano 03 implementou. A migração é trabalho da Fase B e ainda não tem plano.
- Inconsistência declarada e aceita pelo usuário: as chaves de API dos seis provedores de
  chave própria **continuam em texto puro no `settings.json`**. O usuário foi avisado e
  escolheu assim mesmo.

### D5 → ADR-35 · IA do Excalisidian é o sétimo provedor do agente

- Entra no catálogo do doc 11 como mais um provedor, sem dialeto novo nem caminho de rede
  novo — o servidor fala o dialeto da OpenAI.
- Autentica por sessão da conta, não por chave digitada.
- Identificadores lógicos de modelo; o nome do fornecedor nunca na interface.
- Cota mensal em **créditos**, contada **no servidor**. O cliente só interpreta o saldo.
- O modo com chave própria (seis provedores) continua **gratuito e intacto**. Vende-se
  conveniência, não exclusividade.
- O agente continua desligado por padrão.
- `CONTA_DISPONIVEL` é a chave única que liga o provedor próprio na interface; ficou `false`
  enquanto não havia tela de conta (o cartão era um beco sem saída) e virou `true` no plano 03.

### D6 → ADR-36 · Tradução por catálogo de domínios, português como fonte

- Todo texto de interface sai do catálogo — nunca literal no JSX.
- Português do Brasil é a fonte da verdade e define as chaves; inglês é a tradução.
- Toda chave em português tem que ter inglês — trava por teste.
- Dentro de componente, `useTexto()`; fora (transporte, stores), `traduzirAgora()`.
- Estado duradouro guarda a **chave** e traduz no render, não o texto já traduzido.
- Tela que traduz no primeiro render aguarda o carregamento das preferências.
- Números e datas formatados no idioma corrente.
- A migração das telas que ainda estão em português fixo foi adiada pelo usuário.

### D7 → ADR-37 · Diálogo sempre por portal

- `Dialog` renderiza por portal em `document.body`. Motivo técnico no item 2.5 acima.
- Animação com modo de preenchimento `both` é proibida em elemento que possa ter descendente
  `position: fixed`.
- O comentário de topo de `RaizDialogos.tsx` diz "nada além dele renderiza `Dialog`
  diretamente", mas cinco componentes renderizam. Com o portal, a regra deixa de ser
  necessária para corrigir posicionamento; registre a divergência sem prometer corrigi-la.

---

## 4. Incertezas e perguntas em aberto

Entram no `docs/09`: as incertezas na **Parte 3** ("O que NÃO foi confirmado") e a pergunta
na **Parte 4** ("Perguntas que ficaram para você decidir"). Siga o formato que já existe lá.

### Incertezas (Parte 3)

1. **Domínio placeholder.** `api.excalisidian.app` não está registrado e já está no binário e
   na lista de permissões de rede. Nenhum token real pode existir antes de registrá-lo.
2. **Plano da assinatura preso até reiniciar.** O plano só é lido na abertura do app. Quem
   assinar pelo site continua vendo "Plano grátis" até fechar e reabrir. Resolver exige um
   endpoint que não existe; usar `renovar` para isso rotacionaria o token a cada verificação.
3. **Sem renovação automática de sessão.** Um token que expira durante o uso não é renovado;
   o usuário precisa entrar de novo.
4. **Fornecedor de IA e GDPR.** O modelo previsto no estudo de viabilidade é de um
   fornecedor chinês. Mandar notas de usuário europeu para lá é transferência internacional
   de dados sob GDPR. Verificar hospedagem ocidental do mesmo modelo antes de anunciar preço.
5. **Endpoint de saldo de créditos não existe.** O medidor não renderiza até existir.

### Pergunta para o usuário (Parte 4)

**Uma senha só para conta e vault, ou duas?** Ninguém decidiu ainda.

- **Uma senha só** (modelo do Bitwarden e do 1Password): o usuário decora uma coisa. Mas a
  senha **nunca pode ir para o servidor como está** — o app deriva dela duas chaves
  diferentes, uma que prova a identidade ao servidor e outra que cifra o vault e nunca sai do
  computador. Consequência: esquecer a senha perde a conta **e** as cópias sincronizadas.
- **Duas senhas:** a da conta funciona como qualquer serviço (dá para redefinir por e-mail);
  a do vault é separada e não tem recuperação. Mais atrito, mas quem esquece a senha da conta
  não perde nada.
- **Fato técnico que tem de constar:** o código de hoje (`ServicoContaHttp.entrar`) envia a
  senha da conta para o servidor como ela é digitada, protegida só pela conexão cifrada. Isso
  é normal para uma senha de conta comum. **Se a decisão for "uma senha só", isso tem que
  mudar antes de a sincronização existir**, senão o servidor passa a poder derivar a chave do
  vault e a promessa de D2 se quebra.

---

## 5. O que muda em cada documento

### 5.1 `docs/16-codigo-de-recuperacao.md`

- O cabeçalho diz "Nada aqui está decidido". Passa a dizer que a decisão foi tomada em
  23/09/2026 e aponta para o ADR-33.
- Acrescentar ao fim uma seção **"9. A decisão (23/09/2026)"** resumindo D3 em linguagem de
  produto, sem jargão, e dizendo que o módulo de 24 caracteres será removido.
- **Não apagar as seções anteriores.** Elas são o registro de como se chegou à decisão.
  Acrescente, no topo das seções 5 e 8.4, uma linha curta dizendo que foram superadas pela
  seção 9.

### 5.2 `docs/09-decisoes-e-incertezas.md`

- ADR-31 a ADR-37 ao fim do arquivo, depois do ADR-30, no formato que o arquivo já usa:
  `### ADR-N · Título`, **Contexto**, **Decisão**, **Alternativas rejeitadas** (tabela),
  **Consequências**.
- As cinco incertezas na Parte 3; a pergunta na Parte 4.

### 5.3 `docs/01-visao-de-produto.md`

Três trechos contradizem o produto atual. Reescreva cada um; não apague a intenção original.

- Linha ~19, em "Para quem": *"não quer plugin, marketplace, sincronização paga, nem conta"*.
- Linha ~22: *"Não é um produto multiusuário, não tem colaboração em tempo real, não tem
  servidor"*.
- Linha ~72, em "O que não é": *"Não tem sincronização, conta, nuvem ou colaboração"*.

O novo texto diz que o núcleo funciona inteiro sem conta e sem internet, que os serviços
pagos são opcionais e nunca atrapalham o uso local, e que continua não havendo colaboração em
tempo real nem multiusuário. Aponte para o ADR-31. **Os cinco princípios do documento ficam
intactos** — nenhum deles é contrariado pelos serviços online.

### 5.4 `docs/11-agente-ia.md`

- Linhas ~29-31, princípio "Desligado por padrão": *"O produto nunca pede, sugere ou anuncia
  a integração"* — mantém "desligado por padrão" e "nada sai sem participação explícita";
  troca "nunca anuncia" por menção não invasiva, nos termos de D1.
- Linha ~45: *"Sem OAuth de assinatura — só API key"* — continua sem OAuth de assinatura de
  terceiros; acrescenta que existe um provedor autenticado pela conta do Excalisidian.
- Linhas ~219 e ~234: "os seis hosts", "os seis provedores" — agora são sete.
- Linha ~413: "o produto nunca anuncia o agente" — mesmo ajuste do primeiro item.
- Acrescentar uma seção sobre o provedor próprio com o conteúdo de 2.3 e D5.

### 5.5 `docs/05-arquitetura-e-stack.md`

- Acrescentar as pastas novas à descrição da estrutura: `src/i18n/` (com `catalogo/` por
  domínio), `src/servico/`, `src/conta/`.
- Registrar a separação store × porta-token (2.2).
- Registrar a regra do diálogo por portal (D7).
- A seção 10 (testes mínimos) não muda.

### 5.6 `docs/08-roadmap.md`

Acrescentar, depois da Fatia 10, as fatias do trabalho de serviços online, **com o estado
real de cada uma**, sem arredondar para cima:

- **Fatia 11 — Tradução:** fundação pronta; migração das telas adiada pelo usuário.
- **Fatia 12 — IA do Excalisidian:** pronta no cliente; depende do servidor.
- **Fatia 13 — Conta:** pronta no cliente, com as pendências de 2.4; depende do servidor.
- **Fatia 14 — Token no cofre do sistema:** decidida (D4), não começada.
- **Fatia 15 — Sincronização:** não começada. A tela de conflitos (plano 04) é a primeira
  parte e não depende de servidor.

### 5.7 `CLAUDE.md`

Acrescentar à seção "Regras do projeto", sem remover nenhuma existente:

- Todo texto de interface sai do catálogo (`src/i18n/catalogo/`), por `useTexto()` dentro de
  componente e `traduzirAgora()` fora. Nunca literal no JSX. Toda chave nova precisa de
  português e inglês.
- `Dialog` renderiza por portal; não usar animação com preenchimento `both` em elemento que
  possa ter descendente `position: fixed`.
- A árvore costuma ter trabalho não commitado do usuário. Commit sempre por caminho
  explícito, conferindo o diff antes; nunca `git add -A` nem `git add .`.

A regra existente *"Interface em português do Brasil, sentence case, sem emoji"* passa a
dizer que o português é o idioma-fonte e que sentence case e sem emoji valem para os dois
idiomas.

### 5.8 Planos em `docs/superpowers/plans/`

- `2026-09-21-03-conta-e-sessao.md`, Task 4 (código de recuperação): acrescentar no topo da
  tarefa uma nota de que ela foi **superada em 23/09/2026** — o módulo será removido, ver
  ADR-33 e `docs/16`. Não apagar a tarefa.
- `2026-09-21-04-conflitos-de-sync.md`, seção "Fora deste plano": troque "derivação de chave
  a partir do código de recuperação" por "derivação de chave a partir da senha do vault, com
  chave envelopada (ADR-33)".
- `2026-09-21-servicos-online-indice.md`: remova ou corrija qualquer menção ao código de
  recuperação.

---

## 6. Regras de redação

- Português do Brasil, sentence case nos títulos, sem emoji.
- **Escreva para quem não é técnico onde o documento é de produto** (01, 16, e as partes de
  consequência dos ADRs). O dono do produto não é desenvolvedor.
- Estado real, nunca arredondado: "pronto no cliente, depende do servidor" não é "pronto".
- Não prometa o que não existe. Se algo é decisão ainda não implementada, diga isso.
- Siga o formato e o tom de cada documento existente. Leia a seção vizinha antes de escrever.
