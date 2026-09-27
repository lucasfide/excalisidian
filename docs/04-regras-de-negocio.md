# 04 — Regras de negócio, comportamentos e casos de borda

O que os requisitos não dizem: o que acontece quando a situação não é a feliz.

---

## 1. Ciclo de vida de um documento aberto

Uma aba tem um destes estados, e a UI mostra qual:

| Estado | Como chega | Como sai | Aparência |
|---|---|---|---|
| `limpo` | abriu, ou acabou de salvar | usuário digita → `sujo` | nada |
| `sujo` | usuário digitou | debounce venceu → `salvando` | ponto em `ocre` ao lado do nome |
| `salvando` | gravação em andamento | sucesso → `limpo`; erro → `erro` | ponto pulsando |
| `erro` | gravação falhou | nova tentativa | ponto em `bordo` + faixa no topo |
| `conflito` | arquivo mudou no disco com edição pendente — ou, em desenho, mudou no disco em qualquer caso | usuário escolheu | faixa no topo com dois botões |
| `órfão` | arquivo apagado externamente | usuário recriou ou fechou | faixa no topo |

Regras:

- Fechar uma aba `sujo` grava antes de fechar. Sem diálogo de "deseja salvar?" — autosave significa autosave.
- Fechar uma aba em `erro` mostra diálogo: "Não foi possível salvar. Fechar mesmo assim descarta as alterações."
- O app nunca fecha com abas em `salvando`: espera o flush.

## 2. Autosave

Debounce de 800 ms **por documento**, não global. Flush imediato em: troca de aba ativa, perda de foco da janela, `Ctrl+S`, fechamento da aba, fechamento do app, e antes de qualquer operação de rename/move que envolva o arquivo.

Se o conteúdo depois do debounce for idêntico ao que está em disco, **não grava**. Isso é o que garante RNF7 (abrir e fechar não gera diff).

## 3. Renomear e mover

- Renomear um arquivo aberto mantém a aba aberta, apontando para o novo caminho.
- Renomear é bloqueado enquanto houver aba em `salvando` daquele arquivo.
- Renomear uma pasta atualiza os links de todos os arquivos que estavam dentro dela.
- Ao atualizar links, o formato escrito respeita `linkFormat` do vault — mas **um link que já estava escrito com caminho completo continua com caminho completo**. O app não normaliza o que o usuário escreveu; só troca a parte que precisa mudar.
- **Se o novo nome colidir com um arquivo existente (renomear ou mover/arrastar pra uma pasta que já tem um arquivo com esse nome): nunca recusa.** Resolve sozinho com o mesmo padrão de numeração da criação de arquivo novo — `Nome (2)`, `Nome (3)`... — e avisa qual nome acabou sendo usado. Nunca sobrescreve o que já existia.
- Renomear para um nome vazio (ou só espaço) cai para `Sem título` — nunca recusa por nome vazio. A mesma numeração de colisão acima se aplica se já houver um "Sem título" ali.

### 3.1 Nome do arquivo e H1 da nota são a mesma coisa

