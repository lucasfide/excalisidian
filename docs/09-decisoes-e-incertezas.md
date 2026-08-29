# 09 — Decisões, o que foi verificado e o que não foi

Este documento existe para você não tratar o resto do pacote como verdade absoluta. Leia antes de codar.

---

## Parte 1 — Decisões de arquitetura (ADRs curtos)

Cada ADR tem uma **condição de reversão**. Um ADR sem condição de reversão é preferência disfarçada de decisão.

### ADR-1 · Desenho é markdown

**Decisão:** desenhos são `.draw.md`, com frontmatter, seções de texto e links em markdown legível, e a cena em JSON dentro de um code fence.

**Alternativa rejeitada:** JSON puro num arquivo próprio, como o Excalidraw original.

**Consequência boa — uma, não quatro.** O ganho real é que o texto escrito dentro do desenho fica pesquisável pela mesma busca das notas, e um `[[link]]` num elemento de texto aparece nos backlinks da nota alvo sem nenhum código de integração, porque o link está literalmente no arquivo `.md`. Isso é o que justifica a decisão.

As outras três vantagens que a versão anterior deste documento alegava **não vêm do markdown**: diff de Git legível vem do ADR-2 (JSON indentado), "abrir no Bloco de Notas" vem de o arquivo ser texto, e "o id do elemento vira block id de graça" **é falso** — ids do Excalidraw são nanoid com `_`, que block id de markdown não aceita, então existe uma tradução (seção 3.1 do documento 02) que é código e é risco.

**Consequência ruim:** o parser híbrido é a peça mais frágil do produto inteiro. Escaping de `%%`, de crases, de linhas que imitam heading, de linha em branco dentro de texto multilinha, mais o mapeamento de blockId. É ali que os bugs vão morar, e é por isso que os testes 1, 2, 8 e 9 do documento 05 existem.

**Condição de reversão:** se o parser passar de duas semanas de trabalho ou começar a corromper arquivos em uso real, o caminho de volta é gravar JSON puro em `.draw` e construir os backlinks de desenho pelo índice do próprio app, em vez de de graça. O produto continua funcionando; perde-se a interoperabilidade com ferramentas externas.

### ADR-2 · JSON legível, com escape hatch de compressão

**Decisão:** a cena é gravada indentada, sem compressão, num fence de linguagem `draw-json`. O parser reconhece também `draw-json-lz`, comprimido, e o app troca para essa variante acima de 1,5 MB.

**Alternativa rejeitada:** comprimir sempre, como o plugin do Obsidian faz.

**O que mudou nesta revisão:** a versão anterior dizia "reavaliar acima de ~2 MB", o que é uma dívida disfarçada de nota — reavaliar depois significaria reescrever todos os arquivos existentes. Declarar as duas linguagens de fence agora torna a compressão uma opção de configuração, não uma migração.

**Consequência ruim:** a ordem das chaves de cada elemento precisa ser estável e os campos voláteis (`version`, `versionNonce`, `updated`) precisam ser omitidos. Esse é um imposto permanente: toda vez que a serialização mudar, o RNF7 e o teste 2 vão cobrar.

**Condição de reversão:** se manter a ordem estável se mostrar impossível de garantir, o honesto é desistir do RNF7 e ligar compressão sempre — um diff ilegível é melhor do que um diff que aparece sem o usuário ter feito nada.

### ADR-3 · Imagens são arquivos, não base64

**Decisão:** o mapa `files` da cena fica vazio em disco; as imagens são arquivos no vault, referenciadas por `fileId → [[caminho]]`.

**Consequência ruim:** o desenho passa a depender de arquivos externos. Mover ou apagar uma imagem por fora quebra a referência — mitigado quando a operação passa pelo app, que atualiza o link.

**Buraco conhecido:** a especificação não define o que o canvas mostra quando o arquivo referenciado não existe mais. Deve ser um retângulo com hairline e o nome do arquivo faltante, não um espaço vazio.

**Condição de reversão:** nenhuma. Essa é a decisão mais sólida do conjunto — base64 num vault versionado é indefensável.

### ADR-4 · CodeMirror 6, não ProseMirror

**Decisão:** o editor tem o texto markdown como fonte da verdade, e o live preview é feito com decorations.

**Motivo:** Milkdown e TipTap são ProseMirror, onde o documento em memória é uma árvore e o markdown é serializado na saída. O round-trip não é fiel: espaçamento, tipo de marcador de lista e HTML inline se perdem ou normalizam. Num app cujo princípio número 1 é "os arquivos são o produto", isso é eliminatório.

**Consequência ruim:** é a parte mais cara de construir. Semanas, não dias.

**Condição de reversão:** nenhuma que valha. Se o custo assustar, o corte certo é na cobertura de sintaxe do live preview, não na escolha do editor.

### ADR-5 · Tauri, não Electron

**Decisão:** Tauri v2.

**Consequência ruim:** exige Rust em quatro pontos e o app fica dependente do WebView2 instalado na máquina, cuja versão você não controla.

**Correção em relação ao raciocínio original:** WebView2 é Chromium, e Electron também. Se o canvas não fizer 60 fps, trocar de shell provavelmente **não** resolve — a causa estará na cena, no React ou nas flags de GPU. O plano B correto é reduzir a cena e revisar re-renders. A `VaultAdapter` continua valendo, mas por outros motivos: testar sem disco e permitir um modo web.

**Condição de reversão — esta faltava, e é o que torna o ADR utilizável:** trocar para Electron quando (a) a superfície de Rust passar dos quatro comandos previstos, ou (b) o projeto precisar de algo que só existe em Node no processo principal — sqlite nativo, git embutido, indexação pesada fora do WebView. Desempenho de canvas, por si só, **não** é motivo.

### ADR-6 · Cache e layout fora do vault, preferências do vault dentro

