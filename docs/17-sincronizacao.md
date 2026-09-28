# 17 — Sincronização

**Normativo** para a Fatia 15. Decisões de produto: ADR-32 (servidor não lê nada; conflito
vira tela), ADR-33 (sem recuperação), ADR-39 (uma senha só). Decisões técnicas deste documento:
ADR-40. Onde este documento e o código divergirem, o código está errado.

Escrito para duas leituras: a seção 1 é para o dono do produto; o resto é para quem constrói.

---

## 1. Como funciona, em linguagem simples

- **Nada sai do computador sem você pedir.** A sincronização é ligada vault por vault, em
  Configurações. Um vault que você não ligou nunca é enviado.
- **O servidor guarda um diário lacrado.** Cada vez que você muda notas, o app junta as
  mudanças num pacote, tranca com a chave do vault e manda. O servidor só vê pacotes
  trancados, numerados, de tamanhos arredondados. Não vê nomes, nem conteúdo, nem quantas
  notas você tem.
- **Os outros computadores leem o diário.** Cada computador baixa os pacotes novos, destranca
  e aplica as mudanças no vault dele.
- **Se a mesma nota mudou nos dois lados, você decide.** Aparece a faixa de conflito que já
  existe. Nada é apagado até você escolher.
- **Apagar nunca vence editar.** Se um computador apagou uma nota e o outro editou, a nota
  editada volta. Você perde no máximo um apagamento, nunca um texto.
- **A senha é pedida uma vez por computador**, quando você liga a sincronização nele. Depois
  fica guardada no cofre de senhas do Windows.
- **Parar de sincronizar não apaga nada do seu computador.** Apagar a cópia do servidor é um
  botão separado, com confirmação.

---

## 2. Chaves

```
senha ──(Argon2id, plano 06)──► chaveMestra ──HKDF──► provaDeIdentidade  (vai ao servidor)
                                             └─HKDF──► chaveDeEnvelope   (nunca sai do PC)

chaveDoVault = 32 bytes aleatórios, uma por vault sincronizado
envelope     = AES-256-GCM(chaveDeEnvelope, chaveDoVault)   → guardado no servidor
```

- **`chaveDeEnvelope`** (plano 06, `derivarDaSenha`) fica no cofre do Windows, numa entrada
  própria (`chave-de-envelope`), depois que o usuário digita a senha naquele computador. Uma
  por conta, serve para todos os vaults.
- **`chaveDoVault`** é gerada no computador que liga a sincronização pela primeira vez
  (`crypto.getRandomValues`). O servidor guarda só o **envelope**. Outro computador baixa o
  envelope e abre com a `chaveDeEnvelope` dele. Trocar a senha troca só os envelopes, nunca
  recifra pacotes (ADR-39, consequência 3).
- **Cifra:** AES-256-GCM pela WebCrypto (`crypto.subtle`), nativa no WebView2 e no node dos
  testes — nenhuma dependência nova. Nonce de 96 bits aleatório por operação. Com chave por
  vault e pacotes de até 8 MiB, o limite seguro de nonces aleatórios (2³²) fica muito longe.
- **Dados associados (AAD)** amarram cada pacote ao seu lugar: `idDoVault`, tipo do pacote e,
  para lotes, o número de sequência. Um pacote copiado para outro vault ou outra posição não
  abre.

---

## 3. O que o servidor vê

| Vê | Não vê |
|---|---|
| O e-mail da conta e o plano | Nome de arquivo, pasta, conteúdo |
| Quantos vaults sincronizados a conta tem | Nome do vault (vai cifrado) |
| Quantos pacotes cada vault tem, o tamanho arredondado de cada um e quando chegaram | Quantas notas existem, quais mudaram, quantas mudaram por pacote |
| Quantos computadores enviam (pelo token de sessão) | A senha, a `chaveDeEnvelope`, a `chaveDoVault` |

O tamanho arredondado e o ritmo dos envios contam ao servidor, **aproximadamente, quanto você
escreve e quando**. Isso é inerente a qualquer sincronização e está declarado no ADR-40 como
limite honesto da promessa.

