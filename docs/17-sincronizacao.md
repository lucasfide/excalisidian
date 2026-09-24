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

- Entra: todo arquivo do vault, inclusive `.excalisidian/vault.json`.
- Não entra: a lixeira (`.trash/`), arquivos temporários de gravação
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

## 7. Ligar, baixar, parar

- **Ligar neste vault:** Configurações → Sincronização → "Sincronizar este vault". Exige
  conta premium. Se este computador ainda não tem a `chaveDeEnvelope`, pede a senha da conta
  (a mesma de entrar), confere com o servidor (entrar de novo com a prova) e guarda no cofre.
  Gera a `chaveDoVault`, cria o vault no servidor com o nome cifrado e o envelope, e envia um
  retrato inicial.
- **Baixar um vault para este computador:** lista os vaults da conta (nomes abertos no
  computador), o usuário escolhe um e uma **pasta vazia**. Baixa o retrato mais recente e os
  lotes seguintes.
- **Parar de sincronizar:** esquece o `EstadoSync` deste computador. Os arquivos ficam.
- **Apagar a cópia do servidor:** botão separado, com confirmação que diz o nome do vault e
  que os arquivos em todos os computadores continuam intactos.
- **Nome do computador:** Configurações → Sincronização, editável. Padrão: o nome de usuário
  do Windows seguido de "(este computador)" até alguém mudar. Aparece na tela de conflito
  ("Em Notebook do Lucas").

---

## 8. Estado na interface

Sem banner, sem aviso recorrente (ADR-31). Um ícone discreto no rodapé da barra lateral, ao
lado das Configurações, com texto no `title` e na seção de Configurações:

- Sincronizado · Sincronizando… · Sem conexão (tenta de novo sozinho) · Pausado
- Erros que pedem ação (plano venceu, espaço do plano acabou, sessão expirou) aparecem só na
  seção Sincronização e no `title` do ícone, com o texto do catálogo.

Os textos entram no catálogo `src/i18n/catalogo/sync.ts`, pt-BR e inglês.

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

O servidor pode descartar lotes cobertos por um retrato. Ele **recusa** (`fora-de-ordem`, sem
mudar nada) um retrato cujo `ateSequencia` não seja maior que o do retrato atual, ou que passe
da última sequência do diário: se um retrato mais antigo substituísse um mais novo, os lotes
entre os dois — já descartados — nunca mais chegariam a um computador novo. Um computador que manda um retrato
faz isso quando o diário passa de 200 lotes ou de 50 MiB desde o último retrato.

---

## 10. Testes que este documento exige

- Cifra: ida e volta; pacote com um byte trocado não abre; pacote com AAD de outro vault ou
  outra sequência não abre; tamanhos saem sempre da escada.
- Ciclo, com dois "computadores" falsos (dois vaults em memória) e o servidor falso:
  criar em A aparece em B; editar em A atualiza B; editar nos dois vira conflito em B com as
  duas versões certas; apagar em A com edição em B mantém a nota em B e ela volta para A;
  renomear em A aparece renomeado em B; dois envios ao mesmo tempo não perdem nenhuma mudança.
- Efeito visível (lição de 23/09): toda mudança aplicada recarrega árvore e índice, e uma aba
  aberta passa a mostrar a versão nova sem que um autosave pendente grave a antiga por cima.
- Retrato: computador novo recebe o vault inteiro a partir de retrato + lotes.