**Decisão:** layout de abas (um arquivo por vault), índice e busca em `%APPDATA%`. As preferências que descrevem o vault ficam em `.excalisidian/vault.json`, dentro dele.

**Motivo:** o Obsidian coloca o `workspace.json` dentro do vault e a própria documentação recomenda pôr no `.gitignore`, porque muda a cada arquivo aberto. Deixar fora resolve isso e evita que o app dispare o próprio file watcher. Já as preferências de anexo e de formato de link descrevem aquele conjunto de arquivos e devem viajar com ele.

**Consequência ruim:** o layout de abas não viaja entre máquinas. Aceito.

**Condição de reversão:** nenhuma prevista.

### ADR-7 · Lixeira dentro do vault — decisão mantida, motivo corrigido

**Decisão:** `.trash/` na raiz do vault, com índice próprio. Default do campo `trash`.

**O motivo antigo estava factualmente errado.** A versão anterior dizia que a lixeira do Windows "não sabe restaurar para o caminho original". Ela sabe: cada item excluído gera um par `$R…`/`$I…` em `C:\$Recycle.Bin\<SID>\`, e o `$I` guarda o caminho original completo, o timestamp e o tamanho — é isso que o "Restaurar" usa. O macOS faz o mesmo com "Put Back", e no Linux a spec FreeDesktop guarda `Path=` no `.trashinfo`. Três sistemas operacionais fazem exatamente o que o documento afirmava que eles não fazem.

**O motivo que sobrou, e que sustenta a decisão:** RF7.2 e RF7.3 são P0 — um painel de lixeira dentro do app, com nome, caminho original, data e botão de restaurar. Isso só é possível se a lixeira for uma pasta que o app consegue listar. Para a lixeira do sistema, o crate `trash` expõe listar e restaurar em `os_limited`, **disponível só em Windows e Linux** — no macOS não há como enumerar. Ou seja: com a lixeira do SO, o painel não existe de forma portável.

**Consequência ruim:** ocupa espaço no vault, é sincronizada por Git e Dropbox, e o `.trash/.index.json` é um arquivo de estado próprio que pode dessincronizar se o usuário mexer na pasta pelo Explorer — comportamento já especificado na seção 9 do documento 04. E mantém "esvaziar a lixeira" como a única ação irreversível do produto, o que atrita com o princípio 4.

**Implementação do modo `system` (RF7.6, P2):** o `@tauri-apps/plugin-fs` **não tem** função de lixeira — o `remove` dele é exclusão permanente, e o pedido de `trashItem` no Tauri está aberto desde 2022. O caminho é o crate `trash` (versão 5.2.6, MIT, Windows/macOS/Linux) exposto como um quinto comando Rust de umas doze linhas. Baixo custo, e vale registrar agora para ninguém descobrir na Fatia 8 que o `plugin-fs` resolvia — não resolve.

**Condição de reversão:** se o painel de lixeira for rebaixado de P0, a lixeira do sistema passa a ser a escolha melhor, porque elimina a última ação irreversível do produto.

### ADR-8 · Extensão `.draw.md`, e não `.excalidraw.md`

**Decisão:** desenhos usam `.draw.md`. Em wikilink, a forma canônica é `[[Nome.draw]]`.

**Restrição de origem:** não usar a marca Excalidraw na extensão.

**Alternativas consideradas:**

| Opção | Por que não |
|---|---|
| `.canvas` (JSON Canvas) | É o formato aberto que o Obsidian publicou, e seria a resposta "padrão de mercado" — mas o spec 1.0 tem exatamente quatro tipos de nó (`text`, `file`, `link`, `group`) e arestas de topologia. **Não existe traço à mão livre, nem estilo de traço, nem seta com geometria própria.** Usar `.canvas` para guardar uma cena Excalidraw seria gravar dados não conformes num arquivo que anuncia conformidade. Serve como import/export com perda, nunca como armazenamento. |
| `.svg` com a cena embutida | SVG é padrão de verdade e o arquivo abre em qualquer lugar. Mas aí o desenho deixa de ser markdown, e o único ganho real do ADR-1 — busca e backlink no texto do desenho — vai embora. |
| `.sketch`, `.drawio`, `.board` | `.sketch` é da Sketch, `.drawio` é do diagrams.net. `.board` está livre, mas não diz nada. |
| Só `.md`, distinguindo por frontmatter | Tecnicamente funciona, porque a detecção já é pelo frontmatter. Wikilinks ficariam mais limpos. Mas você perde a capacidade de saber o que é um arquivo sem abrir — no Explorer, no `git log`, num `ls`. Custo alto para ganho cosmético. |

**Por que `.draw` está livre:** nenhum tipo MIME registrado na IANA, nenhum software vivo. A única associação histórica é o DrawFile do RISC OS. E o ponto que encerra a questão: a extensão efetiva do arquivo é `.md` — `.draw` é parte do nome base, então nenhum handler de `.draw` é acionado em sistema nenhum.

**Nota sobre o campo `"type": "excalidraw"`** dentro do JSON da cena: fica. É o discriminador do schema de dados, é o que permite copiar o bloco e abrir no excalidraw.com, e não é nome de produto nem extensão.

**Condição de reversão:** se um dia a interoperabilidade com o plugin do Obsidian se tornar um objetivo, `.excalidraw.md` volta a ser a extensão certa — e aí a decisão é de risco de marca, não técnica.

### ADR-10 · Editor de live preview vendorizado, não escrito do zero

**Decisão (Fatia 2, 28/08/2026):** o live preview do editor é o pacote
`@atomic-editor/editor` 0.6.2, **copiado para dentro do repositório** em `src/editor/atomico/`
(tag `v0.6.2`, commit `b6ed65f`, MIT), e não uma dependência do npm nem código escrito à mão.

**Alternativa rejeitada:** escrever as *decorations* do CodeMirror do zero — o plano B do
`docs/08`, estimado em semanas.

**O que a avaliação encontrou** (feita por pesquisa direta do repositório e do código, não
pelo meio dia de teste manual que o `docs/05` sugeria):

- Corrige o **item 4 da Parte 3** deste documento: o pacote não tem "pouca tração" — são 135
  estrelas, 13 forks e ~15.000 downloads/mês. O mantenedor único está confirmado.
- Cobre a Fatia 2 inteira (`inline-preview.ts`, 45 KB — a peça cara) e adianta a Fatia 3
  (`wiki-links.ts`, com `suggest()`/`resolve()`), a Fatia 6 não (tabelas WYSIWYG existem mas
  não são requisito) e o `==destaque==`.
- O princípio declarado do pacote — *"raw markdown is the source of truth; decorations
  view-only; copy/paste/save byte-a-byte idênticos"* — é o **ADR-4** deste documento, já
  implementado e com suíte de testes própria.
- Portão de decisão validado no app: heading/negrito/itálico renderizam, a sintaxe reaparece
  na linha do cursor, o autosave da Fatia 1 segue funcionando, e abrir e fechar uma nota sem
  editar **não** gera diff no Git (round-trip fiel — protege o RNF7).

**Por que vendorizar em vez de depender do npm:** um mantenedor único é risco real. Copiar o
código elimina o risco de abandono, elimina migrações de versão futuras (mesma lógica do
Excalidraw pinado em 0.18.1), e permite reescrever o tema por dentro (`atomic-theme.ts`,
`styles/inline-preview.css` — ambos já são 100% dirigidos por variáveis `--atomic-editor-*`)
mapeando para os tokens do `globals.css`, em vez de brigar com a especificidade do CSS dele.

**Consequência ruim:** ~180 KB de TypeScript de terceiros no repositório, que ninguém aqui
escreveu. Correções de bug do upstream não chegam de graça — é preciso comparar e portar à
mão. A suíte de testes do upstream não foi trazida (exige `happy-dom` + testing-library no
vitest); se um dia mexermos na lógica de *decoration* e não só no tema, ela vem junto.

**Duas pendências abertas por causa da adoção, a tratar depois da Fatia 2:**

1. ~~**Marginália (doc 06) adiada.**~~ **Removida.** O bug geométrico do ADR-10 (duas
   centralizações competindo) foi corrigido, e a marginália chegou a funcionar tecnicamente
   — mas o gutter do CodeMirror estica pela altura inteira do painel independente do tamanho
   do texto, e numa nota curta isso produz uma faixa vazia grande com um marcador solto no
   topo. Testada em tela pela primeira vez, a reação foi rejeição direta ("achei uma merda").
   Decisão de produto: remover por completo, não simplificar. `marginalia.ts`/`.css` foram
   apagados, e a seção "Elemento de assinatura" do doc 06 foi reescrita para registrar a
   remoção. O `container-name: editor` que existia só para o breakpoint de 760px da margem
   também saiu do `PainelDocumento`.
2. **Frontmatter YAML renderiza como markdown.** `aliases:` e `created:` aparecem grandes,
   e `[App]` vira link. O conteúdo em disco não é alterado (o motor é source-of-truth), só
   a exibição fica errada. Tratar junto com o parsing de `FileMeta` na Fatia 3.

**Condição de reversão:** se o código vendorizado se mostrar difícil de mexer, ou se um bug
estrutural no live preview não for corrigível em tempo razoável, o caminho de volta é o plano
B do `docs/08` — decorations próprias com cobertura reduzida (headings, ênfase, listas e
links primeiro; o resto em sintaxe visível). O `EditorNota.tsx` isola o motor atrás de um
contrato de 4 props, então a troca não toca `vaultStore`, `useAutosave` nem `BarraStatus`.

### ADR-11 · O filtro de tema escuro do Excalidraw fica desligado

**Contexto:** ao testar o canvas em tela (29/08/2026), a cor branca escolhida no painel
aparecia como um cinza escuro sobre o fundo escuro do app — quase ilegível.

**Causa, confirmada por grep no bundle (`node_modules/@excalidraw/excalidraw/dist/prod/index.css`):**
o Excalidraw não recolore elemento nenhum quando `theme="dark"`. Ele aplica um filtro CSS no
`<canvas>` inteiro:

```css
.excalidraw.theme--dark { --theme-filter: invert(93%) hue-rotate(180deg); }
.excalidraw.theme--dark canvas { filter: var(--theme-filter); }
```

Como o Excalisidian já alimenta o Excalidraw com a própria paleta escura (14 tokens
desenhados à mão, doc 06 §295-334), o tema estava sendo aplicado duas vezes: uma vez pela
nossa paleta, outra pelo filtro. Isso colide de frente com o doc 06 §59: *"o tema escuro não
é inversão automática: o papel escurece para um marrom-tinta [...] e as cores clareiam para
manter contraste"* — o produto sempre foi projetado para ter as duas paletas hand-picked, não
uma sendo a inversa da outra.

**Decisão:** `src/canvas/excalidraw-excalisidian.css` desliga o filtro
(`.excalisidian-canvas .excalidraw.theme--dark canvas { filter: none !important; }`). O
Excalidraw continua recebendo `theme="dark"` — isso ainda escurece o chrome dele que não
tocamos (biblioteca, diálogos, menu de contexto).

**Efeito colateral corrigido junto:** sem o filtro, a caixa de seleção de elementos (cor
padrão do Excalidraw, `#6965db`, pensada para ser invertida no escuro) perderia parte do
contraste. Verificado no bundle que o Excalidraw lê a cor de seleção de uma variável CSS do
próprio container (`getComputedStyle(containerRef.current).getPropertyValue("--color-selection")`,
com fallback pro hex acima) — então `--color-selection: var(--color-musgo)` no CSS acima
resolve isso sem precisar recolorir nada por conta própria.

