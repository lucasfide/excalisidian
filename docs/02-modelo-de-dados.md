# 02 — Modelo de dados e formato dos arquivos

Este documento é normativo. É a fonte da verdade sobre o que vai no disco. Antes de mudar qualquer coisa aqui, leia a seção "Por que assim" de cada decisão.

---

## 1. Vault

Um **vault** é uma pasta escolhida pelo usuário. Não há banco de dados de conteúdo.

```
MeuVault/
├── Projetos/
│   ├── Excalisidian.md
│   └── Arquitetura.draw.md
├── Diário/
│   └── 2026-08-28.md
├── anexos/
│   └── Imagem colada 20260828-231455.png
├── .trash/                      ← lixeira do vault
└── .excalisidian/               ← config DO VAULT (versionável)
    └── vault.json
```

Fora do vault, em `%APPDATA%\Excalisidian\` (Windows):

```
%APPDATA%/Excalisidian/
├── settings.json        preferências globais, tema, lista de vaults recentes
├── workspace/
│   └── <hash-do-vault>.json   layout de abas, um por vault (descartável)
└── cache/
    └── <hash-do-vault>/
        ├── index.json   metadata cache
        └── search.json  índice do minisearch serializado
```

O layout é gravado por vault, não global: sem isso, abrir o vault B sobrescreve o layout do vault A.

**Regra dura:** tudo em `cache/` e `workspace/` pode ser apagado a qualquer momento sem perda de dado do usuário.

**Por que assim:** o Obsidian coloca `workspace.json` dentro de `.obsidian/`, dentro do vault, e a própria documentação recomenda colocá-lo no `.gitignore` porque muda a cada arquivo aberto. Colocar fora do vault desde o início evita esse problema e evita que o file watcher dispare por causa do próprio app.

### `.excalisidian/vault.json`

Config que faz sentido versionar junto com o conteúdo:

```json
{
  "version": 1,
  "attachmentFolder": "anexos",
  "attachmentMode": "fixed",
  "attachmentSubfolder": "anexos",
  "newNoteLocation": "sameFolder",
  "newNoteFolder": "",
  "linkFormat": "shortest",
  "trash": "vault"
}
```

| Campo | Valores | Default |
|---|---|---|
| `attachmentMode` | `vault` (raiz), `fixed` (usa `attachmentFolder`), `sameFolder`, `subfolder` | `fixed` |
| `attachmentFolder` | caminho relativo à raiz, usado por `fixed` | `anexos` |
| `attachmentSubfolder` | nome da subpasta criada ao lado da nota, usado por `subfolder` | `anexos` |
| `newNoteLocation` | `vault`, `sameFolder`, `fixed` | `sameFolder` |
| `newNoteFolder` | pasta usada por `newNoteLocation: fixed` | vazio |
| `linkFormat` | `shortest`, `relative`, `absolute` | `shortest` |
| `trash` | `vault` (`.trash/`), `system` (lixeira do SO), `permanent` | `vault` |

Resolução da pasta de anexo, dada a nota em que a colagem aconteceu:

```
pastaDeAnexo(nota) =
  vault      -> ""                                          (raiz do vault)
  fixed      -> attachmentFolder
  sameFolder -> dirname(nota)
  subfolder  -> dirname(nota) + "/" + attachmentSubfolder
```

A pasta é criada se não existir. Onde a especificação escreve `<attachmentFolder>/…`, leia `pastaDeAnexo(nota)/…`.

**Este arquivo é a fonte única desses campos.** `settings.json` em `%APPDATA%` guarda só o que é da máquina: tema, tamanho da janela e a lista de vaults recentes. Nada de configuração de vault mora nos dois lugares.

---

## 2. Notas — `.md`

Markdown puro, UTF-8 **sem BOM**, quebra de linha `\n`. Frontmatter YAML opcional delimitado por `---`.

```markdown
---
aliases: [ADR-3, Decisão do canvas]
created: 2026-08-28
---

# Por que o canvas é markdown

Ver [[Projetos/Arquitetura]] e o desenho abaixo.

