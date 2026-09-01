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
  não é o título) e sair da linha (mover o cursor pra outra linha, não a cada tecla) dispara
  um rename de verdade, com a mesma reescrita de backlinks de um rename pela árvore.
- Título vazio (usuário apaga o H1 inteiro) não dispara rename nenhum — a nota fica sem H1
  até o usuário digitar algo ou renomear pelo arquivo.
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

- **Enter** divide o bloco em dois: grava uma **linha em branco** no arquivo. É o que faz
  "bloco novo" ser verdade no disco, não só na tela — dois parágrafos sem linha em branco entre
  eles são um parágrafo só pra qualquer leitor de Markdown.
- **Shift+Enter** quebra dentro do **mesmo** bloco: grava uma **quebra de linha simples**
  (`\n`), sem os dois espaços do hard break do CommonMark — arquivo mais limpo, compatível com
  o que o Obsidian escreve.
- Essa distinção só vale para parágrafo e heading soltos (filhos diretos do documento). Dentro
  de lista, citação, bloco de código ou tabela, Enter continua fazendo o que já fazia (continuar
  a lista, por exemplo) — nunca abre linha em branco ali.
- **Mudar o Enter não reformata nota nenhuma já existente** (§11.8): uma nota antiga onde as
  linhas foram separadas só por Enter simples continua sendo lida como um parágrafo de várias
  linhas — o app não sai inserindo linha em branco em texto que o usuário não tocou.
- **Clique triplo** seleciona o bloco inteiro (inclusive um parágrafo de várias linhas feito com
  Shift+Enter), nunca a linha em branco depois dele.
- **Mover bloco** é só pela alça (⠿) que aparece ao passar o mouse — sem atalho de teclado.
  Arrasta um bloco pra antes ou depois de outro **do mesmo nível**: parágrafo/heading/citação
  soltos entre si, ou item de lista dentro da própria lista. Um título (H1) tem seu próprio
  bloco — mover pela alça na linha do título move só aquela linha, nunca a seção inteira que
  vem depois dela.

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
- **Atalhos de aplicação passam para o app antes do canvas:** `Ctrl+S`, `Ctrl+O`, `Ctrl+P`, `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+\`.
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

- Índice incremental: cada arquivo salvo ou alterado atualiza só o próprio documento no índice.
- Busca por nome (quick switcher) é aproximada e prioriza correspondência no início.
- Busca por conteúdo é por termo, com `"frase exata"` entre aspas e `-termo` para excluir. Sem operadores avançados no MVP.
- Textos dentro de desenhos aparecem na busca por conteúdo, identificados como desenho.
- Resultado da busca mostra no máximo 3 trechos por arquivo.

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
| Sem backlinks | "Nenhuma nota aponta para esta ainda." |
| Lixeira vazia | "A lixeira está vazia." |

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