**Dependência frágil, a revalidar a cada upgrade do Excalidraw** (mesma categoria de aviso já
presente no topo de `excalidraw-excalisidian.css`): `--theme-filter`, a classe
`.excalidraw.theme--dark` e o nome da variável `--color-selection` são detalhes internos, não
API pública documentada.

### ADR-12 · Cor de elemento acompanha o tema

**Contexto:** consequência natural do ADR-11 — com duas paletas independentes, o que acontece
quando um desenho colorido no tema escuro é reaberto no tema claro?

**Decisão:** a cor acompanha o tema. Um elemento colorido com um dos 14 tokens normativos
troca automaticamente para o par equivalente do tema ativo, tanto ao trocar de tema com o
desenho aberto (`useTemaEscuro()`, reativo via `MutationObserver` na classe do `<html>`)
quanto ao reabrir o arquivo depois de fechado. O disco grava sempre a paleta do tema claro
(doc 02 §3.3.1) — é o formato canônico, então diffs de Git não mudam só porque alguém abriu o
arquivo num tema diferente.

**Alternativa rejeitada:** manter o hex exato que o usuário escolheu, sem conversão nenhuma.
Mais simples de implementar e mais "fiel" à escolha literal — mas um desenho feito no escuro
fica com texto e formas quase invisíveis ao abrir no claro (a cor branca do traço escuro vira
cinza-claro sobre fundo bege claro), e vice-versa. Rejeitada porque o desenho é o produto, e
um desenho ilegível pela metade do tempo não serve.