---

## 4. O diário

Por vault, o servidor mantém uma sequência de **pacotes opacos**, numerados por ele:

- **Lote** — um conjunto de mudanças enviado por um computador.
- **Retrato** — o estado inteiro do vault num ponto do diário. Serve para um computador novo
  não precisar baixar o histórico todo, e para o servidor poder descartar lotes antigos.

### 4.1 Conteúdo de um lote (antes de cifrar)

```ts
interface Lote {
  versao: 1;
  dispositivo: string;        // nome legível ("Notebook do Lucas"), só para a tela de conflito
  criadoEm: string;           // ISO 8601
  mudancas: Mudanca[];
}

type Mudanca =
  | { tipo: "gravar"; caminho: string; base: string | null; hash: string; conteudo: Uint8Array }
  | { tipo: "apagar"; caminho: string; base: string };
```

- `caminho` com `/` e NFC (regra do projeto). `hash` = SHA-256 do conteúdo em hex.
- `base` = hash da versão sobre a qual a mudança foi feita (o último estado sincronizado
  daquele arquivo naquele computador); `null` para arquivo novo.
- Renomear e mover chegam como `apagar` + `gravar`. Simples e sempre correto; o custo é
  reenviar o conteúdo.
- Serialização: JSON com `conteudo` em base64, comprimido com `CompressionStream("gzip")`.

### 4.2 Conteúdo de um retrato

```ts
interface Retrato {
  versao: 1;
  ateSequencia: number;       // último lote incorporado
  arquivos: { caminho: string; hash: string; conteudo: Uint8Array }[];
}
```

Retrato grande é dividido em partes de até 8 MiB, cada parte cifrada à parte, com o índice da
parte no AAD.

### 4.3 Envelope de cada pacote (o que vai ao servidor)

```
bytes = nonce(12) ‖ AES-GCM(chaveDoVault, preenchido(gzip(json)), aad)
preenchido(x) = x ‖ 0x80 ‖ 0x00… até o próximo tamanho da escada
escada = 16 KiB, 32 KiB, 64 KiB, … 8 MiB
```

O preenchimento esconde o tamanho exato. Um lote que passaria de 8 MiB (por exemplo, muitas
imagens) é dividido em vários lotes.

### 4.4 O que entra e o que não entra

- Entra: todo arquivo do vault fora de pastas que começam com ponto.
- Não entra: pastas que começam com ponto — a lixeira (`.trash/`, ver abaixo) e a pasta de
  configuração do vault (`.excalisidian/`, cujo `vault.json` ainda não existe — doc 02 §1;
  quando existir, este documento decide se ele sincroniza). É a mesma regra da listagem do
  vault (RF1.6: `listar()` não enxerga pastas ponto). Também não entram os temporários de gravação
  (`*.excalisidian-tmp`), e qualquer arquivo acima de 7 MiB (fica só local; a tela de
  sincronização lista quais). O limite vem do tamanho máximo de um pacote (8 MiB, com folga
  para o formato): nesta primeira versão um arquivo não é dividido entre pacotes. Notas e
  desenhos ficam muito abaixo disso; o limite só pega imagens e PDFs grandes.
- **Cada computador tem a própria lixeira.** Quando uma exclusão chega de outro computador, o
  arquivo vai para a lixeira **deste** computador, recuperável aqui como qualquer exclusão.
  Se a lixeira sincronizasse, apagar uma nota geraria duas mudanças (sumiu do lugar, apareceu
  na lixeira) que se cruzariam no outro lado.
- O estado da sincronização daquele computador fica **fora do vault**, em `%APPDATA%`
  (ADR-6): senão ele mesmo seria sincronizado.

---

## 5. O ciclo

Cada computador guarda, por vault, fora do vault:

```ts
interface EstadoSync {
  idDoVault: string;          // id no servidor
  cursor: number;             // última sequência aplicada
  bases: Record<string, string>; // caminho → hash do último estado sincronizado
  /** caminho → { mtimeMs, size, hash } da última vez que o arquivo foi lido para hash.
   * Um arquivo só é relido quando mtime ou tamanho mudam — sem isso, cada ciclo leria o
   * vault inteiro. */
  hashesConhecidos: Record<string, { mtimeMs: number; size: number; hash: string }>;
  /** Conflitos que chegaram e ainda não foram resolvidos, com a versão remota inteira.
   * Persistidos porque a fila da tela vive em memória: se o app fechar com um conflito
   * aberto, ele é registrado de novo ao abrir o vault. Sem isso, o próximo ciclo veria a
   * versão local como "editada aqui" e a enviaria por cima da remota, que se perderia. */
  conflitosPendentes: Record<string, { hashRemoto: string; conteudo: string; dispositivo: string; criadoEm: string }>;
}
```

Enquanto um caminho está em `conflitosPendentes`, ele fica fora do passo 2. Quando o usuário
resolve, `bases[caminho]` passa a ser o `hashRemoto` e o pendente sai: a versão escolhida é,
a partir daí, uma edição local comum sobre a remota.

**Quando roda:** ao abrir o vault, alguns segundos depois de cada lote de eventos do watcher, a
cada 60 s com o app aberto, e no botão "Sincronizar agora". Um ciclo por vez.

**Um ciclo:**

1. **Baixar.** Pede os pacotes depois do `cursor`. Abre cada um e aplica as mudanças em ordem
   (seção 6). Avança o `cursor`.
2. **Descobrir o que mudou aqui.** Compara o vault com `bases`: hash diferente = `gravar`;
   arquivo que está em `bases` e sumiu = `apagar`; arquivo novo = `gravar` com `base: null`.
   Arquivos com conflito aberto ficam de fora até o usuário resolver.
3. **Enviar.** Monta um lote e envia dizendo "espero que o último seja o `cursor`". Se outro
   computador enviou antes (o servidor recusa), volta ao passo 1 e tenta de novo.
4. **Guardar.** Atualiza `bases` e `cursor`.

Antes do passo 2, as abas com edição pendente são gravadas (flush), para o ciclo ver o que
está na tela.

---

## 6. Aplicar uma mudança que veio de fora

Seja `local` o hash atual do arquivo no disco (ou ausente) e `base` o hash em `bases`.

| Chegou | Situação local | Resultado |
|---|---|---|
| `gravar` | `local == base` (não mexi) ou arquivo não existe aqui | grava o remoto; `bases = hash` |
| `gravar` | `local == hash` (já igual) | só `bases = hash` |
| `gravar` | mexi (`local != base`) | **conflito**: registra na `conflitosStore` com local = disco, remoto = o que chegou. Nada é gravado até o usuário decidir. |
| `apagar` | `local == base` | move para a lixeira deste computador (doc 02 §7, recuperável aqui) |
| `apagar` | mexi | **não apaga**: a versão local será enviada de novo no passo 3 |
| `gravar` de arquivo que apaguei aqui | — | recria o arquivo com a versão remota (apagar nunca vence editar) |

- **Arquivo binário** (imagem, PDF) em conflito não tem comparador: vira "manter as duas"
  automático, com o nome de conflito do ADR-15.
- **Toda escrita** passa pelo `VaultAdapter` e depois recarrega a árvore, reindexa o arquivo e,
  se ele estiver aberto numa aba, cancela o autosave pendente antes de gravar e recarrega a aba
  depois — a mesma regra que a resolução de conflito já segue (ADR-32, achado de 23/09). O
  watcher ignora o eco da própria gravação (doc 02 §10), então ninguém mais vai fazer isso.
- **Depois que o usuário resolve um conflito**, a versão escolhida é uma mudança local comum e
  sobe no próximo ciclo, com `base` = o hash remoto que causou o conflito.

---

## 7. Ligar, baixar, apagar