![[Projetos/Arquitetura.draw.md]]
```

### Sintaxe suportada no MVP

Base: CommonMark + GFM (tabela, task list, riscado, autolink).

Extensões próprias, todas com a mesma semântica do Obsidian:

| Sintaxe | Significado |
|---|---|
| `[[Nota]]` | link interno |
| `[[Nota\|texto exibido]]` | link com alias |
| `[[Nota#Título]]` | link para heading |
| `[[Nota#^abc123]]` | link para bloco |
| `[[#Título]]` | heading na própria nota |
| `![[Nota]]` | embed de nota inteira |
| `![[Nota#Título]]` | embed de seção |
| `![[imagem.png]]` | embed de imagem |
| `![[imagem.png\|400]]` | embed com largura |
| `![[imagem.png\|400x300]]` | embed com largura x altura |
| `![[Desenho.draw.md]]` | embed de desenho (renderiza SVG) |
| `![[Desenho.draw.md\|600]]` | embed de desenho com largura |
| `^abc123` no fim de um bloco | id de bloco |
| `%%comentário%%` | comentário, não renderiza |
| `==destaque==` | destaque |

**Fora do MVP:** callouts (`> [!note]`), footnotes, `[[## busca]]`, dimensionamento de PDF, embed de resultado de busca.

### Caracteres proibidos no alvo do wikilink

Depois de separar o `#subcaminho` e o `|alias`, o que sobra é o **alvo**, e nele não pode haver `#`, `|`, `^`, `[` nem `]`. Se houver, o link não resolve — e a UI mostra como link não resolvido, sem travar.

---

## 3. Desenhos — `.draw.md`

Esta é a decisão central do produto. Um desenho é um arquivo markdown.

### 3.0 A extensão

Um desenho é `Nome.draw.md`. Para o sistema operacional, para o Git e para qualquer editor de texto, a extensão real é **`.md`** — `.draw` é parte do nome base. Consequências:

- nenhum handler de arquivo do Windows é acionado por `.draw`, então não há colisão com nada;
- o arquivo é markdown de verdade em qualquer ferramenta, sem configuração;
- e dá para ver na árvore de pastas, sem abrir, que aquilo é um desenho.

A extensão **não usa a palavra Excalidraw**. `.draw` não pertence a nenhum formato vivo: a única associação histórica é o DrawFile do RISC OS, de uma plataforma extinta, e ela nunca é acionada porque a extensão efetiva aqui é `.md`.

**Em wikilink, a forma canônica omite o `.md`:**

```
[[Projetos/Arquitetura.draw]]        forma canônica
![[Projetos/Arquitetura.draw|600]]   embed com largura
[[Projetos/Arquitetura.draw.md]]     também resolve
[[Arquitetura]]                      resolve, se nenhuma nota tiver esse nome
```

Para isso funcionar, o índice registra cada desenho sob **dois nomes base**: `Arquitetura.draw` e `Arquitetura`. Se existirem `Arquitetura.md` e `Arquitetura.draw.md` na mesma pasta, `[[Arquitetura]]` resolve para a **nota** — o desenho exige o `.draw`. É determinístico, e está no teste 3 do documento 05.

### Estrutura exata

````markdown
---
excalisidian: drawing
---

%%
# Excalisidian Drawing

## Text Elements
Arquitetura do sistema ^tx-Kx91aQ7bW2

[[Projetos/Backend]] ^tx-P02mLeXd9c

## Element Links
rc-9dKw2aTb01: [[Projetos/Frontend]]

## Embedded Files
a91bC0zzQ4Kd: [[anexos/diagrama-antigo.png]]

## Scene
```draw-json
{ "type": "excalidraw", "version": 2, "source": "excalisidian/0.1.0",
  "elements": [ ], "appState": { }, "files": { } }
```
%%
````

Regras do formato:

1. O frontmatter precisa ter `excalisidian: drawing`. É assim que o app decide abrir no canvas em vez do editor de texto.
2. Tudo entre o frontmatter e o `%%` de abertura é **conteúdo livre do usuário** ("o verso da folha"). O app preserva byte a byte e nunca reescreve.
3. O bloco de dados fica dentro de um comentário `%%…%%` para não sujar a leitura se a nota for aberta como texto.
4. `## Text Elements` — um registro por elemento de texto, no formato `<texto> ^<blockId>`, separados por linha em branco. Texto com mais de uma linha é gravado em várias linhas, com o `^blockId` sozinho na última. **O `blockId` não é o id do elemento** — ver a seção 3.1 abaixo, que é obrigatória.
5. `## Element Links` — `<id>: <link>` para elementos que não são texto mas têm link (uma caixa que aponta para uma nota).
6. `## Embedded Files` — `<fileId>: [[caminho/da/imagem.png]]`. O `fileId` aqui é o **id de arquivo do Excalidraw**, não um blockId de elemento: ele identifica o conteúdo da imagem, e vários elementos do desenho podem apontar para o mesmo. **As imagens não ficam em base64 dentro do arquivo**; ficam como arquivos de verdade no vault, e o desenho guarda só a referência.
7. `## Scene` — code fence com a cena. A **linguagem do fence declara o encoding**, e o parser decide por ela:

   | Linguagem do fence | Conteúdo |
   |---|---|
   | `draw-json` | JSON indentado, legível — o padrão do MVP |
   | `draw-json-lz` | o mesmo JSON comprimido com LZString base64, em linhas de 256 caracteres |

   O MVP grava sempre `draw-json`. A segunda variante existe **desde já no parser** para que ligar compressão depois seja uma linha de configuração, não uma migração de todos os arquivos existentes.

### 3.1 Do id do elemento para o block id

O Excalidraw gera ids no formato nanoid de 21 caracteres do alfabeto `A-Za-z0-9_-`. O block id do markdown aceita **só letras latinas, números e hífen** — o `_` não entra. Portanto **o id do elemento não vira block id sozinho**; existe uma tradução, e ela precisa ser estável entre gravações, senão o arquivo muda sem o usuário ter editado nada e o RNF7 cai.

Regra:

```
blockId(elemento) = prefixo(tipo) + "-" + sanitiza(id)

prefixo: "tx" texto · "rc" retângulo · "di" losango · "el" elipse
         "ar" seta · "ln" linha · "fd" mão livre · "im" imagem · "fr" frame
sanitiza(id): troca "_" por "-" e corta nos 10 primeiros caracteres
```

Se dois elementos colidirem no mesmo arquivo, o segundo recebe um sufixo `-2`, `-3` e assim por diante, atribuído na **ordem do array de elementos** — o que torna a colisão determinística.

O mapa completo `blockId → id do elemento` fica na própria seção: o parser reconstrói o mapa lendo os registros, e o serializador recalcula a partir da cena. Nenhum mapa extra é gravado.

### 3.2 Escaping

O texto que o usuário escreve dentro do canvas pode imitar a estrutura do arquivo. Quatro casos, quatro regras:

**Regra geral do `## Text Elements`:** o corpo de cada registro é gravado **indentado em dois espaços**, e só a última linha carrega o ` ^blockId` sem indentação extra. Com isso, uma linha do usuário que comece com `#`, com `^` ou que seja um `## Scene` deixa de ser lida como estrutura — está indentada. O parser remove os dois espaços na leitura. O separador entre registros continua sendo a linha em branco **não indentada**; linhas em branco dentro de um texto multilinha são gravadas com os dois espaços.

Os outros dois casos:

- **`%%` dentro de um texto do canvas** fecharia o comentário. Ao gravar, `%%` vira `%​%` com um zero-width space entre os sinais; ao ler, o zero-width space é removido. O texto no canvas continua sendo `%%`.
- **Uma cerca de crases dentro de um texto do canvas** fecharia o code fence da cena. O serializador conta a maior sequência de crases presente no JSON e abre a cerca com uma a mais — três no caso normal, quatro ou mais quando necessário. O parser lê o comprimento da cerca de abertura e usa o mesmo para fechar.

### 3.3 Quais campos do elemento são gravados

O `ExcalidrawElement` tem campos que mudam a cada interação sem que nada de semântico mude: `version`, `versionNonce` e `updated`. **Esses três não são gravados.** Ao ler, são reidratados com `version: 1`, `versionNonce: 0` e `updated: 0`, e o Excalidraw segue a partir daí.

`seed` **é gravado** — ele é a semente do desenho à mão do roughjs, e sem ele a forma muda de aparência a cada abertura.

`isDeleted: true` também não é gravado: elementos apagados saem do arquivo.

Sem essa lista, o RNF7 e o teste 2 do documento 05 são impossíveis de passar por construção.

### Por que markdown e não JSON puro

- Os textos do desenho ficam pesquisáveis pela mesma busca das notas, de graça.
- Um `[[link]]` escrito num elemento de texto aparece nos backlinks da nota alvo, porque o link está literalmente no arquivo `.md`.
- O desenho aparece na árvore de pastas junto com as notas, sem tipo especial.
- É a mesma ideia que o plugin Excalidraw do Obsidian usa desde a versão 1.2. **Não é compatível byte a byte com ele** — os nomes de seção e a chave de frontmatter são diferentes, e o plugin comprime a cena. A semelhança estrutural é deliberada, para que um conversor nos dois sentidos seja viável.

### Por que JSON legível e não comprimido

Compressão é uma otimização com custo de legibilidade. JSON indentado com uma chave por linha dá diff de Git bom de graça e permite editar o arquivo à mão.

O tamanho é gerenciável para o uso normal. Medindo os campos reais do `ExcalidrawElement`: cerca de **450 a 700 bytes por forma ou texto** em JSON minificado, e traço à mão livre é dominado pelo array `points`, a **~14 bytes por ponto**. Uma cena de 200 formas fica na casa de 100 KB; a mesma cena cheia de traço à mão livre passa de 1 MB. Indentado, multiplique por algo entre 1,5 e 2.

**Regra concreta, em vez de "reavaliar depois":** acima de **1,5 MB** de JSON, o app grava aquele arquivo como `draw-json-lz` e avisa uma vez. Como as duas linguagens de fence já existem no parser, isso não é migração.

Esses números são medição de campos, não benchmark publicado — não existe dado oficial de bytes por elemento do Excalidraw. Meça com suas cenas reais.

**Ordem estável obrigatória:** ao serializar, os elementos são gravados na ordem do array da cena e as chaves de cada elemento em **ordem alfabética fixa**. Sem isso, abrir e fechar um desenho sem editar nada gera diff no Git — e isso mata a confiança no formato.

### O campo `"type": "excalidraw"` dentro do JSON

O objeto da cena mantém `"type": "excalidraw"`. Isso não é o nome do produto nem da extensão: é o discriminador do schema de dados do Excalidraw, e é o que permite copiar o bloco JSON e abrir direto no excalidraw.com, ou receber um arquivo de lá. Trocar por `"type": "excalisidian"` custaria essa interoperabilidade em troca de nada — a decisão de não usar a marca é sobre a extensão e o nome do produto, não sobre um campo interno de formato de dados.

### Imagens

O Excalidraw guarda imagens no mapa `files` como data URL base64. O Excalisidian **não faz isso**.

Ao colar uma imagem (`Ctrl+V`) no canvas ou numa nota:

1. Grava o arquivo em `pastaDeAnexo(nota)/Imagem colada YYYYMMDD-HHmmss.<ext>`.
2. No canvas: cria o `ExcalidrawImageElement` com um `fileId`, e registra `fileId: [[caminho]]` em `## Embedded Files`. O mapa `files` da cena fica **vazio no disco**; é reidratado em memória ao abrir, lendo os arquivos.
3. Na nota: insere `![[caminho]]`.

**Por que:** um vault de desenhos com base64 embutido fica com arquivos de 10 MB que o Git não consegue versionar de forma útil, e a mesma imagem colada em três desenhos ocupa três vezes o espaço.

---

## 4. Resolução de links

Dado um wikilink `[[alvo]]` escrito no arquivo `origem`:

1. Normalizar `alvo` com `String.normalize("NFC")` e remover `#…` e `|…`.
2. Se `alvo` contém `/`, tratar como caminho a partir da raiz do vault; tentar, nesta ordem: exato, `+ .md`, `+ .draw.md`.
3. Se não contém `/`, procurar no índice `basename → [caminhos]`, onde cada desenho está registrado sob `Nome.draw` e sob `Nome`, e a nota vence o desenho em caso de empate entre os dois tipos:
   - se houver exatamente um, é ele;
   - se houver vários, vence o de **menor distância de pasta** em relação a `origem` (mesma pasta primeiro, depois pasta pai, depois o caminho mais curto);
   - empate remanescente: ordem alfabética do caminho, para ser determinístico.
4. Se não achou nada, o link é **não resolvido**: renderiza com estilo próprio e, ao clicar, cria a nota.

Comparação de nomes é **case-insensitive no Windows** e a chave canônica do índice é o caminho em minúsculas com `/` como separador.

### Ao clicar num link não resolvido

- Se o link tem caminho (`[[Projetos/Nova]]`), cria em `Projetos/`, criando a pasta se preciso.
- Se não tem, cria conforme `newNoteLocation`.
- O arquivo criado começa vazio (sem template no MVP).

### Ao renomear ou mover um arquivo

Todos os links que apontavam para ele são reescritos. Isso é uma operação em lote sobre N arquivos, e portanto:

- roda numa transação lógica: lê todos, calcula todos os novos conteúdos, e só então grava;
- mostra um toast com "N links atualizados em M notas";
- se qualquer gravação falhar, as anteriores **não** são revertidas (rollback de FS é complexidade que não vale) — mas o erro diz exatamente quais arquivos ficaram inconsistentes.

Links no formato markdown (`[texto](caminho)`) também são atualizados. Links para URLs externas, nunca.

---

## 5. Block ids

Um bloco pode receber um id: uma sequência de letras latinas, números e hífen, precedida de `^`, no fim da linha, separada por um espaço.

```markdown
Uma frase que quero referenciar depois. ^decisao-canvas
```

Em blocos estruturados (lista, citação, tabela), o `^id` vai em linha própria, com linha em branco antes.

Geração automática: quando o usuário usa "Copiar link para o bloco", o app gera um id de 6 caracteres alfanuméricos minúsculos e grava no arquivo. Colisão dentro do mesmo arquivo: gera outro.

---

## 6. Metadata cache

Em memória, persistido em `cache/<hash>/index.json`.

```ts
type FileMeta = {
  path: string;          // relativo à raiz, com "/", NFC
  kind: "note" | "drawing" | "attachment";
  mtimeMs: number;
  size: number;
  title: string;         // heading 1 se houver, senão basename
  aliases: string[];
  headings: { text: string; level: number; line: number }[];
  blockIds: string[];
  outLinks: LinkRef[];
  embeds: LinkRef[];
};

type LinkRef = {
  raw: string;           // "Projetos/Nota#Título|alias"
  target: string;        // "Projetos/Nota"
  subpath?: string;      // "#Título" ou "#^abc123"
  alias?: string;
  line: number;
  resolvedPath: string | null;
};
```

Índices derivados, **sempre reconstruídos, nunca persistidos como verdade**:

- `byBasename: Map<string, string[]>`
- `backlinks: Map<string, Set<string>>` — derivado de `outLinks` de todo mundo
- `unresolved: Map<string, string[]>`

**Boot:** lê `index.json`, compara `mtimeMs` + `size` com o que o disco reporta, e só reparseia o que mudou. Com 5 000 notas isso é a diferença entre uma abertura instantânea e 15 segundos de tela branca.

**Invalidação:** qualquer evento do watcher para um arquivo `.md` reparseia aquele arquivo e recalcula os índices derivados que envolvem ele.

---

## 7. Lixeira

Modo default: `vault`.

Ao deletar `Projetos/Nota.md`:

1. Move para `.trash/Nota.md`. Se já existir, `.trash/Nota (2).md`.
2. Registra em `.trash/.index.json`:

```json
[
  { "trashName": "Nota.md",
    "originalPath": "Projetos/Nota.md",
    "deletedAt": "2026-08-28T23:14:55.120Z",
    "kind": "note" }
]
```

3. O arquivo sai do índice e das abas abertas.
4. Toast: "Nota movida para a lixeira." com ação "Desfazer" por 8 segundos.

**Restaurar:** volta para `originalPath`. Se a pasta original sumiu, recria. Se já existe um arquivo lá, restaura como `Nota (restaurado).md` e avisa.

**Esvaziar lixeira:** única ação irreversível do produto. Diálogo com contagem real: "Excluir permanentemente 12 arquivos? Isso não pode ser desfeito."

Deletar uma pasta move a pasta inteira, preservando a estrutura interna dentro de `.trash/`.

`.trash/` e `.excalisidian/` **nunca** aparecem na árvore de pastas, na busca, no quick switcher ou nos backlinks.

---

## 8. Anexos

Qualquer arquivo do vault que não é `.md`. Aparecem na árvore, podem ser linkados, e são exibidos:

| Extensão | Tratamento |
|---|---|
| `.png .jpg .jpeg .gif .webp .svg .avif .bmp` | imagem, renderiza embed |
| `.pdf` | ícone; abre no visualizador do sistema (MVP) |
| qualquer outra | ícone genérico; abre no app padrão do sistema |

Deletar uma nota **não** deleta seus anexos. Anexos órfãos são problema de outro dia (fora do MVP).

---

## 9. Nomes de arquivo

Validação obrigatória na criação e no rename, porque isso é Windows:

- proibidos: `< > : " / \ | ? *` e caracteres de controle 0–31;
- nomes reservados, com ou sem extensão: `CON PRN AUX NUL COM1`–`COM9` `LPT1`–`LPT9`;
- não pode terminar em `.` nem em espaço;
- caminho completo acima de 240 caracteres: recusa com mensagem explicando;
- nome vazio ou só espaços: recusa.

Ao criar nota a partir de um link, o app faz sanitização visível (`:` vira `-`) e mostra o nome final antes de gravar.

---

## 10. Escrita em disco

Toda gravação é atômica:

1. escreve em `<arquivo>.excalisidian-tmp` no mesmo diretório (nome próprio, para não colidir com `.tmp` de outros programas e para o watcher poder ignorar por extensão);
2. rename por cima do original.

Não há `fsync`: o `@tauri-apps/plugin-fs` não expõe sincronização de disco, e adicionar um comando Rust só para isso não se paga. O rename dentro do mesmo volume é atômico no NTFS, o que já garante o que importa — nunca existe um arquivo pela metade.

Isso evita nota truncada se o app morrer no meio da gravação.

**Anti-loop com o watcher.** O app escreve e o watcher avisa que o arquivo mudou; se o app reagir a isso recarregando, você tem um loop e perda de texto. Mitigação obrigatória:

- antes de gravar, registrar `path → { hash do conteúdo, timestamp }` num mapa de "escritas nossas";
- ao receber evento do watcher, ignorar se o path está no mapa **e** o conteúdo em disco bate com o hash;
- limpar entradas com mais de 2 segundos.

Só um flag booleano ou só o timestamp não funciona: no Windows o `notify` costuma emitir dois ou três eventos por gravação, com atraso variável.

---

## 11. Conflito entre disco e editor

Se o watcher detecta mudança externa num arquivo que está aberto:

- se a aba **não** tem edição pendente: recarrega em silêncio, preservando posição de scroll;
- se **tem** edição pendente e o conteúdo do disco difere: mostra uma faixa no topo do editor: "Este arquivo mudou fora do Excalisidian." com dois botões, "Recarregar do disco" e "Manter minha versão". Não decide sozinho, e não faz merge.

Se o arquivo foi apagado externamente: a aba fica em estado de erro com a opção "Recriar com o conteúdo desta aba".

**Em desenho, nunca há recarga silenciosa.** Recarregar uma cena descarta seleção, viewport e histórico de desfazer, o que é destrutivo mesmo sem edição pendente. Um `.draw.md` alterado por fora sempre mostra a faixa, com "Recarregar do disco" e "Manter minha versão".

---

## 12. Versão de formato

`vault.json` tem `"version"` e a cena tem `"version": 2`. A regra é a mesma para os dois:

- versão do arquivo **menor** que a do app: o app migra na primeira gravação, e só nela. Ler nunca migra.
- versão **maior**: o app abre em modo somente leitura e avisa: "Este arquivo foi criado por uma versão mais nova do Excalisidian." Nunca grava por cima do que não entende.
- versão ausente: trata como 1.