Criar uma nota ou um desenho (sidebar, Home, paleta de comandos) **nunca pede nome** — abre
direto como "Sem título" (com a numeração de colisão da seção 3, se já houver um "Sem
título" ali) e já entra editável. Nota nova digitar o título é editar a primeira linha, que já
renomeia o arquivo sozinha (ver abaixo); desenho novo, o nome se muda depois pela árvore.
Criar uma **pasta** continua pedindo nome — não tem H1 pra herdar um nome dela mais tarde.

Toda nota tem um H1 (heading de nível 1) cujo texto é o nome do arquivo, sem extensão. Editar
um edita o outro:

- **Renomear pelo arquivo** (árvore, aba, ou a numeração automática acima) atualiza o H1 da
  nota pra bater com o nome novo. Se a nota não tiver H1 nenhum ainda, insere um logo depois
  do frontmatter — nunca no meio do conteúdo do usuário.
- **Editar o H1** (só quando ele está na linha 1 da nota — um H1 em outro lugar do documento
  não é o título) dispara um rename de verdade, com a mesma reescrita de backlinks de um
  rename pela árvore. Isso vale ao sair da linha (mover o cursor pra outra linha dentro da
  mesma nota, não a cada tecla), **ao sair da nota** (clicar em outra nota, em outra aba ou
  na barra lateral) e **ao fechar a aba** — não só quando o cursor se move dentro do mesmo
  editor.
- **O `#` da linha 1 é fixo.** Quando a linha 1 já é um H1, o prefixo `# ` não pode ser
  editado nem apagado: selecionar a linha inteira e digitar troca só o texto depois do `# `,
  Backspace no começo do título não come o `#`, e apagar todo o texto do título deixa `# ` —
  a linha 1 continua sendo um H1. Não dispara rename enquanto o texto está vazio. Só vale
  quando a linha 1 já é um H1: numa nota antiga que abre sem H1 nenhum na linha 1, o app não
  insere um (RNF7 — abrir não gera diff); o H1 aparece quando o usuário digita um título ou
  renomeia pelo arquivo.
- Não vale pra `.draw.md`: o "título" de um desenho já é o nome do arquivo por definição (doc
  01) — não existe H1 num desenho pra sincronizar com nada.
- **Limitação conhecida:** como qualquer rename hoje remonta o painel da aba por inteiro
  (`workspaceStore.renomearDocumento`), terminar de editar o H1 e sair da linha 1 pode fazer o
  cursor voltar pro início da nota e zerar o desfazer — mesmo custo que já existia pra um
  rename vindo da árvore, só que agora acontece bem mais vezes (toda vez que se termina de
  escrever um título). Aceito por ora; corrigir exige mexer em como o dockview troca de
  painel (ver doc 09).

### 3.2 Blocos no editor de texto

O editor entende "bloco" do mesmo jeito que Notion e Obsidian, mas construído em cima do fato
de que o arquivo é Markdown puro — não existe objeto "bloco" próprio, o que existe é a árvore de
sintaxe do CommonMark/GFM (ver doc 09 ADR-18). **Bloco é o filho direto do documento que contém
o cursor** — um parágrafo, um heading, uma citação, um bloco de código, uma tabela — exceto
dentro de uma lista, onde cada item é seu próprio bloco.

- **Enter** grava uma **quebra de linha simples** (`\n`) — pula uma linha só, como num editor
  de texto comum. Apertar Enter **de novo** numa linha vazia é que abre a **linha em branco**
  que separa um bloco do próximo no Markdown (dois parágrafos sem linha em branco entre eles
  são um parágrafo só pra qualquer leitor de Markdown). Ou seja: o "bloco novo" custa dois
  Enters, não um.
- **Cada linha feita com Enter é um bloco próprio pro editor** (alça de mover, clique triplo),
  mesmo sem linha em branco entre elas — ainda que pro Markdown sejam um parágrafo só.
- **Shift+Enter** quebra dentro do **mesmo** bloco. Em parágrafo solto grava o hard break do
  CommonMark (dois espaços antes da quebra, `  \n`): é isso que distingue no arquivo uma linha
  do Shift+Enter de uma do Enter, e a alça move as linhas ligadas assim juntas. Em lista e
  citação grava `\n` mais o prefixo de continuação.
- Isso só vale para parágrafo e heading soltos (filhos diretos do documento). Dentro de lista,
  citação, bloco de código ou tabela, Enter continua fazendo o que já fazia (continuar a lista,
  por exemplo).
- **Mudar o Enter não reformata nota nenhuma já existente** (§11.8): o app não sai inserindo
  nem removendo linha em branco em texto que o usuário não tocou.
- **Clique triplo** seleciona o bloco inteiro (inclusive as linhas ligadas por Shift+Enter),
  nunca a linha em branco depois dele.
- **Mover um bloco não mexe nas linhas em branco**: elas ficam no lugar, e o bloco sai com uma
  quebra de linha e entra no ponto de soltura com outra. Soltar logo abaixo de um grupo de
  linhas (antes da linha em branco) junta o bloco a esse grupo.
- **Mover bloco** é só pela alça (⠿) que aparece ao passar o mouse — sem atalho de teclado.
  Arrasta um bloco pra antes ou depois de outro **do mesmo nível**: parágrafo/heading/citação
  soltos entre si, ou item de lista dentro da própria lista.
- **A linha 1 nunca tem alça de mover** — é o título da nota e fica no lugar. Vale pra qualquer
  bloco na linha 1, seja o H1 do título ou um parágrafo (nota antiga sem título).

### 3.3 Tabelas

Contrato completo — modelo de dados, funções puras e contratos de código — em
`docs/14-tabelas.md` (fonte de tudo abaixo). Aqui ficam as regras de comportamento e os textos
de interface.

**Criar.**

- **Digitando.** Numa linha fora de tabela, com o texto no formato `| a | b |` (começa e
  termina com `|`, pelo menos 2 células) e o cursor no fim da linha, `Enter` insere a linha
  delimitadora e uma linha vazia, e o foco vai para a primeira célula da linha nova. Se a linha
  de baixo já é uma delimitadora, `Enter` não faz nada de especial. `Shift+Enter` **nunca**
  converte.
- **Paleta de comandos e barra de formatação** inserem a mesma tabela padrão (2 colunas, 1
  linha de corpo, mais o cabeçalho): linha do cursor vazia — a tabela ocupa essa linha; linha
  com texto — a tabela entra depois dela, com uma linha em branco entre as duas; sempre fica
  uma linha em branco depois da tabela. Foco na primeira célula do cabeçalho com o texto todo
  selecionado — digitar substitui. Tudo numa transação só: um `Ctrl+Z` desfaz a inserção
  inteira.
- Paleta de comandos sem nota ativa, ou com a vista em somente leitura: toast "Abra uma nota
  para inserir uma tabela." em vez de inserir.

**Editar.**

- Faixas "+" no hover da tabela adicionam linha ou coluna no fim, e põem o foco na primeira
  célula nova.
- Alças de linha e de coluna: clicar abre o menu (inserir, mover, alinhar quando é coluna,
  excluir); arrastar reordena, `Esc` cancela.
- A linha de cabeçalho não tem alça de linha e não pode ser movida; colunas movem com o
  cabeçalho junto.
- Toda ação de arraste da tabela tem equivalente no menu (mover linha/coluna também por lá) —
  mesmo princípio de RF8.4.
- Todas as ações do menu rodam numa transação só (um `Ctrl+Z` desfaz). Excluir tabela remove o
  bloco inteiro e a linha em branco que sobrar, e é desfazível como qualquer outra edição —
  deixa o cursor onde a tabela começava. Inserir linha ou coluna põe o foco na primeira célula
  nova.

**Alinhamento.** `:---` esquerda, `:---:` centro, `---:` direita, `---` sem alinhamento
(renderiza à esquerda). O alinhamento de cada coluna é preservado em qualquer edição —
inclusive editar uma célula, inserir, mover e excluir linha ou coluna. Célula renderiza
alinhada conforme a coluna.

**Largura de coluna.** Arrastar a linha vertical entre duas colunas redimensiona a coluna da esquerda (ganha/perde largura) e a da direita (perde/ganha — soma zero). As demais não mudam. Largura mínima: 64px. No primeiro arrasto de uma tabela que era automática, a largura atual na tela vira proporção, gravada na linha delimitadora com pelo menos 4 traços por célula. Durante o arrasto só a tela muda; soltar grava numa transação só (um `Ctrl+Z` desfaz). `Esc` cancela. Clique duplo na linha volta à largura automática. Mover coluna leva a largura junto; excluir coluna redistribui; inserir coluna dá à nova a largura média. Vista somente leitura mostra as larguras, sem alça.

**Equivalente no menu:** item "Largura automática" (ícone `move-horizontal`) na seção coluna, só quando a tabela tem larguras.

#### Textos de interface

| Situação | Texto |
|---|---|
| Paleta de comandos | "Inserir tabela" |
| Botão na barra de formatação | "Tabela" |
| Sem nota ativa / vista somente leitura | "Abra uma nota para inserir uma tabela." |
| Cabeçalho padrão da tabela nova | "Coluna 1", "Coluna 2" |
| Faixa à direita da última coluna | "Adicionar coluna" |
| Faixa abaixo da última linha | "Adicionar linha" |
| Alça de linha | "Arraste para mover a linha. Clique para mais opções." |
| Alça de coluna | "Arraste para mover a coluna. Clique para mais opções." |
| Alça de largura (linha entre colunas) | "Arraste para ajustar a largura. Clique duas vezes para largura automática." |
| Menu — seção linha | "Inserir linha acima", "Inserir linha abaixo", "Mover linha para cima", "Mover linha para baixo", "Excluir linha" |
| Menu — seção coluna | "Inserir coluna à esquerda", "Inserir coluna à direita", "Mover coluna para a esquerda", "Mover coluna para a direita", "Alinhar à esquerda", "Centralizar", "Alinhar à direita", "Largura automática", "Excluir coluna" |
| Menu — tabela inteira | "Excluir tabela" |

### 3.4 Barra de formatação

- **Flutuante.** Aparece acima do texto selecionado enquanto o editor da nota tem foco e é
  editável. Sem seleção, só aparece se a linha do cursor estiver **vazia** — não há texto
  embaixo pra cobrir, e assim que a primeira letra é digitada ali a barra some no mesmo
  instante (é diferente da versão mais ampla — barra acima do cursor em qualquer linha — que
  existiu por um tempo e foi revertida por cobrir a linha de cima enquanto se digitava; o
  usuário pediu de volta essa versão restrita a linha vazia em 16/09/2026). Numa linha com
  texto, sem seleção, a barra não aparece.
- Some quando o foco sai do editor, na vista somente leitura, e quando o foco está dentro de
  uma célula de tabela (a célula é outro campo editável — a barra apontaria para o lugar
  errado).
- Na barra acoplada (abaixo), que fica sempre visível, os botões também funcionam sem seleção:
  negrito, itálico, riscado e código inserem o par de marcadores com o cursor no meio; título,
  citação, listas e checkbox agem na linha; link insere o modelo de link.
- **Acoplar.** Um botão fora da barra, à direita, "Acoplar embaixo", prende a barra no pé do
  painel da nota. Acoplada, a flutuante some; a faixa fica visível com ou sem foco no editor e
  os botões agem na última posição do cursor da nota daquele painel. "Desacoplar", no fim da
  faixa, volta ao modo flutuante. A preferência é da máquina (`settings.json`), vale para
  todas as notas e sincroniza entre janelas. Vista somente leitura não mostra nenhuma das duas.

### 3.5 Menu da aba

Clique direito numa aba abre o menu do app (`Menu`/`ItemMenu`), pedido do usuário em 16/09/2026:

| Item | Comportamento |
|---|---|
| "Renomear" | Mesmo diálogo e mesma regra do renomear da árvore: atualiza os links que apontam para o arquivo. |
| "Duplicar" | Salva o que está na tela (inclusive desenho) e cria a cópia na mesma pasta com o próximo nome livre (`Nome (2)`). Na nota, o H1 da cópia acompanha o nome novo. Abre a cópia numa aba. Se a nota não pôde ser salva (erro ou conflito), não duplica: "Não foi possível duplicar: salve ou resolva as alterações desta nota antes." |
| "Dividir à direita" / "Dividir abaixo" | Divide a partir desta aba. |
| "Fechar todas as outras abas desta janela" | Fecha as abas do quadro da aba clicada, menos ela. |
| "Fechar todas as abas desta janela" | Fecha todas as abas do quadro da aba clicada. |

- A Home nunca fecha por esses itens (doc 09 ADR-16): ela é a rede que impede o painel principal
  de ficar em branco. Fechar em lote salva cada aba como fechar uma por uma.
- **"Janela", nestes textos, é o quadro da divisão de tela** (o grupo de abas), não a janela do
  sistema (pedido do usuário, 16/09/2026). Com a tela dividida em dois quadros, fechar as abas de
  um nunca fecha as do outro.
- Aba em branco (`Ctrl+T`) só mostra os dois itens de fechar.
- **Com a aba em branco já ativa**, `Ctrl+T` de novo cria uma nota — não abre uma segunda aba em
  branco do lado — e `Ctrl+D` cria um desenho; os dois substituem a aba em branco (mesma regra
  de abrir qualquer arquivo com ela ativa, doc 09 ADR-16). Fora da aba em branco, `Ctrl+D`
  continua sendo o atalho nativo do Excalidraw para duplicar elemento (§6.1) e não faz nada no
  editor de texto — pedido do usuário, 16/09/2026.

### 3.6 Colar imagem na nota

- `Ctrl+V` com imagem na área de transferência e **sem texto junto** grava o arquivo em
  `anexos/Imagem colada YYYYMMDD-HHmmss.<ext>` (mesmo nome e pasta do canvas, doc 02 §3) e insere
  `![[anexos/Imagem colada ….<ext>]]` no lugar da seleção. Várias imagens: um embed por linha.
- Com texto junto (copiar de Word, Excel ou de uma página), o colar é o de texto normal — senão
  o parágrafo copiado viraria um print dele.
- Se a gravação falha, nada é inserido: "Não foi possível salvar a imagem em «anexos». Verifique a
  pasta nas preferências."
- Na nota, `![[imagem]]` aparece como a imagem, na largura da coluna (ou na do alias,
  `![[foto.png|400]]`). Com o cursor fora da linha, a imagem ocupa o lugar do texto; com o
  cursor na linha (ou clicando na imagem), o texto do embed aparece e a imagem fica logo abaixo.
- **Tamanho.** Ao passar o mouse, a imagem mostra uma alça no canto inferior direito. Arrastar
  muda a largura (mínimo 64px, máximo a largura da coluna), mantendo a proporção; ao soltar, a
  largura é gravada no alias (`![[foto.png|400]]`). Duplo clique na alça volta ao tamanho natural
  (tira o alias).
- **Lado a lado.** Embeds de imagem na mesma linha aparecem lado a lado, cada um na sua largura;
  o que não cabe desce para a linha de baixo. Arrastar uma imagem até a lateral de outra mostra
  um indicador vertical e, ao soltar, junta as duas na mesma linha do arquivo
  (`![[a.png|300]] ![[b.png|300]]`). Soltar entre linhas do texto (indicador horizontal) põe a
  imagem numa linha própria. `Esc` cancela; soltar no próprio lugar não muda nada. Clicar sem
  arrastar leva o cursor para a linha do embed. O equivalente sem arraste é editar o texto.
- Vista somente leitura mostra as imagens, sem alça nem arraste, e não aceita colar.
- Arrastar arquivo de imagem para a nota e `![](caminho)` com caminho relativo do vault ainda
  não funcionam (RF2.2).

## 4. Criação de notas por link

Clicar num `[[link não resolvido]]`:

1. Sanitiza o nome.
2. Se o nome sanitizado difere do escrito, mostra confirmação com o nome final.
3. Cria o arquivo vazio.
4. Abre na aba atual.
5. **Não** reescreve o link na nota de origem, mesmo que o nome tenha sido sanitizado — se sanitizou, o link continua não resolvido e o usuário decide. Reescrever texto que o usuário digitou sem ele pedir é pior do que um link quebrado visível.

## 5. Autocompletar de link

Ao digitar `[[`:

- Lista arquivos por relevância: correspondência no início do nome primeiro, depois em qualquer posição, depois alias.
- Mostra o caminho da pasta em cinza quando há mais de um arquivo com o mesmo nome.
- Inclui desenhos.
- Não inclui anexos, exceto se o usuário digitou uma extensão de imagem.
- A primeira opção é sempre "Criar «texto digitado»" quando não há correspondência exata.
- `Esc` fecha sem inserir nada e mantém os `[[` digitados.

## 5.1 Múltiplos vaults (janelas)

Detalhamento completo em `docs/12-multiplos-vaults.md` (fonte de tudo abaixo).

- Cada vault abre na sua própria janela. Abrir um vault que já está aberto **não** abre uma
  janela nova: foca a janela existente.
- Se a pasta de um vault (recente, ou o que a janela tentava abrir) não existe mais no disco,
  a operação falha como "indisponível" — a janela não abre, e a UI oferece "Remover da lista".
- "Remover da lista" só esquece o vault na lista de recentes do app. Nunca apaga pasta nem
  arquivo, e não fecha nenhuma janela que porventura já tenha esse vault aberto.
- Atualizar o app drena (`flush`) todas as janelas abertas antes de reiniciar — não só a janela
  onde o usuário clicou em "Atualizar agora". Uma janela que não responder ao pedido de flush
  dentro do tempo limite conta como falha, identificada pelo rótulo dela.
- Preferências da máquina (tema, largura da nota, sidebar colapsada, config do agente) são
  compartilhadas entre janelas: mudar numa janela propaga para as outras já abertas.

## 6. Canvas

### Post-it

**Removido** (doc 09, ADR-20). Não existe post-it no
Excalidraw original — o que existe é forma com texto dentro — e não existe slot público pra
adicionar uma ferramenta na toolbar nativa; decisão do usuário de não precisar de post-it como
ferramenta de primeira classe. Post-its já desenhados em notas antigas continuam renderizando
normalmente (são retângulo + texto vinculado, formato nativo do Excalidraw) — só não dá mais
pra criar um novo por um botão dedicado.

### Seleção de forma sem preenchimento

Retângulo, losango e elipse sem preenchimento (`transparent`) selecionam clicando em
**qualquer ponto dentro deles**, não só na borda — o Excalidraw por padrão só deixa selecionar
pela borda quando não tem preenchimento; ver doc 09 ADR-17 pro porquê disso não ser uma opção
nativa dele. Seta, linha e mão livre continuam exigindo clique em cima do traço — não têm
"dentro" fechado pra testar.

### Conectores

- Uma seta desenhada começando ou terminando sobre uma forma se prende a ela.
- Segurar `Ctrl` enquanto desenha **impede** a ligação.
- Mover ou redimensionar a forma move as pontas das setas ligadas.
- Apagar a forma apaga a ligação, **não** a seta: a seta fica solta no lugar onde estava.
- Uma seta pode ter rótulo; o rótulo acompanha o meio da seta.

### Texto dentro de forma

- Duplo clique dentro da forma entra em edição.
- O texto quebra na largura da forma; a forma cresce em altura conforme necessário.
- Diminuir a forma abaixo do necessário faz o texto transbordar visualmente, não corta.
- `Esc` sai da edição; texto vazio remove o elemento de texto e mantém a forma.

### Colar imagem

`Ctrl+V` com imagem na área de transferência:

1. Detecta o tipo pelo MIME e escolhe a extensão (`png`, `jpg`, `gif`, `webp`, `svg`).
2. Grava em `pastaDeAnexo(nota)/Imagem colada YYYYMMDD-HHmmss.<ext>` (a função está na seção 1 do documento 02).
3. Insere no canvas na posição do ponteiro, no tamanho natural, limitado a 800 px na maior dimensão.
4. Registra a referência em `## Embedded Files`.

Se a gravação falhar (pasta sem permissão, disco cheio), **nada é inserido** e o erro aparece: "Não foi possível salvar a imagem em «{pasta}». Verifique a pasta nas preferências." — com o nome real da pasta resolvida.

Colar uma **URL de imagem**: no MVP, insere como texto. Baixar imagem da internet é P2 e exige decisão explícita sobre rede.

### Links dentro do desenho

- Um elemento de texto cujo conteúdo inteiro é `[[Alvo]]` ou `[[Alvo|texto]]` é renderizado como link: exibe o texto (ou o alias) com um prefixo discreto, e clicar abre a nota.
- O wikilink está literalmente no arquivo `.md`, então o backlink funciona sem nenhum código de integração.
- `Ctrl+clique` abre em nova aba.
- Renomear a nota alvo reescreve o texto do elemento **e** o JSON da cena, na mesma transação.

### Limites de proteção

- Mais de 3 000 elementos numa cena: aviso não bloqueante sugerindo dividir o desenho.
- Imagem colada acima de 20 MB: recusa com o tamanho real na mensagem.

## 6.1 Teclado dentro do canvas

O Excalidraw embutido registra os próprios handlers de teclado, e alguns colidem com o app ou são destrutivos. A regra:

- **`Ctrl+Delete` é bloqueado.** No Excalidraw ele limpa a cena inteira, e isso viola o princípio "nada de destruição silenciosa". Desligar o item de menu por `UIOptions.canvasActions` **não** desliga o atalho.
- **Atalhos de aplicação passam para o app antes do canvas:** `Ctrl+S`, `Ctrl+O`, `Ctrl+P`, `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+\`, `Ctrl+Shift+F`. `Ctrl+O` e `Ctrl+Shift+F` abrem a mesma busca unificada (§8) mesmo com o canvas focado — `Ctrl+Shift+F` é a adição desta entrega.
- **Atalhos de edição ficam com o canvas:** `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+A`, `Ctrl+D`, `Ctrl+G`, `Ctrl+Shift+G`, `Ctrl+0`, `Ctrl++`, `Ctrl+-`, e as teclas únicas de ferramenta.
- `Ctrl+K` no canvas anexa link ao elemento selecionado (RF5.12); no editor de texto insere link markdown (RF2.11). Os contextos são disjuntos, e a coincidência é proposital: `Ctrl+K` é o atalho nativo do Excalidraw para isso.

A implementação é um `keydown` em fase de captura na raiz do painel de canvas, com uma lista explícita — nunca uma heurística.

## 7. Embed de desenho na nota

- Renderiza como SVG estático, com a área de conteúdo do desenho (bounding box de todos os elementos) mais uma margem de 16 px.
- Largura padrão: a largura disponível da coluna de texto, sem esticar acima do tamanho natural.
- Se o desenho estiver vazio: um bloco com hairline e o texto "Desenho em branco".
- Se o arquivo não existir: bloco de link não resolvido, com ação "Criar desenho".
- Clicar abre o desenho; `Ctrl+clique` abre em nova aba.
- Um desenho que embute a si mesmo (direta ou indiretamente) renderiza o bloco "Referência circular" em vez de entrar em laço. A detecção é um caminho de visita durante a resolução do embed.

## 8. Busca

Busca por título e por conteúdo numa janela só (RF4.6, RF4.8). Contrato completo — motor,
assinaturas de função e a lista de tarefas — em `docs/13-busca.md`; aqui ficam as regras de
comportamento e, abaixo, os textos de interface.

- Índice incremental: cada arquivo salvo ou alterado atualiza só o próprio documento no índice.
- **Uma busca só.** `Ctrl+O`, `Ctrl+Shift+F`, o campo "Buscar" da sidebar (e o ícone
  equivalente na faixa recolhida) e "Buscar" na paleta de comandos abrem a mesma sobreposição.
  A mesma tecla com a busca já aberta fecha.
- **Acento e caixa são ignorados**, na consulta e no índice: "reuniao" acha "Reunião".
- **Busca por título aceita palavra incompleta** (prefixo): "proj" acha "Projeto".
- **Termos em E na busca por conteúdo**: "reunião time" só traz nota com as duas palavras.
  Sintaxe: `"frase exata"` entre aspas, `-termo` exclui. Sem operadores avançados no MVP. A
  mesma função de busca por conteúdo, quando chamada pelo agente de IA com texto livre,
  continua em OU — não mudar esse comportamento (`docs/13-busca.md` §2.1).
- **Duas seções, uma lista só** (↑/↓ atravessa as duas): "Títulos" (até 6, instantâneo, casa
  H1/nome do arquivo/alias) e "No conteúdo" (debounce de 200 ms, até 20 arquivos, 3 trechos
  cada — só arquivo com trecho no corpo entra aqui; quem só casa pelo título não repete).
- **Campo vazio** mostra "Modificados recentemente": 8 notas e desenhos do vault por data de
  modificação, sem anexos.
- **Consulta sem título exato** oferece "Criar nota «consulta»", sempre por último. Cria na
  raiz do vault (mesma regra dos botões da sidebar) e abre.
- **Reabrir a busca na mesma sessão** traz a última consulta digitada, selecionada por inteiro
  (memória de sessão, não persiste em disco).
- **Abrir um resultado de conteúdo revela o trecho**: rola até a linha inteira e destaca
  (fade), sem abrir o painel de busca do editor e sem mover o cursor. Nota já aberta numa aba:
  ativa a aba e revela.
- **Resultado de conteúdo num desenho só abre o desenho** — canvas não tem linha para revelar.
- Textos dentro de desenhos aparecem na busca por conteúdo, identificados como desenho.
- Resultado da busca mostra no máximo 3 trechos por arquivo.

### Textos de interface

Contrato com `docs/13-busca.md` §3.

| Situação | Texto |
|---|---|
| Campo na sidebar | "Buscar" + atalho "CTRL O" |
| Botão na faixa recolhida | "Buscar" |
| Rótulo acessível da sobreposição | "Buscar" |
| Placeholder | "Buscar por título ou conteúdo…" |
| Seção | "Títulos" / "No conteúdo" / "Modificados recentemente" |
| Carregando conteúdo | "Buscando no conteúdo…" |
| Criar | "Criar nota «{consulta}»" |
| Sem resultado | "Nada encontrado para «{consulta}»." (já existente, seção 10) |
| Reindexando | "Reindexando o vault…" (já existente, seção 10) |
| Rodapé | "↵ abrir · Ctrl ↵ abrir ao lado · Esc fechar" |
| Paleta de comandos | "Buscar" |

## 9. Lixeira

- Restaurar quando já existe arquivo no destino: cria `Nome (restaurado).md` e avisa qual foi o nome final.
- Restaurar quando a pasta original não existe mais: recria a pasta.
- Esvaziar a lixeira quando há um arquivo dela aberto numa aba: fecha a aba primeiro.
- Um arquivo dentro de `.trash/` nunca é indexado, nunca aparece na busca, nunca conta como backlink.
- Se o usuário mexer manualmente em `.trash/` pelo Explorer, o `.index.json` fica desatualizado. O painel de lixeira lista o que está na pasta, usando o índice só para enriquecer com o caminho original; item sem registro aparece com "origem desconhecida" e só pode ser restaurado para a raiz do vault.

## 10. Erros e mensagens

Toda mensagem diz o que aconteceu e o que fazer. Nunca pede desculpa, nunca culpa o usuário, nunca mostra stack trace.

| Situação | Texto |
|---|---|
| Pasta escolhida sem permissão de escrita | "O Excalisidian não consegue escrever nesta pasta. Escolha outra ou ajuste as permissões." |
| Nome de arquivo inválido | "O nome não pode conter `< > : \" / \\ \| ? *`." |
| Nome reservado do Windows | "«CON» é um nome reservado pelo Windows. Escolha outro." |
| Nome já existe | "Já existe «Arquitetura» nesta pasta." |
| Caminho longo demais | "O caminho ficaria com 268 caracteres. O limite é 240." |
| Falha ao salvar | "Não foi possível salvar «Nota». O arquivo pode estar aberto em outro programa." |
| Arquivo mudou fora do app | "Este arquivo mudou fora do Excalisidian." + "Recarregar do disco" / "Manter minha versão" |
| Arquivo apagado fora do app | "Este arquivo não existe mais no disco." + "Recriar" |
| Imagem grande demais | "Esta imagem tem 34 MB. O limite é 20 MB." |
| Desenho pesado | "Este desenho tem 3 200 elementos. Considere dividir em desenhos menores." |
| Excluir com filhos | "Mover «Projetos» para a lixeira? 14 arquivos vão junto." |
| Esvaziar lixeira | "Excluir permanentemente 12 arquivos? Isso não pode ser desfeito." |
| Índice reconstruindo | "Reindexando o vault… 1 240 de 5 000" |
| Vault vazio | "Este vault está em branco." / "Crie a primeira nota ou o primeiro desenho." |
| Busca sem resultado | "Nada encontrado para «xyz»." |
| Lixeira vazia | "A lixeira está vazia." |
| Falha ao baixar atualização | "Não foi possível baixar a atualização. Tente de novo mais tarde." |
| Falha ao verificar atualização (comando manual) | "Não foi possível verificar atualizações." |

## 11. Decisões de produto que já estão tomadas

Registradas aqui para não serem redecididas durante a implementação.

1. **Sem diálogo de salvar.** Autosave sempre. Quem quer versão, usa Git.
2. **Sem modo de edição separado do modo de leitura como padrão.** Live preview é o padrão; leitura é opcional.
3. **Um desenho abre no canvas, não no editor de texto.** Para ver o markdown por trás existe um comando "Abrir como texto".
4. **Imagens são arquivos, não base64.** Sempre.
5. **A lixeira fica dentro do vault.** Não porque a lixeira do sistema seja ruim — Windows, macOS e Linux todos restauram para o caminho original — mas porque o painel de lixeira dentro do app (RF7.2, RF7.3) só é possível se a lixeira for uma pasta que o app consegue listar. Ver ADR-7.
6. **Não existe "projeto" nem "workspace" como entidade.** A pasta é a organização.
7. **Não existe tag no MVP.** Frontmatter é livre, mas o app não usa nada dele além de `aliases`.
8. **O app não normaliza o markdown do usuário.** Não reformata, não reindenta, não converte `*` em `-`. Só toca no que o usuário mandou tocar.

## 12. Atualizações

O app verifica sozinho se há uma versão nova ao abrir — silenciosa: se não achar nada ou a
rede falhar, não interrompe o usuário — e também por um comando manual, "Verificar
atualizações" (paleta de comandos e em Configurações).

| Contexto | Texto |
|---|---|
| Diálogo de oferta — título | "Atualização disponível" |
| Diálogo de oferta — descrição | "A versão {versão} está pronta para instalar." |
| Diálogo de oferta — aceitar | "Atualizar agora" |
| Diálogo de oferta — adiar | "Depois" |
| Diálogo de download — título | "Baixando atualização…" |
| Diálogo de download — progresso | "{porcentagem}%" |
| Diálogo pós-download sem reinício — título | "Atualização baixada" |
| Diálogo pós-download sem reinício — descrição | "Feche e abra o Excalisidian de novo para concluir." |
| Diálogo pós-download sem reinício — botão | "Fechar" |
| Diálogo de erro — título | "Não foi possível atualizar" |
| Diálogo de erro — botão | "Fechar" |
| Comando manual sem novidade | "Você já está na versão mais recente." |
| Comando na paleta de comandos | "Verificar atualizações" |
| Configurações — aba Geral, linha | "Atualizações" |
| Configurações — versão atual | "Versão {versão}" (vazio enquanto a versão não carrega) |

Os erros de rede ("Não foi possível baixar a atualização…" e "Não foi possível verificar
atualizações.") estão na tabela da seção 10, junto com as demais mensagens de erro do app.

## 13. Múltiplos vaults — textos de interface

Contrato com `docs/12-multiplos-vaults.md` §5 — nomes de comando e chaves de store saem de lá.

| Situação | Texto |
|---|---|
| Menu: criar | "Criar vault…" |
| Menu: abrir | "Abrir pasta como vault…" |
| Menu: remover | "Remover da lista" |
| Pasta sumiu | "A pasta deste vault não foi encontrada." |
| Diálogo: título | "Criar vault" |
| Diálogo: campo | "Nome" |
| Diálogo: local | "Local" / botão "Escolher…" |
| Diálogo: confirmar | "Criar vault" |
| Erro `nome_vazio` | "Dê um nome ao vault." |
| Erro `nome_invalido` | "O nome não pode ter / \ : * ? \" < > \| nem começar com ponto." |
| Erro `existe` | "Já existe uma pasta com esse nome nesse local." |
| Erro `pai_indisponivel` | "Não foi possível acessar o local escolhido." |
| Tela sem vault: título | "Nenhum vault aberto" (mantém) |
| Tela sem vault: lista | "Recentes" |

A tela sem vault ganhou tela de boas-vindas, nome do usuário e conteúdo de exemplo no primeiro
vault — ver seção 14, abaixo. Os textos antigos de apoio ("Crie um vault novo ou abra uma pasta
que já tem suas notas.") e os botões "Criar vault" / "Abrir pasta" desta tela saíram, substituídos
pelos textos da seção 14.

## 14. Onboarding: nome e primeiro vault

Contrato completo — telas, ordem dos blocos e contratos de código — em
`docs/15-onboarding.md` (fonte de tudo abaixo). Aqui ficam as regras de comportamento e os
textos de interface.

**Primeiro uso vs. retorno.** A tela de boas-vindas substitui a tela `sem-vault` do `App.tsx`
(inclusive quando uma janela nova abre sem vault). "Primeiro uso" é a lista de recentes vazia:
mostra título "Vamos começar", subtítulo e a explicação do que é um vault. No retorno (janela
nova sem vault, vault que sumiu), o título é "Nenhum vault aberto", a seção do vault se chama
"Criar vault" e a explicação do vault não aparece. O resto é igual. Erro de abertura usa a
mesma tela, com o título "Não foi possível abrir o vault" e a mensagem em `tom="erro"` no
lugar do subtítulo, sem o campo de nome.

**Nome `null` vs. `""`.** O campo "Como podemos te chamar?" só aparece quando o nome **nunca
foi informado** (`nomeUsuario === null`) — vem preenchido com a sugestão do sistema, editável,
e pode ficar vazio. Ele é gravado quando o usuário segue em frente ("Criar e começar", "Abrir
pasta" ou um recente): vazio grava `""`, que significa "informado, sem nome", e o campo não
volta a aparecer nunca mais. Quem já usa o app e nunca informou o nome não é interrompido: a
pergunta só existe na tela de boas-vindas do primeiro vault; até informar (inclusive pelas
Configurações), a saudação da Home sai sem nome.

**"Criar e começar" faz, nesta ordem:** grava o nome (se o campo estava visível); cria a pasta
do vault; abre o vault nesta janela; cria o conteúdo de exemplo (nota de boas-vindas e desenho
de exemplo); abre a nota de boas-vindas numa aba (a Home continua existindo, fixa). Se a
criação do conteúdo de exemplo falhar, o vault abre mesmo assim e um toast avisa: "O vault foi
criado, mas não foi possível criar a nota de boas-vindas." — a falha nunca impede o vault de
abrir.

**"Abrir pasta"** grava o nome, abre o diálogo nativo e abre a pasta escolhida como vault nesta
janela, **sem** criar conteúdo de exemplo — a pasta é do usuário, não um vault novo.

**"Criar vault…" da sidebar** (`DialogoCriarVault`, fora do onboarding) não muda e não cria
conteúdo de exemplo: conteúdo de exemplo é só do primeiro vault, pela tela de boas-vindas.

**Saudação da Home.** Usa só o nome informado (`nomeUsuario`); `null` ou `""` mostram só "Boa
tarde" (ou o equivalente do horário). A saudação nunca mais usa o usuário do sistema
operacional.

### Textos de interface

| Situação | Texto |
|---|---|
| Título, primeiro uso | "Vamos começar" |
| Subtítulo, primeiro uso | "Notas em Markdown e desenhos no mesmo lugar, em arquivos que são seus." |
| Título, retorno | "Nenhum vault aberto" |
| Título, erro | "Não foi possível abrir o vault" |
| Campo nome: rótulo | "Como podemos te chamar?" |
| Campo nome: ajuda | "Aparece na saudação da tela de início. Dá para mudar nas Configurações." |
| Seção vault, primeiro uso | "Seu primeiro vault" |
| Seção vault, retorno | "Criar vault" |
| Explicação do vault | "Um vault é uma pasta comum do seu computador. Suas notas e desenhos ficam nela como arquivos .md." |
| Campos | "Nome" / "Local" / "Escolher…" |
| Nome padrão do vault | "Notas" |
| Botão primário | "Criar e começar" |
| Alternativa | "Já tenho uma pasta com notas" / "Abrir pasta" |
| Recentes | "Recentes" |
| Falha no conteúdo de exemplo | "O vault foi criado, mas não foi possível criar a nota de boas-vindas." |
| Configurações: aba Geral, linha | "Seu nome" |
| Configurações: rótulo / ajuda | "Seu nome" (rótulo oculto, `sr-only`) / "Aparece na saudação da tela de início." |
| Arquivos de exemplo | "Boas-vindas", "Primeiro desenho" |

## 15. Agente de IA

Contrato completo — pipeline, provedores, estados e arquitetura — em `docs/11-agente-ia.md`
(fonte de tudo abaixo). Aqui ficam as regras de comportamento em caso de erro e os textos de
interface.

- **Opcional e silencioso.** Sem configuração, nenhum componente do agente (balão, painel,
  aba nas Configurações além do botão) aparece de outra forma além do próprio botão
  "Configurar agente". Configura-se pelas Configurações (`Ctrl+,`), aba "Agente de IA" — não
  existe atalho de teclado nem item de paleta de comandos dedicado.
- Nada é gravado até o botão final do assistente ("Ativar agente"): fechar o assistente no
  meio do caminho não deixa configuração pela metade.
- **Erros de provedor nunca bloqueiam a escrita.** O balão muda para o estado de erro (ícone em
  `bordo`) e o editor da nota segue intocado; clicar no balão mostra o texto do erro no rodapé
  do painel.
- **Gateiro (leitura inicial) que falhou** (rede, ou resposta que não parseou) não vira faixa
  nem toast: fica só na linha de status do rodapé do painel, e a nota pode tentar de novo.
  **Gateiro que decidiu não participar** desta vez também só aparece ali.
- **Limpar memória** pede confirmação destrutiva antes de apagar resumos, fatos, participações
  e conversas do agente — as notas do vault nunca são afetadas.
- **Testar conexão** (Configurações) reaproveita o mesmo texto de erro do provedor; sucesso
  mostra "Conexão funcionando.".

### Textos de interface

| Situação | Texto |
|---|---|
| Configurações: aba | "Agente de IA" |
| Configurações: aviso sem configuração | "Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite." |
| Configurações: botão sem configuração | "Configurar agente" |
| Configurações: linha "Agente" | "Ativo · {provedor}" / "Desligado · {provedor}" — botão "Desligar agente" / "Ligar agente" |
| Configurações: linha "Modelos" | "{modelo gateiro} · {modelo assistente}" — botão "Reconfigurar" |
| Configurações: linha "Conexão" (só com o agente ligado) | "Confere se o provedor responde com a sua chave." — botão "Testar conexão" |
| Configurações: linha "Pasta do agente" | "Arquivos do agente neste computador." — botão "Abrir pasta" |
| Configurações: linha "Memória" | "Resumos, fatos, participações e conversas. As notas não são afetadas." — botão destrutivo "Limpar memória" |
| Limpar memória (confirmação) | "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas." |
| Limpar memória (toast) | "Memória do agente apagada." |
| Teste de conexão bem-sucedido | "Conexão funcionando." |
| Assistente: passos | "Provedor" · "Chave da API" · "Leitura inicial" · "Acompanhamento" · "Revisão" |
| Assistente: navegação | "Voltar" / "Continuar" / "Ativar agente" |
| Assistente: descrição no topo | "Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite." |
| Assistente: provedor sem chave | "«Provedor» roda na sua máquina — não precisa de chave." |
| Assistente: chave, link | "Onde consigo uma chave?" |
| Assistente: campo avançado | "Avançado · Base URL" |
| Assistente: rótulo do passo 3 | "Modelo da leitura inicial — barato e rápido, só decide se vale convidar" |
| Assistente: rótulo do passo 4 | "Modelo do acompanhamento — o que lê a nota e traz as sugestões" |
| Assistente: listagem de modelos falhou | "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome." |
| Assistente: campo sem chave preenchida | "Cole a chave da API para continuar." |
| Assistente: opção fora da lista | "Outro modelo…" / selo "Sugerido" |
| Assistente: revisão — pesquisar na web | "Permitir que o agente pesquise na web" |
| Assistente: revisão — teto de gasto | "Limite diário de gasto em US$ (opcional)" |
| Assistente: salvar (toast) | "Agente ativado." / "Configuração do agente salva." |
| Balão: tooltip por estado | "Agente" (ocioso/desligado) · "Agente — acompanhando esta nota" (observando) · "Agente — pensando" · "Agente — pausado" · "Agente — erro" |
| Painel: cabeçalho | "Agente" + pausar/retomar + fechar |
| Painel: convite | "Esta nota parece tratar de **{tema}**. Quer que eu acompanhe?" + "Aceitar" / "Agora não" / "Recusar" |
| Painel: sugestões — ações | "Copiar" (toast "Sugestão copiada." / "Não foi possível copiar.") e "Dispensar" |
| Painel: memória expansível | "O que o agente aprendeu ({n})" + "Apagar fato" por item |
| Painel: campo de conversa | "Perguntar sobre esta nota" |
| Painel: sem nada ainda | "Pergunte algo sobre a nota aberta." |
| Painel: pensando | "pensando…" |
| Painel: gateiro decidiu não participar | "O agente leu esta nota e decidiu não participar por enquanto." |
| Painel: análise do gateiro falhou | "A análise desta nota falhou. O agente tenta de novo quando você escrever mais." |
| Erro — chave recusada (401/403) | "A chave da API foi recusada pelo provedor. Confira a chave nas configurações." |
| Erro — cota do provedor (429) | "O provedor limitou as chamadas agora. Tente de novo em instantes." |
| Erro — modelo inexistente (404) | "O provedor não conhece o modelo «{modelo}». Confira o nome nas configurações." |
| Erro — base URL fora do escopo permitido | "A base URL configurada está fora das permissões do app. Verifique o campo avançado nas configurações." |
| Erro — resposta não entendida | "O provedor devolveu uma resposta que não pude entender. Tente outro modelo." |
| Erro — sem conexão | "Sem conexão com o provedor. Verifique a rede e tente de novo." |
| Erro — provedor fora do ar / genérico | "Não foi possível falar com o provedor. Verifique a conexão." |

**Limite diário de gasto:** o campo existe no assistente e é gravado na configuração, mas hoje
nada no código consulta esse valor para bloquear uma chamada nem para avisar que o teto foi
atingido — **não implementado** além do campo e do armazenamento (`docs/11-agente-ia.md` §7
descreve um toast de teto atingido que não existe no código; ver relatório).

## 16. Atalhos e símbolos

Decisões de arquitetura em doc 09, ADR-29; componentes no inventário do doc 06. Aqui ficam as
regras de comportamento e os textos de interface (RF8.3). O glossário só lista o que funciona
no código: os catálogos (`src/app/glossario/`) têm testes que conferem os atalhos contra os
keymaps do editor e os símbolos contra o parser markdown do editor.

**Onde fica.** Nas Configurações, aba "Geral", uma linha "Atalhos e símbolos" com uma ajuda e um botão compacto "Abrir glossário". O glossário abre como um segundo `Dialog` por cima das Configurações — a pilha de diálogos já existe, então Esc fecha só o glossário.

**Comportamento.** Abre por cima das Configurações; Esc fecha o glossário e devolve o foco ao botão. Filtro ignora acento e caixa. Teclas de modificador são mostradas por plataforma (Mod vira Ctrl no Windows/Linux e ⌘ no macOS; Alt vira ⌥ no macOS). `Ctrl+K` no editor insere link markdown (RF2.11).

**Divergência registrada** (doc 09, ADR-29): doc 03 diz Ctrl+E = modo leitura e Ctrl+` = código; o código usa Ctrl+E = código e não tem modo leitura nem Ctrl+`.

### Textos de interface

| Situação | Texto |
|---|---|
| Configurações: aba Geral, linha | "Atalhos e símbolos" |
| Configurações: ajuda | "Tudo o que dá pra fazer pelo teclado e os símbolos que formatam o texto." |
| Botão | "Abrir glossário" |
| Diálogo: título | "Atalhos e símbolos" |
| Filtro: rótulo | "Filtrar" |
| Filtro: placeholder | "Filtrar por ação, tecla ou símbolo…" |
| Abas | "Atalhos" / "Símbolos" |
| Sem resultado | "Nada encontrado para «{consulta}»." |
| Separador de combos alternativos | "ou" |
| **Grupos de atalhos** | "Geral", "Abas e divisões", "Nota: formatação", "Nota: edição", "Nota: localizar", "Desenho" |
| **Grupos de símbolos** | "Texto", "Blocos", "Links e embeds", "Enquanto você digita" |

## 17. Sincronização

Contrato completo — chaves, o diário, o ciclo, o servidor — em `docs/17-sincronizacao.md`
(fonte de tudo abaixo). Aqui ficam os textos de interface: a seção "Sincronização" das
Configurações (doc 17 §7) e o `title` do ícone de estado no rodapé da sidebar (doc 17 §8,
`StatusSync` em `src/estado/syncStore.ts`). Os textos entram no catálogo
`src/i18n/catalogo/sync.ts` (pt-BR e inglês), no padrão de `src/i18n/catalogo/conta.ts`. Sentence
case, sem emoji, sem os termos técnicos do doc 17 (nada de "envelope", "hash" ou "retrato" na
tela — a pessoa não precisa saber como o diário funciona por dentro).

A seção mostra um destes cinco estados por vez (doc 17 §7):

1. Sem conta.
2. Conta grátis.
3. Premium, mas este computador ainda não tem a chave guardada — pede a senha da conta antes de
   ligar ou baixar qualquer vault.
4. Premium, vault atual não sincronizado.
5. Vault sincronizado.

## 18. Busca nas Configurações

Um campo na coluna de navegação das Configurações, logo abaixo do título e acima das abas —
filtra as linhas de todas as abas por título, descrição e termos extras que só existem para a
busca (não aparecem na tela). É o foco inicial ao abrir o diálogo: dá pra digitar assim que ele
abre, sem clicar em nada primeiro.

**Comportamento.** Com o campo vazio, as Configurações funcionam como sempre (abas, uma de cada
vez). Com texto no campo, nenhuma aba fica destacada — os resultados não pertencem a uma aba só
— e o conteúdo mostra, na ordem das abas, só as linhas que casaram, agrupadas sob o nome da aba.
São as linhas de verdade, com os controles funcionando normalmente ali — não é uma lista de
atalhos para outro lugar. A seção Conta casa (ou não) inteira, como uma linha só. Sem o agente
configurado, "Configurar agente" é a única entrada possível da aba Agente de IA; com o agente
configurado, cada ação (ligar/desligar, modelos, conexão, pasta, memória) é uma entrada
independente. Nenhum resultado: uma mensagem centralizada. Clicar numa aba, ou navegar até ela
pelas setas, limpa a busca e abre a aba escolhida. Esc com o campo vazio fecha as Configurações,
como em qualquer diálogo; Esc com texto no campo só limpa o campo.

### Textos de interface — Sincronização

| Situação | Texto |
|---|---|
| Seção — sem conta | "Entre com uma conta premium para sincronizar este vault entre computadores." |
| Seção — conta grátis | "A sincronização é um recurso do plano premium." |
| Pedir senha (chave ainda não guardada neste computador) — título | "Confirme sua senha" |
| Pedir senha — ajuda | "Guardamos uma chave neste computador para não pedir de novo." |
| Pedir senha — campo | "Senha" (mesmo `Campo` da seção Conta) |
| Senha errada | "Senha incorreta." |
| Botão — ligar a sincronização deste vault | "Sincronizar este vault" |
| Botão — baixar um vault existente | "Baixar um vault sincronizado para uma pasta vazia" |
| Pasta escolhida não está vazia | "Escolha uma pasta vazia para baixar o vault." |
| Botão — sincronizar agora | "Sincronizar agora" |
| Botão — parar | "Parar de sincronizar este vault" |
| Botão — apagar no servidor | "Apagar a cópia do servidor…" |
| Confirmação de apagar no servidor — título | "Apagar a cópia de «{vault}» no servidor?" |
| Confirmação de apagar no servidor — corpo | "Os arquivos deste e de qualquer outro computador continuam intactos. Só a cópia guardada no servidor é apagada." |
| Confirmação de apagar no servidor — botão | "Apagar cópia do servidor" |
| Campo — nome deste computador | "Nome deste computador" |
| Lista de arquivos fora da sincronização — título | "Fora da sincronização" |
| Lista de arquivos fora da sincronização — ajuda | "Estes arquivos passam de 7 MB e ficam só neste computador." |
| Status (ícone e seção) — sincronizado | "Sincronizado" |
| Status — sincronizando | "Sincronizando…" |
| Status — sem conexão | "Sem conexão. Tentando de novo sozinho." |
| Status — pausado | "Sincronização pausada." |
| Erro — sessão expirada (`sessao`) | "Sua sessão expirou. Entre de novo para continuar sincronizando." |
| Erro — plano sem sincronização (`plano`) | "Seu plano não inclui mais a sincronização." |
| Erro — espaço esgotado (`espaco`) | "O espaço do seu plano acabou. Libere espaço ou amplie o plano para continuar sincronizando." |
| Erro — genérico (demais códigos: falha ao aplicar um lote, erro do servidor, vault não encontrado, etc.) | "Não foi possível sincronizar agora. Tentando de novo sozinho." |

### Textos de interface — Busca nas Configurações

| Situação | Texto |
|---|---|
| Campo: rótulo (oculto) / placeholder | "Buscar nas configurações" / "Buscar" |
| Cabeçalho do conteúdo, com busca ativa | "Resultados" |
| Nenhum resultado | "Nada encontrado para «{consulta}»." |