As ações abaixo são as ações da lista "Seus vaults" (§8), uma por estado do vault na lista —
não existe mais uma tela separada de "escolher um vault para sincronizar". Decisão do dono do
produto (29/09/2026, teste da lista): "o usuário só precisa acessar os seus vaults: se já tem
sincronizado no PC, aparece que está sincronizado. Ele pode apagar o vault e forçar a
sincronização. Se não tem no PC, pode baixar, definir onde vai ficar, e pronto." Não existem mais
as ações "Abrir", "Parar neste computador" nem "Esquecer neste computador".

- **Ligar (ação "Sincronizar", vault só neste computador):** exige conta premium. Se este
  computador ainda não tem a `chaveDeEnvelope`, pede a senha da conta (a mesma de entrar),
  confere com o servidor (entrar de novo com a prova) e guarda no cofre. Gera a `chaveDoVault`,
  cria o vault no servidor com o nome cifrado e o envelope, e envia o conteúdo atual como os
  primeiros lotes do diário (um retrato em zero seria recusado pela regra do §9 e não teria
  utilidade: o diário ainda está vazio).
- **Baixar (ação "Baixar…", vault na nuvem):** o diálogo nativo do sistema escolhe a **pasta
  onde colocar** o vault. O app cria, dentro da pasta escolhida, uma pasta nova com o nome do
  vault (numerada, `Nome (2)`, `Nome (3)`…, se já existir uma pasta com esse nome — padrão
  ADR-15; nunca mistura com uma pasta existente), baixa o retrato mais recente e os lotes
  seguintes, e abre o vault numa janela.
- **Pasta sumida (vault sincronizado cuja pasta foi apagada ou movida):** não é mais um estado
  próprio da lista nem uma ação manual — ao montar a lista, o `EstadoSync` deste computador para
  aquele vault é esquecido sozinho (`esquecer(caminho)`), sem aviso, e o vault volta a aparecer
  como "Na nuvem" (se ainda estiver lá).
- **Envelope que não abre com a chave desta conta:** hoje a `chaveDeEnvelope` pertence à CONTA
  (§2), não a um vault — um envelope que não abre significa "este vault foi criado com a senha
  de outra conta", nunca "a chave está errada". Por isso a chave NUNCA é apagada do cofre por
  causa disto (nem em `ligarAoVault.ts`, nem no segundo plano, §8.1): o vault fica marcado com
  `ultimoErro: "outra-senha"` no seu próprio `EstadoSync` (se local) e a lista mostra o aviso
  (§8) com só a ação Apagar.
- **Apagar (ação "Apagar", qualquer vault sincronizado ou na nuvem):** remove só a cópia da
  nuvem — os arquivos continuam intactos em todos os computadores. Diálogo de confirmação:
  "Apagar «{vault}» da nuvem? Os arquivos continuam em todos os computadores; só a cópia da
  nuvem e a sincronização são removidas." `nao-encontrado` do servidor conta como sucesso (a
  cópia já não estava lá). Depois de apagar, o vínculo local (se houver) é esquecido, e o
  `syncStore` desta janela para se era o vault aberto nela.
- **Nome do computador:** Configurações → Sincronização, editável. Padrão: o nome de usuário
  do Windows seguido de "(este computador)" até alguém mudar. Aparece na tela de conflito
  ("Em Notebook do Lucas").

---

## 8. A lista "Seus vaults"

Sem banner, sem aviso recorrente (ADR-31). Um ícone discreto no rodapé da barra lateral, ao
lado das Configurações, com texto no `title`, leva à seção Sincronização das Configurações, que
mostra a lista "Seus vaults": cada vault do usuário, uma única vez, juntando três fontes —
vaults recentes deste computador (caminho), estados de sincronização deste computador
(`EstadoSync` por caminho → id no servidor) e vaults da conta no servidor (nome decifrado).

A lista tem três estados possíveis, um por vault (decisão do dono do produto, 29/09/2026):

| Estado | Mostra | Ações |
|---|---|---|
| Sincronizado | nome, caminho, "Sincronizado há X min" / "Sincronizando…" / o erro do status; "N conflitos — abra o vault para resolver" se houver | Sincronizar agora · Apagar |
| Só neste computador | nome, caminho | Sincronizar |
| Na nuvem | nome | Baixar… |