**Cor fora da paleta (colada de fora, ou desenho de versão anterior do app) nunca é tocada** —
a conversão só reconhece os 14 hex normativos, então nada além deles corre risco de mudar sem
o usuário pedir.

**Heurística de post-it, uma aproximação conhecida:** no tema claro, `fundo-*` e `postit-*`
coincidem em hex (doc 06 §332: "são dois conjuntos de propósito — não os unifique"), então
convertê-los exige saber qual dos dois conjuntos usar antes de trocar de tema. A desambiguação
(`ehPostit` em `src/canvas/paletaCanvas.ts`) usa a mesma assinatura que `postit.ts` grava ao
criar um: retângulo, `fillStyle: "solid"`, `roundness: null` e `strokeColor === backgroundColor`.
Um retângulo comum que por acaso tiver essas quatro características e a cor de um post-it seria
identificado como post-it — cenário não observado, aceito como aproximação.

### ADR-13 · Dividir o mesmo arquivo abre a 2ª vista só-leitura

**Contexto:** achado revisando o ADR-11/12, não relatado pelo usuário. "Dividir à
direita"/"Dividir abaixo" (RF3.4, menu de contexto da aba) cria um segundo painel do mesmo
`path`. Nem `EditorNota` (`documentId` fixa a identidade do CodeMirror; `markdownSource` só é
lido na montagem) nem `EditorDesenho` (`initialData` congelado por design, ver ADR do loop de
render) reagem a uma mudança de conteúdo vinda de outro painel do mesmo arquivo. Resultado:
editar dos dois lados faz um autosave sobrescrever o outro em silêncio — sem aviso, sem
conflito detectado, porque os dois painéis creem ser a única fonte da verdade.

**Decisão:** a vista criada pelo split abre travada pra edição (`somenteLeitura` nos `params`
do painel → `readOnly` no CodeMirror / `viewModeEnabled` no Excalidraw). A vista original
continua editável normalmente. Cobre também o caso do Excalidraw disparar `onChange` ao
arrastar/dar zoom mesmo em modo visualização — a gravação é pulada inteira nesse caso, não só
a interação de editar.

**Alternativas consideradas:**

| Opção | Por que não (ainda) |
|---|---|
| Split reaproveita o painel existente, sem criar segunda vista | Testado com o usuário e rejeitado: RF3.4 existe justamente para ver o mesmo arquivo em duas colunas; "reaproveitar" o transforma num no-op pra qualquer arquivo com conteúdo. |
| Sincronizar as duas vistas em tempo real | A correção correta a longo prazo, mas mexe em código vendorizado (`AtomicCodeMirrorEditor.tsx`, ADR-10) e no mesmo `EditorDesenho` que já causou dois crashes de loop de render nesta sessão. Fica pendente pra uma tarefa própria, não misturada com a correção de cor que motivou esta revisão. |

**Consequência aceita:** não dá pra editar o mesmo arquivo dos dois lados ao mesmo tempo hoje.
Só visualizar. Se isso incomodar no uso real, a sincronização de verdade é o próximo passo.

### ADR-14 · Nome do arquivo e H1 da nota sincronizam nos dois sentidos

**Contexto:** pedido explícito do usuário — "o nome do arquivo e o título do arquivo devem
ser o mesmo. Quando alterar em um, altera no outro."

**Decisão:** implementado em `src/vault/tituloNota.ts` (a função pura que troca ou insere o
H1) mais dois pontos de gatilho:

- `src/vault/renomear.ts` (`aplicarMovimentacao`): depois de mover o arquivo, sincroniza o H1
  do próprio arquivo com o basename novo. Cobre rename pela árvore, rename pela aba e a
  numeração automática de colisão (ADR abaixo).
- `src/editor/extensoes/sincronizarTituloComArquivo.ts`: extensão do CodeMirror que dispara
  `renomearArquivo` quando o cursor sai da linha 1 e ela é um H1 que mudou desde a última
  confirmação. Só dispara ao SAIR da linha — nunca por tecla — pra não rodar o pipeline
  inteiro de reescrita de backlinks a cada letra digitada.

**Gatilho por tecla, rejeitado:** disparar o rename a cada tecla (mesmo debounce do
autosave) foi considerado e descartado — renomearia no meio de uma pausa pra pensar, e
dispara reescrita de backlinks em outras notas a cada disparo, não é uma operação barata pra
rodar dúzias de vezes por frase.