Um vault que não abre com a chave desta conta (criado com a senha de outra conta, §7) não tem
estado próprio: aparece dentro de "Sincronizado" (local, `EstadoSync.ultimoErro === "outra-senha"`)
ou "Na nuvem" (nome que não decifrou), com o texto "Este vault foi criado com outra senha e não
abre com esta conta." no lugar do status normal, e só a ação Apagar — nenhuma outra ação da
lista funciona sem abrir o envelope.

O rodapé da lista diz: "Os vaults sincronizados atualizam sozinhos enquanto o app está aberto."

Erros que pedem ação (plano venceu, espaço do plano acabou, sessão expirou) aparecem no lugar
do "Sincronizado há X min" daquele vault, e também no `title` do ícone do rodapé, com o texto
do catálogo. Os textos entram no catálogo `src/i18n/catalogo/sync.ts`, pt-BR e inglês, sem os
termos técnicos deste documento (nada de "envelope", "hash" ou "retrato" na tela).

### 8.1 Sincronização em segundo plano

Hoje só o vault aberto numa janela sincroniza. A partir desta versão, todo vault sincronizado
deste computador sincroniza sozinho enquanto o app está aberto, mesmo fechado (sem janela
mostrando ele):

- **Vault aberto numa janela:** sincroniza como hoje, pela janela dele (efeitos na tela, fila
  de conflitos).
- **Vault sincronizado e fechado:** sincroniza em segundo plano, a cada 60 s e ao abrir o app,
  por **uma única janela designada** (a primeira janela aberta). Em segundo plano:
  - os efeitos de tela são nulos — não há árvore nem aba desse vault nesta janela para
    atualizar;
  - um conflito não entra na fila da tela — fica só em `conflitosPendentes` (persistido, §5) e
    aparece na lista como "N conflitos — abra o vault para resolver"; ao abrir o vault, a
    janela dele registra os pendentes de novo (já é assim hoje);
  - o escopo de arquivo do vault é concedido pelo mesmo comando que já concede ao abrir
    (`permitir_vault`).
- **Nunca dois ciclos no mesmo vault ao mesmo tempo.** Antes de cada ciclo em segundo plano, a
  janela designada confere, no registro de janelas do Rust (doc 12 §2), se o vault está aberto
  em alguma janela; se estiver, pula — a janela dele sincroniza sozinha. Um vault que acabou de
  abrir numa janela espera o ciclo em segundo plano terminar antes de começar o seu, por uma
  trava por vault (em memória do processo Rust).
- Um vault cuja pasta não existe mais (apagada ou movida pelo Explorer) não é sincronizado em
  segundo plano, e o segundo plano nunca recria a pasta nem baixa o vault num lugar inesperado —
  ao montar a lista "Seus vaults" (§8), o vínculo local é esquecido sozinho e o vault volta a
  aparecer como "Na nuvem".
- Um vault cujo envelope não abre com a chave desta conta (§7, "criado com outra senha") é
  pulado, sem sincronizar: o ciclo grava `ultimoErro: "outra-senha"` no `EstadoSync` do vault e
  a chave no cofre não é tocada.
- Com o app fechado, nada sincroniza — é um programa de computador, não um serviço rodando
  sozinho; isso está dito na lista.

---

## 9. Servidor (contrato)

A fronteira é a interface `ServicoSync`, com uma implementação falsa em memória (a dos testes
e do desenvolvimento) e uma HTTP (quando o servidor existir) — o mesmo padrão de
`ServicoConta`. Autenticação pelo token de sessão.

```ts
interface ServicoSync {
  listarVaults(): Promise<{ id: string; nomeCifrado: Uint8Array; envelope: Uint8Array }[]>;
  /** O id é gerado pelo cliente (UUID v4): o envelope e o nome cifrado usam o id no AAD,
   * então ele precisa existir antes de o vault ser criado. FalhaSync("ja-existe") se repetir. */
  criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void>;
  baixar(id: string, aposSequencia: number): Promise<
    { retrato?: { ateSequencia: number; partes: Uint8Array[] }; lotes: { sequencia: number; bytes: Uint8Array }[] }
  >;
  enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number>; // nova sequência; FalhaSync("fora-de-ordem") se esperoUltima não for a última
  enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void>;
  apagarVault(id: string): Promise<void>;
}
```

`baixar` sempre devolve também `ultimoRetrato` — a `ateSequencia` do retrato atual do vault,
ou 0 se não houver — mesmo quando não manda o retrato (o cliente já está na frente dele). Sem
isso o cliente não sabe há quantos lotes foi o último retrato.

**Quando mandar retrato:** depois de um ciclo que enviou com sucesso, se `cursor − ultimoRetrato
≥ 200`, **e** se o estado local estiver inteiramente sincronizado: nenhum conflito pendente, e
todo arquivo sincronizável com hash no disco igual ao de `bases`, com o mesmo conjunto de
caminhos. O retrato representa o diário na sequência `cursor`; se o disco tiver qualquer coisa
que o diário ainda não tem (edição não enviada, versão local de um conflito aberto), o retrato
mentiria para um computador novo — nesse caso não manda agora e tenta num ciclo seguinte.

O servidor pode descartar lotes cobertos por um retrato. Ele **recusa** (`fora-de-ordem`, sem
mudar nada) um retrato cujo `ateSequencia` não seja maior que o do retrato atual, ou que passe
da última sequência do diário: se um retrato mais antigo substituísse um mais novo, os lotes
entre os dois — já descartados — nunca mais chegariam a um computador novo. Um computador que manda um retrato
faz isso nas condições descritas acima (200 lotes desde o último retrato, estado local
sincronizado). O critério de tamanho (50 MiB) foi retirado: o cliente não tem como medir bytes
do diário desde o retrato, e medir o vault inteiro faria vaults grandes mandarem retrato em todo
ciclo.

### 9.1 Mapeamento HTTP

Quando o servidor existir, `ServicoSyncHttp` (plano de sincronização na tela, Task 3) fala com
ele assim — mesmo padrão de `ServicoContaHttp`. Todo campo de bytes (`nomeCifrado`, `envelope`,
`bytes`, `partes`) vai em base64 dentro do JSON. Autenticação: cabeçalho `Authorization: Bearer
<token de sessão>`, o mesmo token do `ServicoConta`.

| Método de `ServicoSync` | HTTP |
|---|---|
| `listarVaults()` | `GET /sync/vaults` → `{ id, nomeCifrado, envelope }[]` |
| `criarVault(id, nomeCifrado, envelope)` | `POST /sync/vaults` com `{ "id": id, "nomeCifrado": base64, "envelope": base64 }` — `id` é gerado **pelo cliente** (UUID v4) e vai no corpo, nunca na URL: o AAD do envelope já usa esse id, então ele tem que existir antes da chamada |
| `baixar(id, aposSequencia)` | `GET /sync/vaults/{id}/pacotes?apos={aposSequencia}` → `{ "retrato"?: { "ateSequencia": number, "partes": base64[] }, "lotes": { "sequencia": number, "bytes": base64 }[], "ultimoRetrato": number }` — `ultimoRetrato` vem **sempre** no corpo, mesmo quando `retrato` está ausente |
| `enviarLote(id, esperoUltima, bytes)` | `POST /sync/vaults/{id}/lotes` com `{ "esperoUltima": esperoUltima, "bytes": base64 }` → `{ "sequencia": number }` |
| `enviarRetrato(id, ateSequencia, partes)` | `POST /sync/vaults/{id}/retratos` com `{ "ateSequencia": ateSequencia, "partes": base64[] }` |
| `apagarVault(id)` | `DELETE /sync/vaults/{id}` |

Códigos de resposta HTTP → `ErroSync` (`FalhaSync.codigo`, `src/sync/tiposServidor.ts`):