**Limitação conhecida, aceita por ora (doc 04 §3.1):** todo rename hoje remonta o painel da
aba inteiro (`workspaceStore.renomearDocumento` sempre faz `removePanel`+`addPanel`, nunca só
atualiza o título). Isso significa que terminar de digitar o H1 e apertar Enter pra ir pro
corpo da nota pode fazer o cursor voltar pro início e zerar o desfazer. Corrigir isso direito
exige mexer em como o dockview troca de painel — considerado fora do escopo desta entrega
(risco maior, tarefa própria) numa decisão explícita com o usuário.

### ADR-15 · Nome duplicado nunca mais recusa — sempre numera

**Contexto:** consequência do ADR-14 — se renomear pelo H1 pode colidir com um nome já
existente, recusar (o comportamento de antes) travaria a digitação da nota com um erro no
meio do fluxo. Generalizado pro app inteiro por pedido do usuário: mover um arquivo pra uma
pasta que já tem um arquivo com esse nome também numera, em vez de recusar.

**Decisão:** `renomearArquivo` (`src/vault/renomear.ts`) e `moverArquivo`
(`src/vault/mover.ts`) usam `caminhoLivre` (`src/vault/criar.ts`, antes só usada ao criar
arquivo novo) em vez de checar `adapter.existe` e devolver erro. Um toast avisa quando o nome
pedido não era o disponível.