| HTTP | `ErroSync` |
|---|---|
| 401 | `sessao` |
| 403 | `plano` |
| 404 | `nao-encontrado` |
| 409 com corpo `{ "codigo": "fora-de-ordem" }` | `fora-de-ordem` |
| 409 com corpo `{ "codigo": "ja-existe" }` | `ja-existe` (só em `POST /sync/vaults`, id repetido) |
| 413 ou 507 | `espaco` |
| qualquer outro código | `servidor` |
| falha de conexão (sem resposta do servidor) | `rede` |

---

## 10. Testar sem servidor (só desenvolvimento)

Sem servidor de verdade ainda, o dono do produto não teria como ver a sincronização funcionando
de ponta a ponta. Em modo de desenvolvimento (`npm run tauri dev`), o app troca de implementação
por baixo do mesmo contrato `ServicoSync` — nada disto existe fora de DEV.

- **`ServicoSyncLocal`** grava os pacotes em arquivos numa pasta de teste do app data
  (`sync-teste/`), com escrita atômica (tmp + rename), em vez de falar HTTP com um servidor.
  Duas janelas do app rodando em DEV no mesmo computador enxergam a mesma pasta — é o
  "servidor" delas.
- **Conta de teste em DEV:** o `contaStore` usa um `ServicoContaFakeDev` (irmão do
  `ServicoContaFake`, só em DEV) com uma conta premium conhecida, para dar para entrar sem
  servidor de conta também:
  - E-mail: `teste@excalisidian.local`
  - Senha: `senha-de-teste-123`

  O token desta conta é determinístico (derivado só do e-mail): qualquer janela do app em DEV
  reconhece o token que outra janela gravou no cofre do Windows (compartilhado entre elas),
  mesmo sendo cada uma um processo JS com sua própria instância do fake em memória. Sem isso,
  a segunda janela veria o token da primeira como desconhecido, `renovar` recusaria como
  "expirada", e o `contaStore` apagaria o token do cofre — deslogando a outra janela.
- **Passo a passo, em alto nível**, para o dono do produto testar duas janelas sincronizando:
  1. Abrir duas janelas do app em DEV, cada uma com um vault diferente (pode ser duas pastas
     vazias).
  2. Entrar com a conta de teste em cada janela (Configurações → Conta).
  3. Numa janela, Configurações → Sincronização → "Sincronizar este vault".
  4. Na outra janela, Configurações → Sincronização → "Baixar um vault sincronizado para uma
     pasta vazia", escolher o vault que apareceu e uma pasta vazia.
  5. Editar uma nota numa janela e conferir que ela aparece (ou atualiza) na outra depois de um
     ciclo.
  6. Para ver a tela de conflito: editar a **mesma** nota nas duas janelas antes de qualquer
     sincronizar de novo, depois deixar as duas sincronizarem.
- Em produção, nada disso existe: depois de `npm run build`, `dist/` não pode conter a senha de
  teste, o e-mail de teste, a string `sync-teste` nem `ServicoSyncLocal` — a Task 6 confere isso.
- `VITE_SERVIDOR=real` em desenvolvimento troca este padrão pelo servidor de verdade, para testar
  contra o servidor de verdade em desenvolvimento (doc 18 §5).

---

## 11. Testes que este documento exige

- Cifra: ida e volta; pacote com um byte trocado não abre; pacote com AAD de outro vault ou
  outra sequência não abre; tamanhos saem sempre da escada.
- Ciclo, com dois "computadores" falsos (dois vaults em memória) e o servidor falso:
  criar em A aparece em B; editar em A atualiza B; editar nos dois vira conflito em B com as
  duas versões certas; apagar em A com edição em B mantém a nota em B e ela volta para A;
  renomear em A aparece renomeado em B; dois envios ao mesmo tempo não perdem nenhuma mudança.
- Efeito visível (lição de 23/09): toda mudança aplicada recarrega árvore e índice, e uma aba
  aberta passa a mostrar a versão nova sem que um autosave pendente grave a antiga por cima.
- Retrato: computador novo recebe o vault inteiro a partir de retrato + lotes.