**Padrão de numeração único:** `Nome (2)`, `Nome (3)`... — o mesmo que já existia pra criar
arquivo novo. Considerado (e descartado) um padrão diferente sem parênteses ("Nome 1", "Nome
2") só pro caso de título vazio virando "Sem título" — usuário preferiu manter um padrão só
em vez de dois formatos de numeração convivendo no produto.

**Título vazio vira "Sem título":** implementado só no sentido rename-pelo-arquivo — renomear
para nome vazio (ou só espaço) cai pra `Sem título`, com a mesma numeração de colisão de
qualquer outro nome duplicado (`renomearArquivo`, `src/vault/renomear.ts`). Apagar o H1
inteiro pela EDIÇÃO do corpo da nota não dispara nada (doc 04 §3.1) — a extensão do
CodeMirror só age quando a linha 1 volta a ser um H1 não-vazio.

### ADR-9 · O nome do produto é um problema em aberto

Isto não é uma decisão, é um alerta que apareceu ao resolver o ADR-8.

Se a razão para não usar `.excalidraw` é evitar a marca, então **"Excalisidian" é uma exposição maior do que a extensão jamais foi.** Os fatos publicados:

- **EXCALIDRAW** tem pedido de marca nos EUA, serial 97010906, titular Excalidraw s.r.o., classe 042 (software de whiteboard). Depositado em 2021. O código é MIT e a licença MIT não trata de marca — ela não te dá nem te nega nada sobre o nome. Não encontrei trademark policy pública do Excalidraw.
- **OBSIDIAN** é marca depositada pela Dynalist Inc., serial 98063360. E a Dynalist tem política pública e explícita: uso referencial é permitido ("instale o plugin XYZ no Obsidian"), mas **nomear um produto como "Obsidian XYZ" é proibido**, e existe até um bot que sinaliza isso nos plugins submetidos.
- "Excalisidian" não contém nenhuma das duas palavras inteiras, o que o coloca fora da regra explícita do Obsidian e fora do uso literal da marca do Excalidraw.

Nada disso é conselho jurídico — é leitura do que está publicado. Mas a assimetria é evidente: trocar a extensão e manter o nome resolve o menor dos dois problemas. Se o produto é para uso pessoal, provavelmente nada acontece. Se um dia for distribuído, o nome é o item a revisar, não o `.md`.

O nome aparece no código em três lugares que ficam caros de trocar depois: a chave de frontmatter `excalisidian: drawing`, a pasta `.excalisidian/` e a extensão temporária `.excalisidian-tmp`. Vale decidir o nome antes da Fatia 1, ou usar desde já uma constante única (`APP_ID`) da qual os três derivam.

## Parte 2 — O que foi verificado em fonte

Pesquisado em 28/08/2026 na documentação oficial do Obsidian (`obsidianmd/obsidian-help`), no repositório `excalidraw/excalidraw`, no `zsviczian/obsidian-excalidraw-plugin`, na `docs.excalidraw.com`, na `v2.tauri.app` e no registry do npm.

**Confirmado:**

- Vault do Obsidian é uma pasta com `.md` puros; config em `.obsidian/`; `workspace.json` muda a cada abertura e a doc recomenda `.gitignore`.
- Sintaxe de links, embeds, aliases e block ids do Obsidian, incluindo as regras de posição do `^id` em blocos estruturados e a lista de caracteres proibidos.
- Configuração "New link format" com as três opções shortest / relative / absolute.
- Rename atualiza links automaticamente, com a opção de perguntar antes.
- Atalhos de aba do Obsidian no Windows: `Ctrl+T`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+1`–`Ctrl+9`, `Ctrl+Shift+T`. Modificadores de clique em link: `Ctrl` nova aba, `Ctrl+Alt` novo grupo (split), `Ctrl+Alt+Shift` nova janela.
- Live Preview do Obsidian é CodeMirror 6 com decorations; a sintaxe reaparece na linha do cursor. O Obsidian não renderiza markdown dentro de HTML, por decisão.
- Lixeira do Obsidian tem três modos: sistema, `.trash` no vault, permanente.
- O plugin Excalidraw grava `.draw.md` desde a 1.2, com as seções `## Text Elements`, `## Element Links`, `## Embedded Files`, `## Drawing`; o id do elemento vira block id; a cena é comprimida com LZString em linhas de 256 caracteres; o mapa `files` guarda data URLs base64.
- Excalidraw: atalhos de ferramenta (`V R D O A L P T 9 E H`, mais `F` frame e `K` laser, que o Excalisidian não usa), `FONT_SIZES` S16/M20/L28/XL36, `DEFAULT_GRID_SIZE = 20`, grade desenhada como **linhas**, `Ctrl` impede binding de seta, arrowheads e `ARROW_TYPE sharp/round/elbow`, bound text via `containerId` + `boundElements`, campos do `ExcalidrawElement`.
- `@excalidraw/excalidraw` **0.18.1** é o latest. `ref` foi removido na 0.17 em favor da prop `excalidrawAPI`. Na 0.18 o CSS deixou de ser injetado (`import "@excalidraw/excalidraw/index.css"`) e as fontes passaram a vir de CDN, com self-host via `window.EXCALIDRAW_ASSET_PATH`.
- Não existe API oficial para esconder ferramentas individuais da toolbar — issue #3012, aberta. `UIOptions.canvasActions` cobre só o menu.
- Não existe sticky note nativo no Excalidraw; a prática é retângulo com bound text.
- Tauri v2: o diálogo de pasta **não** concede escopo de FS; é preciso `allow_directory` do lado Rust, e o escopo de runtime não persiste entre execuções.
- `dockview` 8.2.0 é ativo, sem dependências, com serialização por `toJSON`/`fromJSON`. `rc-dock` está com o latest apontando para um alpha e `golden-layout` sem release desde 2022.
- `minisearch` 7.2.0 tem atualização incremental por documento; `lunr` está parado desde 2020 e tem índice imutável.

Verificado nesta terceira rodada:

- **Lixeira do sistema restaura para o caminho original** nos três sistemas: Windows guarda o caminho no par `$R…`/`$I…` em `C:\$Recycle.Bin\<SID>\`, o macOS faz "Put Back", o Linux guarda `Path=` no `.trashinfo` da spec FreeDesktop. A afirmação contrária no ADR-7 antigo era falsa.
- **O `@tauri-apps/plugin-fs` v2 não tem função de lixeira.** A lista de exports é `copyFile, create, exists, lstat, mkdir, open, readDir, readFile, readTextFile, readTextFileLines, remove, rename, size, stat, truncate, watch, watchImmediate, writeFile, writeTextFile`. Não existe plugin oficial de lixeira; o pedido é a issue tauri#5680, aberta desde novembro de 2022. O crate `trash` 5.2.6 (MIT) cobre os três sistemas, e o módulo `os_limited` — que lista e restaura itens da lixeira — existe só em Windows e Linux.
- **JSON Canvas spec 1.0** tem quatro tipos de nó (`text`, `file`, `link`, `group`) e arestas com `fromNode`/`toNode`/`fromSide`/`toSide` e ponta `none` ou `arrow`. A única propriedade visual de um nó é `color`. Não há freedraw, não há estilo de traço, não há seta com geometria própria. Além do Obsidian, só o Charkoal usa como formato de armazenamento; os outros adotantes fazem import/export.
- **`.draw` não tem tipo MIME registrado na IANA nem software vivo associado** — só o DrawFile do RISC OS, plataforma extinta. `.board` e `.tela` também estão livres; `.drawing` é do Mapdiva Artboard, descontinuado.
- **Marcas:** EXCALIDRAW tem pedido nos EUA (serial 97010906, Excalidraw s.r.o., classe 042, 2021) e a licença MIT do código não trata de marca. OBSIDIAN é marca da Dynalist Inc. (serial 98063360) com política pública que proíbe nomear produtos como "Obsidian XYZ". Não encontrei trademark policy publicada pelo Excalidraw.

## Parte 3 — O que NÃO foi confirmado

Trate cada item abaixo como suposição a validar antes de depender dele.

1. **Versões de Vite, React e Tauri.** Os números no documento 05 vieram de consulta ao registry, mas confira no `npm install`. Se algum subiu de major, pare e reavalie — especialmente Vite e React.
2. ~~Range de peerDependencies do Excalidraw.~~ **Resolvido na revisão:** o manifesto publicado da 0.18.1 declara `"react": "^17.0.2 || ^18.2.0 || ^19.0.0"` para `react` e `react-dom`. React 19 é suportado. A dúvida anterior era erro de leitura.
3. **Nome exato da API Rust `FsExt::allow_directory`.** O padrão está documentado em discussões do Tauri, mas confirme a assinatura na versão do plugin que você instalar.
4. ~~**`@atomic-editor/editor` 0.6.2.**~~ **Resolvido na Fatia 2 — ver ADR-10.** A "pouca tração" era imprecisa (135 estrelas, ~15k downloads/mês); o mantenedor único procede. Foi adotado e vendorizado em `src/editor/atomico/`. Portão de decisão validado no app.
5. **Ctrl+W como atalho de fábrica no Obsidian.** Não aparece na documentação oficial, só em tópicos de fórum. Para o Excalisidian é decisão nossa e não depende disso.
6. **Hex exatos da paleta padrão do Excalidraw.** Houve divergência entre `#e03131` e `#fa5252` para o vermelho. Irrelevante na prática, porque o Excalisidian substitui a paleta inteira — e por isso esses valores foram removidos do documento 06 em vez de corrigidos.
7. **"Canvas pontilhado".** O Excalidraw não tem fundo pontilhado nativo: o grid mode dele desenha linhas. O fundo de pontos do Excalisidian é implementação nossa.

   Metade da dúvida foi resolvida na revisão: o renderizador do Excalidraw faz `clearRect` quando `viewBackgroundColor` é transparente, então **o fundo de trás aparece**. A outra metade continua aberta e virou trabalho não estimado: um `background-image` de CSS é estático e **não acompanha zoom e pan sozinho**. É preciso assinar `onScrollChange` e reescrever `background-size` e `background-position` em função de `zoom`, `scrollX` e `scrollY` — a 60 fps. Se isso custar caro, a alternativa é desenhar os pontos num `canvas` próprio atrás do Excalidraw.
8. **`blockId` derivado do id do elemento.** A regra de tradução da seção 3.1 do documento 02 é decisão minha e **não foi testada**. O ponto crítico: ids do Excalidraw são nanoid de 21 caracteres que incluem `_`, e block id do markdown não aceita `_`. Se a sanitização não for estável, o arquivo muda sozinho e o RNF7 cai. Trate a seção 3.1 como proposta a validar no primeiro dia da Fatia 6, não como fato.

9. **Campos omitidos na serialização da cena.** Omitir `version`, `versionNonce` e `updated` é o que torna o RNF7 possível, mas não testei se o Excalidraw se comporta bem ao receber esses campos reidratados com valores fixos. Verifique com um ciclo de gravação, leitura e edição antes de confiar.

10. **A próxima versão do Excalidraw quebra as APIs que este pacote usa.** O changelog não lançado no `master` renomeia `excalidrawAPI` para `onExcalidrawAPI`, troca `scrollToContent` por `setViewport` e muda a assinatura de `setActiveTool`. A 0.18.1 é a versão a fixar, e subir dela não é "um dia dedicado" — é uma migração. Planeje ficar na 0.18.1 até haver motivo forte.

11. **`FONT_SIZES` com quatro tamanhos.** S16/M20/L28 são certos; o XL 36 não foi confirmado. O design system usa quatro (P/M/G/GG) — se o XL não existir na versão fixada, ajuste para três.

12. **Esconder ferramentas da toolbar por CSS.** Funciona hoje, mas depende de classes internas. Por isso a recomendação de construir a toolbar própria em vez de estilizar a nativa — o que, por sua vez, exige checar se `setActiveTool` cobre todas as ferramentas que queremos expor. Não confirmei que cobre post-it (que não existe lá) — o post-it terá que ser criado programaticamente via `updateScene`.
13. **Renderizar o desenho como SVG para embutir na nota.** `exportToSvg` existe e é a peça certa, mas não testei o custo de renderizar vários embeds numa nota longa. Pode ser necessário cachear o SVG por `mtime` do desenho.
14. **Números de desempenho dos requisitos não funcionais.** RNF1 (5 000 notas em 2 s), RNF3 (500 elementos a 60 fps) e o limite de 3 000 elementos são metas que eu escolhi como razoáveis, não medições. Ajuste depois do primeiro benchmark real.
15. **Tamanhos e medidas do design system que não vieram do Taskly** — altura de aba 34px, sidebar 264px, margem de 76px, coluna de texto de 720px, grade de 20px. São decisões minhas, coerentes com o sistema, mas não testadas em tela.
16. ~~Contraste AA dos tokens.~~ **Medido na revisão, e havia problema.** Com os valores originais do Taskly, `tinta-suave` (`#7A7268`) dava 3,95:1 sobre `papel` e 3,57:1 sobre `lavagem` — reprovado em AA, e é a cor de todo o metadado do produto em 11px. Corrigido para `#655E54` (5,34 / 4,82) no claro e `#9A9384` (5,13 sobre `lavagem` escura) no escuro. `ocre` (3,21:1 sobre `papel`) foi mantido como cor de preenchimento e destaque, e proibido como cor de texto sobre fundo claro — para texto usa-se `ocre-tinta` (5,54:1). **Estes valores divergem do design system do Taskly de propósito.** Se você quiser os dois produtos idênticos, é o Taskly que precisa da correção.
17. **Fontes do Excalidraw empacotadas.** Excalifont vem com o pacote e o projeto é MIT, mas confirme a licença da fonte especificamente antes de distribuir o instalador.
19. **Status atual do pedido de marca EXCALIDRAW.** O registro público que consultei mostrava um status que parecia desatualizado para um pedido de 2021, e a consulta ao TSDR do USPTO foi recusada. Considere a marca como reivindicada e em processo, com status final desconhecido.
20. **Tamanho de arquivo por elemento.** Os números do ADR-2 (450–700 bytes por forma, ~14 bytes por ponto de traço à mão livre, limiar de 1,5 MB) vêm de contar os campos reais do `ExcalidrawElement`, não de benchmark publicado — não existe dado oficial. Meça com suas cenas antes de confiar no limiar.
21. **A resolução de desenho por nome base duplo** (`Nome.draw` e `Nome`, com a nota vencendo o empate) é decisão desta rodada e não foi testada. É o teste 3 do documento 05.
22. **Nada aqui foi visto funcionando.** Não rodei código, não abri o Obsidian, não instalei nada. Tudo é leitura de documentação e de código-fonte. Onde a documentação estava errada ou desatualizada, este pacote está errado junto.

---

## Parte 3.1 — O que a revisão consertou

Este pacote passou por uma revisão crítica antes de ser entregue. Estes problemas existiam e foram corrigidos: `Ctrl+B` definido ao mesmo tempo para negrito e para recolher a sidebar (sidebar foi para `Ctrl+\`); `attachmentFolder` especificado em dois lugares do disco ao mesmo tempo; contraste AA reprovado em `tinta-suave` e `ocre`; a cerca de código do exemplo canônico do `.draw.md` quebrada, fazendo o exemplo não renderizar; `fsync` exigido numa API que não o expõe; `--fonte-display` usado sem nunca ser definido; nomes de cor de post-it colidindo com nomes de token da interface; `H3` reusando um token com outra fonte e outro tamanho; a instância única do Excalidraw contradizendo o requisito de tela dividida; o spike de desempenho do canvas agendado para a sétima fatia depois de o próprio texto dizer que era para a primeira semana.

Os problemas que a primeira revisão encontrou e que não eram só redação viraram os itens 7 a 11 da Parte 3.

**Uma segunda revisão** encontrou mais, e também foi aplicada. O que mudou: o hex reprovado de `tinta-suave` sobrevivia na Rodada 2 do prompt de design; `pasta de anexos` e `formato de link` continuavam listados em `settings.json` no documento 05, contradizendo a correção anterior; o `workspace.json` era um arquivo só para todos os vaults, então abrir o vault B apagava o layout do vault A; faltava a regra que resolve `attachmentMode` nas quatro variantes; o `.tmp` da escrita atômica não estava na lista de ignorados do watcher e dispararia o reconciliador a cada salvamento; a seção `## Embedded Files` confundia `fileId` do Excalidraw com blockId de elemento, o que quebrava o caso da mesma imagem colada duas vezes; o parser não tinha defesa contra um texto de canvas contendo `## Scene` ou uma linha começando com `^`; as sombras não eram redefinidas no tema escuro, onde uma sombra de `#1C1917` a 25% sobre `#16140F` é invisível; a borda de controle em `regua` dava 1,2:1, abaixo do mínimo de 3:1 para elemento não textual, o que gerou o token `regua-forte`; o prompt de design inventava cinco tamanhos de tipografia que o design system não tinha; e `Ctrl+Delete` continuava limpando a cena inteira do Excalidraw, que era a última forma de destruição silenciosa do produto.

Também foram acrescentados: a Rodada 3 do prompt de design, com as duas telas do tema escuro (que ninguém teria visto antes de codar, sendo RF8.1 um P0), os 14 tokens de cor do canvas no `globals.css`, e a mudança de assinatura do `updateScene` na 0.18 (`captureUpdate` no lugar de `commitToHistory`), que decide se recarregar do disco entra no histórico de desfazer.

**Uma terceira rodada** revisou as próprias decisões, e três mudaram de forma:

- **ADR-7** tinha um motivo factualmente errado. A justificativa real é outra (o painel de lixeira em RF7.2/RF7.3 exige uma pasta listável), a decisão continua a mesma, e ficou registrado que a lixeira do sistema custa um comando Rust com o crate `trash` porque o `plugin-fs` não tem essa função.
- **ADR-1** alegava quatro vantagens para o formato markdown, e três não vinham do markdown. Uma delas — "o id do elemento vira block id de graça" — era falsa, e a própria seção 3.1 do documento 02 prova que não é de graça.
- **ADR-2** dizia "reavaliar acima de 2 MB", que é dívida disfarçada de nota. Agora o parser reconhece duas linguagens de fence desde o início, e a compressão é configuração em vez de migração.

Foram acrescentados o **ADR-8** (a extensão `.draw.md`, com as alternativas que foram descartadas e por quê) e o **ADR-9** (o nome do produto é uma exposição de marca maior do que a extensão era). Todos os ADRs ganharam **condição de reversão** — sem isso um ADR é preferência, não decisão.

---

## Parte 4 — Perguntas que ficaram para você decidir

1. **Windows só, ou também macOS?** Muda o peso do risco do Tauri e obriga a lidar com NFD nos nomes de arquivo.
2. **O verso da folha do desenho** — o espaço de markdown livre no `.draw.md` — vai ter UI no MVP, ou só existe para quem abrir o arquivo como texto? A especificação preserva o conteúdo mas não define uma tela para editá-lo.
3. **Um desenho pode virar nota e vice-versa?** Não especifiquei conversão.
4. **O que acontece com as abas quando o vault é trocado?** Minha suposição: dá flush em tudo, fecha todas as abas, grava o arquivo de layout do vault que está saindo e carrega o do que está entrando. Não está especificado em lugar nenhum e a Fatia 8 vai esbarrar nisso.
5. **A escolha de `S` para o post-it** é minha. Se você usa muito `S` para outra coisa, mude antes de virar memória muscular.
6. **O nome do produto.** Se "Excalisidian" é para ficar, feche agora; se não, escolha antes da Fatia 1, porque ele entra na chave de frontmatter, na pasta de config e na extensão temporária. Ver ADR-9.

---

## Parte 5 — Resultado do spike do canvas (Fatia 0)

Feito em 28/08/2026, na primeira sessão de código.

**Decisões fechadas antes da Fatia 0:** nome do produto `excalisidian` fechado (`APP_ID` único, ADR-9 encerrado para o MVP); Windows só, normalização NFC apenas; repositório Git novo na raiz `C:\Excalisidian`; vault de teste em `C:\Excalisidian-vault-teste`.

**Ambiente medido:** Windows 11 Pro 26200. Rust 1.98.0 (MSVC). Node 24.11.1. WebView2: versão da máquina (Edge/Chromium embutido do Windows 11) — o número exato aparece no rótulo da tela de spike.

**Infra do spike:** `src/app/SpikeCanvas.tsx` monta o `@excalidraw/excalidraw` 0.18.1, gera 500 retângulos com `convertToExcalidrawElements` e mostra um contador de FPS ao vivo (requestAnimationFrame). `window.EXCALIDRAW_ASSET_PATH = "/"` no `index.html` e as fontes do Excalidraw copiadas para `public/` por `postinstall` — canvas funciona offline. É tela descartável; sai na Fatia 6.

**Build:** compila sem erro. `cargo check` 2m51s e `tauri dev` 3m54s na primeira vez (380 crates), segundos nas seguintes. Frontend `tsc` limpo e `vite build` ok.

**Medição de pan/zoom com 500 elementos:** FPS mais baixo observado durante pan e zoom contínuos = **52 fps**. Faixa "aceitável" (fluido ≥ 55, aceitável ≥ 35, travando < 35). Sem engasgo perceptível na interação.

**Conclusão:** o canvas monta e renderiza 500 elementos no WebView2 a ~52 fps sob pan/zoom — aceitável para o MVP, sem necessidade de plano B. Nenhuma decisão de arquitetura muda. Revalidar na Fatia 6 com cena real (imagens + post-its) e checar se traço à mão livre pesado derruba o número; se cair abaixo de ~35, aplicar o plano B do doc 05 §5 (reduzir a cena, revisar re-renders, desmontar canvas fora de vista) — não trocar de shell.
