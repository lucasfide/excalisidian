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

**Status (01/09/2026): RF7.1–7.4 implementados** (`vault/lixeira.ts`, `ui/excalisidian/PainelLixeira.tsx`). Achado só na implementação, não previsto neste ADR: o `walk_vault` (RF1.6) filtra qualquer pasta que comece com "." — inclusive o que está *dentro* dela — então `.trash/*` nunca aparece em `vaultStore().entradas`. O painel de lixeira lista pelo `VaultAdapter.listarPasta()`, um método novo sobre `readDir` do `@tauri-apps/plugin-fs` (não-recursivo, por fora do `walk_vault`), não por cruzar com `entradas` como um levantamento anterior desta sessão presumiu. RF7.5 (desfazer no toast) e RF7.6 (lixeira do sistema, crate `trash`) continuam pendentes.

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

**Aposentado (01/09/2026, ADR-20).** A premissa deste
ADR — duas paletas próprias, hand-picked, competindo com o filtro nativo — caiu junto com o
ADR-12. O filtro volta a ligar; ver o ADR-20 pro raciocínio completo.

**Contexto (histórico):** ao testar o canvas em tela (29/08/2026), a cor branca escolhida no painel
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
com fallback pro hex acima) — então `--color-selection: var(--color-cristal)` no CSS acima
resolve isso sem precisar recolorir nada por conta própria.

**Dependência frágil, a revalidar a cada upgrade do Excalidraw** (mesma categoria de aviso já
presente no topo de `excalidraw-excalisidian.css`): `--theme-filter`, a classe
`.excalidraw.theme--dark` e o nome da variável `--color-selection` são detalhes internos, não
API pública documentada.

### ADR-12 · Cor de elemento acompanha o tema

**Aposentado (01/09/2026, ADR-20).** O seletor de cor
nativo do Excalidraw nunca foi customizável pela API pública — as paletas são hardcoded nas
próprias actions do pacote e as constantes não são exportadas (nem no índice público, nem por
subpath, nem em nenhum bundle publicado). Sem controle da paleta que o usuário efetivamente usa,
manter esta conversão só produzia cena mista (parte acompanhando o tema, parte não) e um vetor
real de corrupção de cor — a "aproximação conhecida" da heurística de post-it, descrita abaixo,
deixou de ser improvável assim que o painel nativo passou a dar acesso direto e independente a
`stroke`/`background`/`fillStyle`/`edges`. Ver o ADR-20 pro raciocínio completo.

**Contexto (histórico):** consequência natural do ADR-11 — com duas paletas independentes, o que acontece
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

### ADR-17 · Seleção de forma vazia clicando dentro: reimplementada por fora

**Contexto:** o Excalidraw só seleciona uma forma sem preenchimento clicando na borda dela —
clicar no interior não faz nada. Pedido: clicar dentro também deveria selecionar.

**Investigado e confirmado sem opção nativa.** A lógica (`shouldTestInside`/`hitElementItself`,
em `element/collision.ts` do pacote) é hardcoded: só testa o interior quando
`backgroundColor` não é transparente (ou tem texto vinculado/é imagem). Não existe prop no
`<Excalidraw>`, campo de `appState` nem campo de elemento pra mudar isso — é código interno
do componente `App`, nunca exportado pela API pública do pacote (confirmado por grep no bundle
e nos `.d.ts` de tipos, 0.18.1).

**Decisão:** reimplementar só o teste geométrico que falta, por fora — `canvas/
selecaoFormaVazia.ts`, puro e testado (ponto-em-retângulo/elipse/losango, com rotação). Um
`pointerup` em `EditorDesenho.tsx` funciona como plano B: espera o Excalidraw processar o
clique normalmente (ele resolve tudo que já funciona certo — borda, preenchimento sólido,
texto, imagem, seta), e só quando a seleção dele fica vazia depois de um clique de verdade
(não um arraste — distância medida entre pointerdown e pointerup) é que testamos se o ponto
caiu dentro de uma forma fechada sem preenchimento; se sim, seleciona via
`api.updateScene({ appState: { selectedElementIds: ... } })` — a API pública e suportada pra
mudar seleção programaticamente.

**Por que não patchear o Excalidraw:** o pacote é pinado em 0.18.1 (ADR do doc 05) exatamente
pra evitar depender de internals que mudam sem aviso; reimplementar por fora, em cima da API
pública (`viewportCoordsToSceneCoords`, `updateScene`), é a opção que sobrevive a um upgrade —
só a geometria (retângulo/elipse/losango com rotação) é conhecimento nosso, e é matemática
comum, não um detalhe de implementação do Excalidraw.

**Escopo, por decisão do usuário:** só formas fechadas (retângulo, losango, elipse). Seta e
linha não têm "dentro" — continuam exigindo clique no traço, como sempre foi.

**Atualização (01/09/2026, ADR-20): a guarda de "ignora clique na
nossa UI" mudou.** Era `!e.target.closest(".excalidraw")` — funcionava porque a toolbar/painel
próprios eram irmãos do Excalidraw na árvore, então a checagem devolvia `null` pra clique neles.
Com a UI nativa ligada, toolbar/painel/popovers do Excalidraw ficam **dentro** de `.excalidraw`,
e essa guarda passaria a aceitar clique na UI nativa, arriscando selecionar uma forma vazia
escondida atrás do painel. Trocada por `e.target instanceof HTMLCanvasElement` — só o `<canvas>`
de verdade interessa, independente de onde a UI nativa está na árvore.

### ADR-16 · Aba de início fixa, fora da lista de abas de verdade

**Contexto:** pedido explícito — uma tela de abertura (saudação, atalhos de pasta, criar
nota/desenho/pasta) acessível por uma "abinha menor" com ícone de Home, à esquerda de todas
as abas.

**Decisão:** o botão de acesso usa o slot nativo `prefixHeaderActionsComponent` do dockview
(`src/layout/BotaoInicioAba.tsx`) — não é uma aba de verdade, fica fora da lista de painéis
(`Ctrl+Tab`, `Ctrl+1..9` nunca alcançam nem contam ela) e não pode ser arrastada nem fechada
sem código dedicado, exatamente o comportamento pedido ("abinha", não "aba"). O painel que ela
abre (`PainelInicio` / componente `inicio`) usa o mesmo dedupe de `abrirDocumento` — só existe
uma instância, reaberta em vez de duplicada.

Abre sozinha no boot quando `api.panels.length === 0` (vault novo, ou a sessão anterior fechou
tudo) — sem isso o app cairia numa tela em branco igual antes desta fatia.

**Correção (achada em uso real, 01/09/2026): "não pode ser fechada sem código dedicado" não
estava implementado de verdade.** A `PainelInicio`, uma vez aberta, virava um painel do dockview
igual qualquer outro — `AbaDocumento.tsx` (a aba padrão) tem um "x" que fecha qualquer painel, a
Home incluída, e Ctrl+W (`fecharAtivo`) fechava o painel ativo sem checar qual era. Fechando a
Home e depois todas as outras abas, o painel principal ficava **completamente vazio, sem
nenhum jeito de voltar pela UI**: sem nenhum grupo do dockview, o próprio cabeçalho de abas
some, e junto dele o `prefixHeaderActionsComponent` que hospeda o botão de abrir a Home — não
sobrava nada clicável.

Duas camadas de correção, porque nenhuma sozinha cobre tudo:
1. **A Home não se fecha mais por UI.** `AbaInicio.tsx`, uma aba dedicada sem "x" (registrada em
   `tabComponents={{ inicio: AbaInicio }}` do `DockviewReact`, com `tabComponent: "inicio"` no
   `addPanel` de `abrirInicio`); `fecharAtivo` (Ctrl+W) vira no-op se o painel ativo é a Home; o
   menu de contexto da aba não oferece "Fechar" nela, e "Fechar outras" deixou de usar o
   `closeOthers` nativo do dockview (que fecharia tudo, Home incluída) — agora é uma ação própria
   que sempre poupa a Home.
2. **Rede de segurança, pro caso de algum caminho eu não ter coberto:** `onDidRemovePanel`
   (`Workspace.tsx`) confere `api.panels.length === 0` depois de toda remoção e reabre a Home
   sozinha se zerar — o mesmo `abrirInicio()` que já rodava só no boot, agora chamado durante a
   sessão inteira. Esta camada é a que realmente garante a invariante ("nunca fica em branco"),
   independente de eu ter enumerado certo todos os jeitos de fechar um painel.

Ainda não mexido (fora do relato que motivou a correção): `Ctrl+Tab`/`Ctrl+1..9` continuam
percorrendo `api.panels` sem excluir a Home, então ela AINDA aparece nesses dois atalhos, ao
contrário do que este ADR sempre disse. Registrado, não corrigido — ninguém reclamou disso ainda
e mexer em `cicloAba`/`ativarPorIndice` é escopo à parte.

**Casinha como única representação (16/09/2026).** A aba sem "x" da correção acima aparecia com o
texto "Início" logo ao lado da casinha — lia como duas Home. A `AbaInicio` passou a ser
invisível (a `.dv-tab` inteira some por CSS, `dockview-excalisidian.css`), e a casinha assume o
visual de aba ativa quando a Home está visível no grupo. O painel continua existindo e sem "x",
então a invariante "nunca fica em branco" não muda. Com a aba escondida, a pendência de atalhos
acima deixou de ser aceitável (`Ctrl+1` ativaria uma aba invisível) e foi corrigida:
`cicloAba` e `ativarPorIndice` excluem a Home.

**Nome do usuário — infraestrutura nova:** não existia em lugar nenhum (nem Rust, nem JS).
Adicionado `src-tauri/src/sistema.rs`, um módulo (não `vault.rs` — a filosofia "três comandos,
e não mais que isso sem uma boa razão" é do domínio de disco, não de SO) com um comando só,
`nome_usuario`, lendo `USERNAME` (Windows) com fallback `USER` (Unix). Cortado o primeiro
nome e capitalizado no lado JS (`src/app/sistemaOperacional.ts`) — o valor bruto do SO pode
vir em qualquer capitalização ou com sobrenome.

**Atualização (16/09/2026):** o uso automático deste nome na saudação da Home foi revisto —
ver ADR-27. `nome_usuario` continua existindo, mas vira só a base de uma *sugestão* editável na
tela de boas-vindas, nunca mais usado direto na saudação.

### ADR-18 · Bloco é o do Markdown, não um objeto próprio

**Contexto:** pedido do usuário — clique triplo selecionando além do bloco (vazava pra linha de
baixo), e nenhuma distinção entre Enter e Shift+Enter (Notion/Obsidian têm as duas). Pedido
também: mover bloco por arraste, tipo Notion.

**A pergunta de fundo era "o que é um bloco".** Notion guarda cada bloco como um objeto próprio
no seu banco de dados; este app guarda Markdown puro em arquivo (ADR-4, RNF7). Não há objeto
"bloco" nenhum — o que existe é a árvore de sintaxe do CommonMark/GFM, já disponível via
`@lezer/markdown` (o mesmo parser que a live preview usa). **Decisão: bloco é o filho direto do
documento** que contém a posição (parágrafo, heading, citação, código, tabela...), exceto dentro
de lista, onde desce até o item mais interno — cada item de lista é seu próprio bloco, igual
Notion. Um heading é um bloco solto, sem relação de bloco-pai com o que vem depois dele: mover
um heading arrasta só a linha dele, nunca a seção inteira (o título da nota, na linha 1, não
tem alça nenhuma — ver abaixo).

`src/editor/extensoes/blocoMarkdown.ts` implementa isso puro (`Tree` + `Text`, nunca
`EditorView`) — testável em `environment: "node"` sem abrir navegador, construindo a árvore
direto com `markdownLanguage.parser.parse(texto)`. É a base dos três comportamentos abaixo.

**Enter grava `\n`, não `\n\n` (revisão pedida pelo usuário).** A primeira versão desta ADR
fazia o Enter já gravar uma linha em branco, pra "Enter = bloco novo" ser verdade no arquivo e
não só na tela. Na prática isso fazia o cursor "pular duas linhas" a cada Enter, contra a
expectativa de editor de texto comum. Decisão nova: Enter grava uma quebra simples (`\n`); a
linha em branco que separa blocos no Markdown sai de apertar Enter **de novo** numa linha
vazia. O modelo mental vira "bloco novo custa dois Enters" — e o round-trip continua honesto,
porque a linha em branco ainda é gravada de verdade quando ela existe. Shift+Enter continua
sendo quebra dentro do mesmo bloco (idêntico ao Enter pra parágrafo solto; só difere ao
repetir prefixo de lista/citação). `quebraDeBloco.ts`.

**O título (linha 1) é blindado.** Duas regras específicas da linha 1, que é sempre o título da
nota: (1) não recebe alça de mover — `moverBloco.ts` ignora qualquer bloco que comece na linha
1, seja o H1 ou um parágrafo de nota antiga; (2) quando a linha 1 já é um H1, o prefixo `# ` não
pode ser editado nem apagado — `tituloSempreH1.ts`, um `EditorState.transactionFilter` que
recorta do texto digitado a parte que cairia dentro do `# ` (não usa `changeFilter`, que
descartaria junto o texto que o usuário digitou ao selecionar a linha toda). Não injeta `# ` em
nota que abre sem H1 na linha 1 (RNF7).

**Por que Shift+Enter é `\n` e não o hard break do CommonMark:** o CommonMark define quebra de
linha dentro de um parágrafo com dois espaços à direita (`  \n`) ou uma barra invertida. Os
dois são frágeis em diff (espaço em branco invisível no fim de linha) e o Obsidian, a referência
de comportamento pedida pelo usuário, escreve `\n` simples. Aceito que renderizadores Markdown
estritos (GitHub incluso) vão juntar visualmente essas linhas — trade-off explícito, escolhido
pelo usuário.

**Revisão (18/09/2026) — Shift+Enter passa a gravar o hard break `  \n`.** Relato do usuário: a
alça de mover pegava todas as linhas de um parágrafo feito com Enter, e mover bloco sumia ou
multiplicava linhas em branco. Pedido: linha do Enter é bloco próprio; só Shift+Enter junta
linhas no mesmo bloco. Com os dois gravando `\n` o arquivo não guarda essa diferença, então um
dos dois tinha que mudar no disco. Mudou o Shift+Enter, que é o menos usado: em parágrafo solto
grava dois espaços antes da quebra (hard break do CommonMark, que o Obsidian e o GitHub
renderizam como quebra). Dois espaços, e não a barra invertida, porque se o marcador se perder
(texto digitado depois dele) o resultado renderiza como espaço, não como `\` solto. Dentro de
um parágrafo solto, bloco passa a ser a sequência de linhas ligadas por hard break
(`blocoMarkdown.ts`); linhas ligadas só por `\n` são blocos separados. Nota antiga não é
reformatada: um parágrafo feito com Shift+Enter antes desta revisão passa a mover linha a linha.
Limitação aceita: quem apertar End numa linha do Shift+Enter e digitar escreve depois dos dois
espaços, e a linha deixa de puxar a de baixo pro mesmo bloco.

**Mover bloco não reconstrói a faixa de irmãos (mesma revisão).** A primeira versão juntava
todos os irmãos de novo com o separador do primeiro par — que era o título e a linha de baixo.
Título colado no texto grudava todos os parágrafos; título com linha em branco extra espalhava
linha em branco. Agora `calcularMovimento` tira o bloco com uma quebra de linha e reinsere no
alvo; linhas em branco não se movem. Colagem nova com `\n` simples só entre parágrafo e heading
ATX — com lista, citação, tabela ou regra horizontal a junção leva linha em branco, pra não
virar continuação preguiçosa nem heading Setext.

**Por que não reformata nota existente:** doc 04 §11.8 — o app não toca no que o usuário não
editou. Uma nota antiga com linhas separadas por Enter simples continua sendo um parágrafo de
várias linhas; a mudança vale só para o que for digitado dali pra frente.

**Limitação aceita — clique-triplo-e-arrastar:** clicar três vezes e arrastar para estender a
seleção bloco a bloco não foi implementado. Exigiria a interface completa
`EditorView.mouseSelectionStyle` (existe, documentada, não usada em nenhum outro lugar do
projeto) por um ganho pequeno — fica só o clique triplo simples
(`selecaoDeBloco.ts`, um `mousedown` de `detail === 3` interceptado antes do CodeMirror
processar o dele).

**Limitação aceita — mover só entre irmãos:** `moverBloco.ts` (`calcularMovimento`) só reordena
entre blocos do mesmo nível — parágrafo entre parágrafos, item dentro da própria lista. Arrastar
um parágrafo pra dentro de uma lista exigiria reindentar e inserir marcador de lista; fica fora
do v1, e a alça não mostra indicador de soltura em posição inválida, pra não prometer o que não
faz.

**Por que a alça de mover é `position: fixed` fora do `view.dom`:** o respiro de 32px da coluna
de texto (`px-8`, `PainelDocumento.tsx`) fica fora da árvore do CodeMirror, e o wrapper de
`EditorNota.tsx` tem `overflow-hidden` — um elemento posicionado com offset negativo dentro do
`view.dom` seria cortado. `position: fixed`, ancorado em `getBoundingClientRect()`/
`coordsAtPos`, escapa desse corte (mesma ideia de um tooltip/popover).

**Por que a visibilidade da alça é geométrica, e não por `mouseenter`/`mouseleave`:** duas
correções por evento de fronteira (`relatedTarget`, depois um atraso de 300ms) falharam, porque o
problema não estava lá. Primeiro, o alvo mora **fora** do gatilho — a alça é `position: fixed` no
respiro, o gatilho era o `view.dom`, e o trajeto do mouse até ela cruza essa borda por
obrigação. Segundo, e decisivo: o `update()` do plugin escondia a alça em `geometryChanged`, por
fora de qualquer atraso, e `geometryChanged` dispara o tempo todo neste editor — a live preview
reconstrói decorações a cada `selectionSet`/`focusChanged`, o remedimento das alturas liga a flag
`Height` do CodeMirror, e isso chega a ser reentrante (`posAtCoords` → `readMeasured` → measure
síncrono → o próprio `update()`, no meio do handler de mouse). Hoje só `docChanged` esconde, e a
decisão de mostrar sai de um teste de ponto-dentro-de-retângulo num `mousemove` de `window`: a
zona ativa é o `view.dom` esticado 32px pra esquerda, então texto, respiro e alça são uma região
contínua, sem fronteira nenhuma pra cruzar. A área de acerto da alça tem a altura do bloco
inteiro (o botão visível continua 16px, alinhado ao topo), pra que sair pela esquerda de qualquer
linha de um bloco de várias linhas passe por ela. **Não simplifique isso de volta pra
`mouseleave`.** Consequência que vale registrar: nada em reação a um `update()` pode chamar
`posAtCoords`/`coordsAtPos` — `readMeasured` lança exceção durante um ciclo de update.

### ADR-19 · Alinhar/distribuir no canvas: reimplementado por fora, sem API do Excalidraw

**Obsoleto (01/09/2026, ADR-20).** O recurso agora vem
do Excalidraw nativo (o motivo original pra reimplementar era só "a UI nativa está desligada" —
premissa que caiu). E havia um bug real na versão própria: `alinhar`/`distribuir` só moviam
elementos com id em `selectedElementIds`, que não inclui texto vinculado a uma forma — alinhar
um retângulo com texto deixava o texto pra trás. O Excalidraw nativo trata texto vinculado,
seta ligada e grupo corretamente. `src/canvas/alinharDistribuir.ts` foi apagado. Mantido abaixo
só como registro histórico do porquê a versão própria existiu.

**Contexto (histórico):** pedido do usuário (já registrado no roadmap dele) — alinhar elementos selecionados
(esquerda/centro/direita, topo/meio/base) e distribuir espaçamento uniforme entre 3+ elementos,
no canvas de desenho. O Excalidraw nativo tem isso, mas só na UI dele, que este app desliga por
completo (CSS) em favor de `ToolbarCanvas.tsx`/`PropriedadesCanvas.tsx` próprios.

**Investigado e confirmado sem API pública**, mesma classe de achado do ADR-17: o Excalidraw
0.18.1 tem `alignElements`/`distributeElements` por dentro (`.d.ts` mostram os arquivos
`align.d.ts`/`distribute.d.ts` e as ações `actionAlign*`/`actionDistribute*`), mas nenhum dos
dois símbolos é reexportado pelo índice público do pacote (`excalidraw/index.d.ts`, lista de
exports conferida por inteiro), nem por subpath import (o `package.json` do pacote só declara
`"types"` nesse subpath, sem `"default"` — um `import ... from "@excalidraw/excalidraw/align"`
nem compilaria, o bundler não acharia JS correspondente), nem aparece em nenhum bundle de
`dist/prod/*.js` (grep direto, zero ocorrências — confirma que nem por caminho não-documentado
dá pra acessar em runtime). Não há atalho de teclado nativo utilizável programaticamente: isso
dependeria do `actionManager` interno, que também não é exposto pela `ExcalidrawImperativeAPI`.

**Decisão:** reimplementar por fora, `src/canvas/alinharDistribuir.ts` — matemática própria
sobre campos públicos do elemento (`x`, `y`, `width`, `height`, `angle`), mesma filosofia do
ADR-17. `boundingBoxRotacionado` gira os 4 cantos do retângulo em torno do centro e tira o
min/max — mesma trigonometria de `pontoDentroDaForma` (`selecaoFormaVazia.ts`), aplicada ao
problema inverso. **Deliberadamente não usa `getCommonBounds`**, que o pacote exporta
publicamente: a assinatura do tipo não documenta se ele já considera rotação, e o ADR-17 já
rejeitou confiar em comportamento não-documentado do Excalidraw uma vez — não valia a pena
apostar de novo por uma função a mais.

**Convenção de distribuição escolhida:** espaço vazio igual entre bounding boxes consecutivos
(como Figma/Illustrator/PowerPoint), não centro-a-centro igual — é o que qualquer usuário vindo
de outra ferramenta de design espera ao clicar em "distribuir".

**Limitação aceita, v1:** `alinhar`/`distribuir` tratam cada elemento selecionado
independente — `groupIds` não é respeitado, um grupo pode "esticar" em vez de mover inteiro
junto. Não há suporte a grupo em nenhum outro lugar do app hoje; revisitar se/quando grupos
virarem uma funcionalidade de verdade.

**Onde mora na UI:** painel de propriedades (`PropriedadesCanvas.tsx`), não a toolbar flutuante —
decisão do usuário. Segue o mesmo padrão de toda ação que atua sobre "os elementos selecionados
agora" (cor, espessura, opacidade) e não mexe na ordem fixa e já documentada dos 3 grupos da
toolbar (doc 06, "Toolbar do canvas").

### ADR-20 · Volta pra UI nativa do Excalidraw; ADR-11/12/17(parcial)/19 revistos

**Contexto:** a toolbar (`ToolbarCanvas.tsx`) e o painel de propriedades (`PropriedadesCanvas.tsx`)
próprios, construídos numa fatia inteira pra substituir a UI nativa do Excalidraw (escondida por
CSS), cobriam bem menos do que ela: sem ordem de camadas, espelhar, cantos, pontas de seta,
copiar/colar estilo, duplicar, agrupar. E o alinhar/distribuir reimplementado (ADR-19) tinha um
bug real, achado em uso: só movia elementos com id em `selectedElementIds`, e texto vinculado a
uma forma não está nesse conjunto — alinhar um retângulo com texto deixava o texto pra trás.
Reclamação do usuário: "as ferramentas de distribuição ficaram bem estranhas, algumas outras
ferramentas não se comportam como o esperado".

**Investigado antes de decidir** (não presumido): a API pública do Excalidraw 0.18.1 foi
levantada por completo — `ExcalidrawProps` inteiro, `UIOptions` inteiro, o conteúdo exato do
painel de propriedades nativo (`Actions.tsx`), os slots de composição (`renderTopRightUI`,
`MainMenu`, `Footer`, `Sidebar`/`DefaultSidebar`, `WelcomeScreen`, `Stats`), a customização de
paleta de cor (não existe — hardcoded), e os efeitos do `--theme-filter`/`theme` prop.

**Decisão: ligar a UI nativa, apagar a própria.** O essencial do produto sobrevive por API
pública:

- `onLinkOpen` (wikilink em elemento) — já em uso, prop pública de primeira classe, não muda.
- Fundo pontilhado, autocomplete de `[[` na caixa de texto nativa — implementados por fora da
  UI (CSS abaixo do canvas, listener de DOM), sobrevivem intactos. Colar imagem foi refeito
  depois (ver ADR-21).
- `renderTopRightUI` (canto superior direito, slot público) hospeda o único pedaço de UI
  própria que resta: `LinkDoElemento.tsx`, o campo de link com autocomplete de nota — o popup
  nativo de `Ctrl+K` é um `<input>` cru, sem gancho pra isso.

**O que foi aposentado, e por quê (decisões tomadas com o usuário nesta rodada):**

1. **ADR-12 (cor de elemento acompanha o tema).** O seletor de cor nativo não é customizável —
   paletas hardcoded nas actions, constantes não exportadas (confirmado: zero ocorrência em
   qualquer bundle de `dist/prod/*.js`). Sem controle da paleta, manter a conversão só produzia
   cena mista e um vetor real de corrupção de cor (a "aproximação conhecida" do ADR-12 — falso
   positivo de `ehPostit` num retângulo sólido de canto vivo — deixa de ser improvável quando o
   painel nativo dá acesso direto e independente a `stroke`/`background`/`fillStyle`/`edges`). O
   disco passa a gravar a cor exata escolhida (doc 02 §3.3.1 reescrito).
2. **ADR-11 (filtro de tema escuro desligado).** Só existia por causa do ADR-12. O modo escuro
   do canvas volta a ser o filtro de inversão nativo do Excalidraw.
3. **Post-it (RF5.9, P0 até então).** Não há slot público pra ferramenta nova na toolbar nativa,
   e decisão do usuário: não precisa dele. Post-its já desenhados continuam renderizando (são
   retângulo + texto vinculado, formato nativo) — só não dá mais pra criar um novo por botão.
4. **ADR-19 (alinhar/distribuir reimplementado).** Motivo original — "a UI nativa está
   desligada" — caiu. `alinharDistribuir.ts` apagado; o recurso nativo trata texto vinculado,
   seta ligada e grupo corretamente, o que a versão própria não fazia.

**O que ficou visível e não dá pra esconder (aceito, sem escolha):** `UIOptions.tools` só aceita
`{ image: boolean }` — confirmado nos três níveis (tipo, normalização em `index.tsx`, e o
`Extract<>` que o dropdown usa pra filtrar `SHAPES`). Frame (`F`), embed/iframe, laser (`K`) e
"Mermaid to Excalidraw" voltam a aparecer no menu de "mais ferramentas", incondicionalmente.
`aiEnabled={false}` tira só os dois pontos de entrada de IA (text-to-diagram, magicframe) — não
tira o Mermaid nem o heading "Generate", que são incondicionais no código do pacote.

**Regressão silenciosa evitada, achada só pela investigação (não por teste manual):** a guarda
de "ignora clique na nossa UI" da seleção de forma vazia (ADR-17) dependia de
`closest(".excalidraw")` devolver `null` pra clique na toolbar/painel próprios, que eram irmãos
do Excalidraw na árvore. Com a UI nativa ligada, toolbar/painel/popovers ficam **dentro** de
`.excalidraw` — a guarda antiga aceitaria clique neles e podia selecionar uma forma vazia
escondida atrás do painel. Trocada por `e.target instanceof HTMLCanvasElement`.

**Consequência que a doc 06 registra:** a seção "Toolbar, painel de propriedades e paletas do
desenho" foi reescrita pra descrever a remoção, não a implementação — inclusive as paletas de
traço/preenchimento/post-it, que não existem mais como tokens do canvas (o usuário escolhe entre
as cores nativas do Excalidraw agora).

**Escopo do que não foi tocado nesta rodada:** `atalhosCanvas.ts` (bloqueio de `Ctrl+Delete` e
reencaminhamento de `Ctrl+S/O/P/T/W`) — revisado e mantido como está, porque `UIOptions.
canvasActions` (`loadScene`, `saveToActiveFile`, `clearCanvas`, todos `false`) já esconde os
itens de menu correspondentes, então não há hoje item de menu visível cujo atalho fique morto.

### ADR-21 · Imagem no canvas: sem handler de paste, adoção no onChange

**Contexto:** pedido do usuário — colar uma imagem no canvas inseria **duas**: uma com a
proporção certa e outra minúscula e quadrada; e, ao reabrir o desenho, a imagem boa aparecia
"desvinculada" (placeholder no lugar dela).

**Investigado no bundle do Excalidraw 0.18.1:**

- O Excalidraw escuta `paste` em `document` (`pasteFromClipboard`) e **não checa
  `event.defaultPrevented`**. O handler próprio do app (`EditorDesenho.colarImagem`, um
  `onPaste` no div raiz) chamava `preventDefault()`, mas isso não impedia o nativo de rodar —
  os dois inseriam uma imagem. A minúscula era a do app: `convertToExcalidrawElements` com um
  elemento `image` sem `width`/`height` cai no default `zr × zr` (quadrado fixo), sem ler a
  dimensão real do arquivo.
- A prop `<Excalidraw onPaste>` **não** serve pra isso: no `pasteFromClipboard`, o ramo de
  imagem dá `return` antes de `this.props.onPaste` ser chamado. Ela só vê texto/elementos/
  planilha.
- `serializarDesenho` grava `files: {}` de propósito (ADR-3). A imagem nativa nunca virava
  linha em `## Embedded Files` nem arquivo no vault, então ao reabrir o `fileId` dela não
  reidratava — daí o "desvinculada".

**Decisão: nenhum handler de paste no canvas.** O paste nativo do Excalidraw cria o elemento
com a proporção certa; `imagensParaAdotar` (`src/canvas/adotarImagens.ts`), chamado no
`onChange` antes de serializar, pega toda imagem cujo `fileId` ainda não tem embed, grava o
binário como arquivo em `anexos/` e registra `fileId: [[caminho]]`. Como roda no `onChange`,
cobre também **arrastar e soltar** e a **ferramenta de imagem** da toolbar — que tinham o
mesmo bug e nenhum handler antes. Deduplicado por `fileId` (hash de conteúdo do Excalidraw).

**De quebra:** `reidratarFiles` no mount perdia a corrida quando resolvia antes de a API do
Excalidraw existir (`addFiles` era pulado sem retry). Agora os files ficam num ref e
`aoObterApi` aplica o que estiver pendente.

### ADR-22 · Agente de IA opcional é a única exceção ao local-first

**Contexto:** pedido do usuário (12/09/2026): um agente que acompanha a escrita de uma nota,
relaciona com outras notas do vault e auxilia com perguntas, conteúdo e gaps — conexão por
API key, dois modelos (gateiro barato + assistente forte), balão flutuante, pasta de
memória própria. Spec completa no doc 11.

**Decisão:** o agente existe, é 100% opcional e desligado por padrão; com ele desligado, o
app não faz nenhuma chamada de rede além da verificação de atualização (já existente). A
memória do agente vive em `%APPDATA%` por vault, nunca dentro do vault (transcript de IA
não entra no Git sem o usuário decidir). O agente **nunca escreve no vault** — sugere, o
usuário cola.

**Alternativa rejeitada:** não ter agente (o produto perde a feature pedida) ou ter agente
sempre ativo (viola o princípio local-first e o RNF5 para quem não quer).

**Consequência ruim:** é a primeira superfície que envia conteúdo do usuário para fora da
máquina, e a API key fica em texto puro no `settings.json`. Mitigações: escopo de hosts no
plugin-http (nada além dos provedores sai), aviso explícito nas configurações, participação
por nota (nada é enviado sem aceite), upgrade previsto para `keyring`/DPAPI.

**Condição de reversão:** se um provedor mudar ToS/preço a ponto de inviabilizar, ou se a
superfície de rede crescer além do catálogo de provedores (ex.: telemetria própria — que
está proibida), o agente inteiro sai do produto sem tocar em nada: todo o código mora em
`src/agente/` + `agenteStore` + três componentes de UI, e o resto do app não importa nada
dali.

### ADR-23 · API key antes de OAuth de assinatura

**Decisão:** a conexão com provedores do agente é por API key (doc 11 §10.1). OAuth de
assinatura (usar o plano Claude Pro/Max do usuário, como OpenClaw/Hermes) fica adiado.

**Motivo:** PKCE com deep link/servidor local + client ID próprio + zona cinzenta de ToS
para apps de terceiros, contra uma API key que é oficial e funciona em todos os provedores.

**Condição de reversão:** custo de API virar objeção real de uso → fase própria de OAuth,
começando pelo provedor que o usuário usar.

### ADR-24 · Uma janela por vault

**Contexto:** RF1.3 ampliado por pedido do usuário (16/09/2026) — criar vault novo, abrir
pasta existente como vault, lista de recentes, com vários vaults abertos ao mesmo tempo.
Plano completo em `docs/12-multiplos-vaults.md`.

**Decisão:** cada vault abre na própria janela do sistema operacional, não numa troca de
contexto dentro da mesma janela. O mesmo vault nunca fica aberto em duas janelas — abrir um
vault já aberto foca a janela existente em vez de abrir outra.

**Motivo:** cada webview do Tauri tem o próprio realm JavaScript, então os stores zustand
globais (`vaultStore`, `documentosStore`, `workspaceStore`, `tarefasStore`, `agenteStore`)
continuam "globais por janela" sem nenhuma refatoração de escopo — trocar de vault na mesma
janela exigiria reescrever todos eles para aceitar múltiplas instâncias, ou desmontar e
remontar o app inteiro a cada troca. Uma janela por vault também resolve de graça o problema
de dois watchers e dois processos de autosave apontando pro mesmo arquivo: como o mesmo vault
nunca abre duas vezes, não existe a hipótese de dois `documentosStore` gravando o mesmo
caminho.

**Alternativa rejeitada:** trocar de vault na mesma janela (like a tab, fecha o vault atual e
carrega o novo no lugar). Mais simples de implementar à primeira vista — só um contexto JS
para coordenar — mas exigiria refatorar todos os stores globais para escopo por vault (ou
desmontar/remontar o React inteiro a cada troca), e não permite ver dois vaults ao mesmo
tempo, algo que o usuário pediu explicitamente.

**Consequência ruim:** múltiplas janelas significam múltiplos agentes de IA e múltiplos
watchers rodando ao mesmo tempo (um por vault aberto), coordenação de flush entre janelas na
hora de atualizar o app (`docs/12` §6), e preferências da máquina (tema, largura da nota,
sidebar) precisando propagar de uma janela pra todas as outras em vez de viver só na memória
de uma. Tudo isso é código novo: `docs/12` §6 (`flushEntreJanelas.ts`, evento
`app://prefs-mudou`) existe só por causa desta decisão.

**Condição de reversão:** se a coordenação entre janelas (flush, prefs, watchers por label)
se mostrar frágil demais na prática — perda de edição na atualização do app, ou eventos
vazando entre vaults — o caminho de volta é a troca-na-mesma-janela rejeitada acima, aceitando
o custo de refatorar os stores para escopo por vault.

**Nota sobre a condição de reversão (a) do ADR-5:** o ADR-5 lista "a superfície de Rust passar
dos quatro comandos previstos" como gatilho para trocar de Tauri por Electron. Esta entrega
acrescenta cinco comandos novos (`abrir_janela_vault`, `registrar_janela_vault`,
`focar_janela`, `criar_vault`, e a mudança de assinatura de `observar_vault` para receber
`window: tauri::Window`) — nove no total, mais que o dobro do previsto. **Isso não aciona a
condição (a) no sentido em que ela foi escrita.** O ADR-5 fala em superfície de Rust como
proxy para "o app está precisando fazer coisa de domínio no lado nativo que só existe em
Node" — a condição (b) do mesmo ADR. Os cinco comandos novos são gerência de janela e de SO
(abrir webview, focar, criar pasta), não lógica de domínio do vault: não implicam sqlite
nativo, git embutido ou indexação pesada fora do WebView, que é o que motivaria trocar de
shell. O número "quatro" era uma estimativa da época, não um teto de arquitetura — o motivo
real por trás da condição (a) não se aplica aqui.

### ADR-25 · Busca unificada

**Contexto:** o app tinha duas sobreposições de busca escondidas — `QuickSwitcher` (`Ctrl+O`,
nome/alias) e `PainelBusca` (`Ctrl+Shift+F`, conteúdo via MiniSearch) — nenhuma delas com
entrada visível na interface, só atalho ou paleta de comandos. Plano completo em
`docs/13-busca.md`.

**Decisão:** as duas viram uma busca só, num campo único com as seções "Títulos" e "No
conteúdo", navegável como uma lista. `Ctrl+O`, `Ctrl+Shift+F`, o campo "Buscar" da sidebar (e o
ícone equivalente na faixa recolhida) e "Buscar" na paleta de comandos abrem a mesma
sobreposição; a mesma tecla fecha. `QuickSwitcher.tsx` é apagado — a busca por nome/alias que
ele fazia virou a seção "Títulos" de `PainelBusca`.

**Motivo:** "onde está aquela nota?" é uma pergunta só, e o app respondia com duas janelas
diferentes dependendo de como o usuário formulava a busca (nome vs. conteúdo) — decisão que o
usuário não tem como saber de antemão. Somado a isso, nenhuma das duas tinha entrada visível
(doc 13 §0, problema 1 e 6): só quem já sabia do atalho ou vasculhava a paleta de comandos
encontrava a busca. Consolidar as duas resolve as duas questões de uma vez: uma pergunta, uma
resposta, um lugar visível pra começar.

**Alternativa rejeitada:** manter as duas janelas e só corrigir os problemas de cada uma em
separado — dar entrada visível pros dois (dois campos na sidebar, ou um menu escolhendo qual
abrir), corrigir o acento e o prefixo do `PainelBusca`, completar o `Ctrl+Enter` e a criação de
nota do `QuickSwitcher`. Resolve os problemas 2–5 e 7–8 do doc 13 §0, mas não o 1 nem o 6: o
usuário continuaria tendo que escolher, antes de buscar, qual das duas perguntas está fazendo.

**Consequência ruim:** a seção "No conteúdo" tem debounce de 200 ms e lê disco (MiniSearch), então
a lista visivelmente "cresce" um instante depois da seção "Títulos", que é instantânea — a lista
não aparece pronta de uma vez. Ligar `prefix: true` e `fuzzy: 0.2` (termo de 5+ caracteres) no
índice aumenta o risco de falso positivo por correspondência parcial, o preço de aceitar "proj"
por "Projeto". O agente de IA (`src/agente/recuperacao.ts`) usa a mesma função de busca por
conteúdo e passa a herdar `prefix`/`fuzzy` também — mas continua chamando com `combinar: "OR"`
(não "AND" como a UI), porque mudar esse padrão muda o que o agente recupera e não fazia parte
desta decisão.

**Condição de reversão:** se o crescimento assíncrono da seção "No conteúdo" se mostrar confuso
na prática (usuário clica num resultado de título achando que é o único, ou a lista pula demais
enquanto a pessoa ainda está lendo), separar de novo em duas apresentações — um popover de
título instantâneo e um painel de conteúdo à parte — mantendo a mesma entrada única de busca (um
campo, um atalho) por cima das duas.

### ADR-26 · Tabelas: menu e controles no padrão do app, alterando o editor vendorizado

**Contexto:** plano completo em `docs/14-tabelas.md`. O editor vendorizado
(`@atomic-editor/editor` 0.6.2, ADR-10) já reconhece tabela GFM digitada e edita célula a
célula, mas com três problemas de produto: não existe forma de criar uma tabela sem já saber a
sintaxe; o menu de linha/coluna é montado em DOM puro, em inglês, com visual próprio fora do
doc 06 (`.cm-atomic-table-menu`, sombra e raio que não são tokens); e o alinhamento de coluna
(`:---:`) é lido do arquivo e descartado no serialize — editar uma célula de uma tabela
alinhada apagava o alinhamento no arquivo em disco.

**Decisão:** tratar as três lacunas mexendo dentro do próprio vendorizado, cada alteração
marcada com `// [excalisidian]` (regra do `LEIA-ME.md` do diretório): um modelo de tabela puro
e imutável (`table-model.ts`) que preserva alinhamento em toda operação; o widget para de
montar o menu sozinho e expõe um facet (`tableMenuFacet`); e uma extensão nova do projeto
(`menuTabela.tsx`) renderiza o menu com `Menu`/`ItemMenu` do app, em português. Criação por
digitação, paleta de comandos e barra de formatação; controles visuais (faixas "+", alças,
arraste por eventos de ponteiro) seguindo os tokens do doc 06.

**Motivo:** o menu em inglês e em DOM próprio é a superfície mais visível de "isto não parece o
resto do app"; o alinhamento sendo apagado do arquivo fere o princípio "os arquivos são o
produto" (RNF7, ADR-4) — o usuário perde formatação que escreveu, ou que veio de outro editor,
sem nenhum aviso; e não existir jeito de criar uma tabela sem saber a sintaxe markdown contradiz
o objetivo de live preview no nível do Obsidian.

**Achado que motivou parte da decisão:** editar qualquer célula de uma tabela com alinhamento
(`:---:`, `---:`) apagava o alinhamento no arquivo em disco no editor vendorizado original — o
parser lia a linha delimitadora, mas o modelo interno e o serialize não guardavam essa
informação, então a próxima gravação escrevia a tabela sem ela. Isso é uma violação direta do
princípio "os arquivos são o produto" (o app reescrevia markdown que o usuário não pediu para
mudar) e é, junto com a ausência de criação, o motivo principal para mexer no vendorizado em
vez de só cobrir o que faltava por fora.

**Consequência ruim:** mais divergência em relação ao upstream `@atomic-editor/editor` — o
diretório já era vendorizado (ADR-10) exatamente para isolar esse risco, mas cada alteração
marcada aumenta o custo de comparar com uma eventual versão de referência no futuro, ainda que
o pacote não seja mais consumido do npm. Também: a barra de formatação flutuante, ao passar a
aparecer acima do cursor mesmo sem seleção, cobre a linha de cima enquanto o usuário digita —
trade-off aceito explicitamente pelo usuário (16/09/2026) em troca de a barra estar sempre
alcançável, sem precisar selecionar texto primeiro.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Menu nativo do CodeMirror/DOM, só traduzido e restilizado por CSS | Mantém a divergência de raio/sombra fora do doc 06 e não dá de graça o que `Menu`/`ItemMenu` já resolvem no resto do app — foco, teclado, fechar em clique fora. |
| Barra de formatação fixa no topo do editor, sempre visível | Rejeitada pelo usuário: a barra ancorada na posição do cursor (ou da seleção) é o comportamento pedido, mesmo que isso signifique cobrir a linha de cima ao digitar sem seleção. |

**Condição de reversão:** se `table-model.ts` e as alterações marcadas em `table-widget.ts` se
mostrarem difíceis de manter a cada tentativa de atualizar o vendorizado, ou se a barra acima do
cursor incomodar no uso real a ponto de o usuário pedir mudança, revisar isoladamente — a barra
pode voltar a só aparecer com seleção sem afetar o modelo de tabela, e o modelo de tabela e o
menu continuam valendo mesmo que a barra mude.

### ADR-27 · Nome informado pelo usuário e conteúdo de exemplo no primeiro vault

**Contexto:** plano completo em `docs/15-onboarding.md`. Até aqui, o nome usado na saudação da
Home vinha direto do usuário do Windows (`USERNAME`, comando Rust `nome_usuario`), sem nenhum
lugar para corrigir; e a tela sem vault (`EstadoVazio` "Nenhum vault aberto") não explicava o
que é um vault nem sugeria nada — o usuário tinha que escolher pasta pelo diálogo nativo sem
nenhuma sugestão pronta, e o vault criado ficava vazio.

**Decisão:** uma tela de boas-vindas só (sem passos) substitui a tela sem vault, com marca,
pergunta de nome (só na primeira vez, editável depois nas Configurações) e criação do primeiro
vault com sugestão pronta (nome "Notas", local a pasta Documentos, um clique cria). O vault
criado por essa tela vem com conteúdo de exemplo: uma nota de boas-vindas e um desenho de
exemplo linkado a ela.

**Motivo.** Três problemas, um por decisão:

- **Usuário do Windows sem separador vira nome ilegível.** `LucasFidelisdeCristo` (sem espaço,
  ponto, hífen ou underscore) virava "Lucasfidelisdecristo" na saudação, e não havia onde
  corrigir — o único jeito de trocar era editar `USERNAME` do sistema operacional.
- **Primeiro uso sem explicação.** A tela sem vault dizia só "Nenhum vault aberto", sem dizer o
  que é um vault nem por que a pasta escolhida importa — alguém abrindo o app pela primeira vez
  não tinha contexto nenhum antes de escolher uma pasta do disco.
- **Vault vazio.** Criar o primeiro vault e cair numa Home sem nenhum arquivo não mostra nada
  do que o app faz — nem live preview, nem wikilink, nem desenho embutido.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Onboarding em passos (wizard) | Decisão do usuário: uma tela só, sem navegação entre passos, é mais rápido pra quem só quer começar a escrever. |
| Perguntar o nome na Home para quem já usa o app e nunca informou | Rejeitada: interromper quem já usa o produto para pedir um dado cosmético (a saudação) fere o princípio de não interromper à toa. O campo fica nas Configurações, disponível mas não obrigatório; até lá, a saudação sai sem nome. |
| Sem conteúdo de exemplo (vault sempre vazio) | Resolve a decisão mais simples de implementar, mas deixa o problema do vault vazio sem resposta — nenhuma pista de como usar o app pela primeira vez. |
| Só nota de exemplo, sem desenho | Mais simples, mas a metade "desenho no mesmo lugar" do produto (a proposta central do Excalisidian) ficaria invisível no primeiro contato — a nota de boas-vindas embute o desenho de propósito, pra mostrar as duas coisas juntas. |

**Consequência ruim:** arquivos são criados no vault do usuário sem ele pedir explicitamente
cada um — "Boas-vindas.md" e "Primeiro desenho.draw.md" aparecem sozinhos ao criar o primeiro
vault pela tela de boas-vindas. Mitigado de duas formas: (1) só acontece nesse um caminho — o
primeiro vault criado pelo onboarding; "Criar vault…" da sidebar e "Abrir pasta" nunca criam
conteúdo de exemplo; (2) a própria nota de boas-vindas diz que dá para apagar os dois arquivos
à vontade (doc 15 §1.3). O comando Rust `nome_usuario` (ADR-16) fica só como fonte da
*sugestão* de nome — nunca mais usado direto numa saudação sem o usuário ter confirmado ou
editado o valor.

**Condição de reversão:** se o conteúdo de exemplo se mostrar confuso na prática (usuário
reporta achar que "Boas-vindas"/"Primeiro desenho" são arquivos do próprio trabalho, não uma
demonstração), a criação automática pode ser trocada por um convite explícito ("Criar nota de
exemplo?") sem tocar no resto do onboarding — o nome do usuário e a sugestão de vault continuam
valendo independente disso.

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

Verificado em 28/09/2026 em `api-docs.deepseek.com` (fornecedor da IA do Excalisidian, ADR-43; o nome do fornecedor não aparece na interface, só neste documento técnico):

- Modelo `deepseek-flash`, base `https://api.deepseek.com`, compatível com o dialeto OpenAI (rota `/chat/completions`), contexto de 1M tokens.
- Preço por milhão de tokens, fora de pico: entrada com cache US$ 0,003, entrada sem cache US$ 0,15, saída US$ 0,60. No pico: 0,006 / 0,30 / 1,20.
- Pico: 01:00–04:00 e 06:00–10:00 UTC, de segunda a sexta (exceto feriados chineses); o resto é fora de pico.
- O modo de raciocínio vem ligado por padrão e desliga com `"thinking": {"type": "disabled"}` no corpo. O parâmetro de teto de saída é `max_tokens`.
- `usage` traz `prompt_tokens` e `completion_tokens`, mais o detalhe de cache (`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`) — ver Parte 3, item 33, sobre onde ele aparece.

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

12. ~~**Esconder ferramentas da toolbar por CSS.** Funciona hoje, mas depende de classes internas. Por isso a recomendação de construir a toolbar própria em vez de estilizar a nativa.~~ **Invertido na prática (01/09/2026).** A toolbar própria foi construída, usada por uma fatia inteira, e depois abandonada — cobria menos do que a nativa (sem camadas, espelhar, cantos, agrupar, alinhar/distribuir de verdade) e tinha bug real no alinhar/distribuir. A decisão final foi a oposta desta nota: usar a UI nativa e não esconder nada por CSS. Ver doc 09, ADR-20.
13. **Renderizar o desenho como SVG para embutir na nota.** `exportToSvg` existe e é a peça certa, mas não testei o custo de renderizar vários embeds numa nota longa. Pode ser necessário cachear o SVG por `mtime` do desenho.
14. **Números de desempenho dos requisitos não funcionais.** RNF1 (5 000 notas em 2 s), RNF3 (500 elementos a 60 fps) e o limite de 3 000 elementos são metas que eu escolhi como razoáveis, não medições. Ajuste depois do primeiro benchmark real.
15. **Tamanhos e medidas do design system que não vieram do Taskly** — altura de aba 34px, sidebar 264px, margem de 76px, coluna de texto de 720px, grade de 20px. São decisões minhas, coerentes com o sistema, mas não testadas em tela.
16. ~~Contraste AA dos tokens.~~ **Medido na revisão, e havia problema.** Com os valores originais do Taskly, `tinta-suave` (`#7A7268`) dava 3,95:1 sobre `papel` e 3,57:1 sobre `lavagem` — reprovado em AA, e é a cor de todo o metadado do produto em 11px. Corrigido para `#655E54` (5,34 / 4,82) no claro e `#9A9384` (5,13 sobre `lavagem` escura) no escuro. `ocre` (3,21:1 sobre `papel`) foi mantido como cor de preenchimento e destaque, e proibido como cor de texto sobre fundo claro — para texto usa-se `ocre-tinta` (5,54:1). **Estes valores divergem do design system do Taskly de propósito.** Se você quiser os dois produtos idênticos, é o Taskly que precisa da correção.
17. **Fontes do Excalidraw empacotadas.** ~~Excalifont vem com o pacote e o projeto é MIT, mas confirme a licença da fonte especificamente antes de distribuir o instalador.~~ **Resolvido** (2026-09-04): todas as fontes copiadas são OFL-1.1, listadas em `THIRD_PARTY_LICENSES.md`.
19. **Status atual do pedido de marca EXCALIDRAW.** O registro público que consultei mostrava um status que parecia desatualizado para um pedido de 2021, e a consulta ao TSDR do USPTO foi recusada. Considere a marca como reivindicada e em processo, com status final desconhecido.
20. **Tamanho de arquivo por elemento.** Os números do ADR-2 (450–700 bytes por forma, ~14 bytes por ponto de traço à mão livre, limiar de 1,5 MB) vêm de contar os campos reais do `ExcalidrawElement`, não de benchmark publicado — não existe dado oficial. Meça com suas cenas antes de confiar no limiar.
21. **A resolução de desenho por nome base duplo** (`Nome.draw` e `Nome`, com a nota vencendo o empate) é decisão desta rodada e não foi testada. É o teste 3 do documento 05.
22. **Nada aqui foi visto funcionando.** Não rodei código, não abri o Obsidian, não instalei nada. Tudo é leitura de documentação e de código-fonte. Onde a documentação estava errada ou desatualizada, este pacote está errado junto.

23. **Streaming (SSE) pelo `@tauri-apps/plugin-http`.** O plugin faz a ponte de reqwest para o JS, mas o comportamento com Server-Sent Events (respostas streamadas de LLM) não foi verificado na versão que será instalada. A v1 do agente é não-streaming de propósito; validar antes de prometer streaming no painel de conversa (doc 11 §11).

24. **Web search da OpenAI exige a Responses API**, não o Chat Completions — o tool `web_search` não está disponível no endpoint `/chat/completions` que o dialeto `openai` do agente usa. Não verificado em chamada real. Se não validar, OpenAI fica sem web search na v1 (doc 11 §5.4 já registra a contingência).

25. **Passthrough de tools pelo OpenRouter** (web search nativo do provedor de origem) não é garantido para todos os modelos — o próprio OpenRouter documenta suporte parcial. Tratar como indisponível até teste real.

26. **Preços por milhão de tokens do catálogo do agente** (doc 11 §3.1) mudam com frequência e os números que entrarem no catálogo são aproximados na data da escrita. O medidor de custo é estimativa; a verdade é o billing do provedor.

27. **Endpoint exato do "Alibaba token plan" do usuário.** O catálogo assume o DashScope compatible-mode (`https://dashscope.aliyuncs.com/compatible-mode/v1`); se a conta do usuário usar um gateway diferente, o campo de base URL editável cobre — mas a URL real precisa ser confirmada com o usuário antes da fase 1 (doc 11 §3).

28. ~~**Domínio placeholder.**~~ **Resolvido:** o dono do produto registrou o domínio
`excalisidian.com` em 26/09/2026. O servidor de verdade passa a viver em
`https://api.excalisidian.com` (docs/18-servidor.md, ADR-41).
29. **Plano da assinatura preso até reiniciar.** O plano só é lido na abertura do app. Quem assinar pelo site continua vendo "Plano grátis" até fechar e reabrir o Excalisidian. Resolver isso exige um endpoint que não existe; usar `renovar` só para checar o plano rotacionaria o token a cada verificação, o que não é aceitável.
30. **Sem renovação automática de sessão.** Um token que expira durante o uso não é renovado sozinho; o usuário precisa entrar de novo.
31. **Fornecedor de IA e GDPR.** O modelo previsto no estudo de viabilidade para a IA do Excalisidian é de um fornecedor chinês. Mandar notas de um usuário europeu para lá é transferência internacional de dados sob o GDPR. Verificar se existe hospedagem ocidental do mesmo modelo antes de anunciar preço para esse serviço.
32. ~~**Endpoint de saldo de créditos não existe.**~~ **Resolvido (28/09/2026):** o servidor expõe `GET /v1/creditos` (doc 18 §5, ADR-43). O medidor segue oculto sempre que a busca falha — mostrar zero seria mentir sobre dinheiro.
33. **Onde a resposta real do fornecedor traz o detalhe de cache.** A documentação lista `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` dentro de `prompt_tokens_details`; historicamente vinham no topo de `usage`. Não foi confirmado qual lugar a resposta real usa. O servidor lê os dois e, sem nenhum, trata toda a entrada como sem cache (cobra mais, nunca menos). Confirmar com uma chamada real na implantação.
34. **Câmbio do plano em reais.** A conta de preços do ADR-43 supõe R$ 5,50 por US$, sem verificação. O custo de IA é em dólar; o anual em reais dá prejuízo no pior caso com o dólar acima de ~R$ 6,27 (premium) e ~R$ 6,08 (superior).
35. **Imposto sobre consumo no Brasil.** Não se sabe se o preço em reais leva o imposto incluso ou somado; conferir com o intermediário de pagamento antes de cobrar.
36. **GDPR do fornecedor de IA.** Já registrado no item 31, que continua valendo: as notas passam por um fornecedor chinês. Não bloqueia uso no Brasil.
37. **Estimativas de uso por crédito** (leitura rápida ~1 crédito, rodada do acompanhamento 2–3, mensagem de chat ~2; 3.000 créditos ≈ 120 h de escrita intensa no pior horário, ~300 h de dia) são cálculo sobre a tabela de preços, não medição. Medir com uso real.

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
7. **Uma senha só para conta e vault, ou duas?** **Decidido em 23/09/2026: uma senha só, a
   da conta — ver ADR-39.** As opções abaixo ficam registradas como histórico de como se
   chegou até a decisão.

   - **Uma senha só** (o modelo do Bitwarden e do 1Password): você decora uma coisa só. Mas
     essa senha **nunca pode ir para o servidor do jeito que foi digitada** — o app precisa
     derivar dela duas chaves diferentes: uma que prova a sua identidade para o servidor, e
     outra que cifra o vault e nunca sai do seu computador. Consequência: esquecer essa senha
     única faz você perder o acesso à conta **e** as cópias sincronizadas, no mesmo momento.
   - **Duas senhas separadas:** a senha da conta funciona como a de qualquer serviço comum —
     dá para redefinir por e-mail se você esquecer. A senha do vault é outra, e essa não tem
     recuperação (ADR-33). Dá mais trabalho para decorar duas senhas, mas quem esquece a
     senha da conta não perde nada do vault.
   - **Um fato técnico que precisa entrar nessa decisão:** hoje, o código
     (`ServicoContaHttp.entrar`) manda a senha da conta para o servidor exatamente como ela
     foi digitada, protegida só pela conexão cifrada (o "cadeado" do navegador). Isso é normal
     para uma senha de conta comum, do tipo que dá para redefinir. **Mas se a decisão for
     "uma senha só", isso tem que mudar antes de a sincronização existir** — senão o servidor
     passaria a receber a mesma senha que protege o vault, e poderia, em tese, derivar a
     chave que abre suas notas. Isso quebraria a promessa do ADR-32, de que o servidor não
     consegue ler nada.

---

## Parte 5 — Resultado do spike do canvas (Fatia 0)

Feito em 28/08/2026, na primeira sessão de código.

**Decisões fechadas antes da Fatia 0:** nome do produto `excalisidian` fechado (`APP_ID` único, ADR-9 encerrado para o MVP); Windows só, normalização NFC apenas; repositório Git novo na raiz `C:\Excalisidian`; vault de teste em `C:\Excalisidian-vault-teste`.

**Ambiente medido:** Windows 11 Pro 26200. Rust 1.98.0 (MSVC). Node 24.11.1. WebView2: versão da máquina (Edge/Chromium embutido do Windows 11) — o número exato aparece no rótulo da tela de spike.

**Infra do spike:** `src/app/SpikeCanvas.tsx` monta o `@excalidraw/excalidraw` 0.18.1, gera 500 retângulos com `convertToExcalidrawElements` e mostra um contador de FPS ao vivo (requestAnimationFrame). `window.EXCALIDRAW_ASSET_PATH = "/"` no `index.html` e as fontes do Excalidraw copiadas para `public/` por `postinstall` — canvas funciona offline. É tela descartável; sai na Fatia 6.

**Build:** compila sem erro. `cargo check` 2m51s e `tauri dev` 3m54s na primeira vez (380 crates), segundos nas seguintes. Frontend `tsc` limpo e `vite build` ok.

**Medição de pan/zoom com 500 elementos:** FPS mais baixo observado durante pan e zoom contínuos = **52 fps**. Faixa "aceitável" (fluido ≥ 55, aceitável ≥ 35, travando < 35). Sem engasgo perceptível na interação.

**Conclusão:** o canvas monta e renderiza 500 elementos no WebView2 a ~52 fps sob pan/zoom — aceitável para o MVP, sem necessidade de plano B. Nenhuma decisão de arquitetura muda. Revalidar na Fatia 6 com cena real (imagens + post-its) e checar se traço à mão livre pesado derruba o número; se cair abaixo de ~35, aplicar o plano B do doc 05 §5 (reduzir a cena, revisar re-renders, desmontar canvas fora de vista) — não trocar de shell.

### ADR-28 · Picos em ASCII no fundo da Home: shader autoral, não um efeito comprado

**Contexto:** pedido do usuário (16/09/2026) inspirado no efeito pago "ASCII Peaks" do
marketplace shaders.com, pra ficar bem suave (15% de opacidade) por cima da vinheta do papel
de parede da Home/aba em branco. Antes de implementar, fui checar se dava pra usar o efeito de
lá de graça.

**Achado — shaders.com não serve nem de graça.** O plano free deles ("License Agreement",
`shaders.com/license`) permite só "projetos pessoais, protótipos e avaliação", proíbe
explicitamente exportar código ou usar em "contexto de produção", e a única exceção pra projeto
open source vale só pra site de divulgação/documentação — nunca pro app em si. Não é questão de
achar o item certo: o marketplace inteiro funciona assim, "Enter The Matrix" e "Ascii Peaks"
incluídos.

**Decisão:** implementar do zero, código nosso, técnica de "ASCII art shader" genérica e bem
documentada (luminância de um relevo gerado por ruído vira caractere de um atlas — não um
raymarch 3D como o efeito de referência provavelmente faz): `src/ui/excalisidian/
asciiPeaksShader.ts` (driver WebGL2 puro) + `AsciiPeaks.tsx` (React, liga/desliga por tema,
`prefers-reduced-motion` e visibilidade).

**Outras fontes checadas, e por que não servem:**

- **Shadertoy.** A licença padrão de lá é CC BY-NC-SA (não-comercial) — a maioria dos shaders
  de "matrix rain"/"ascii" encontrados está nela por padrão, e não há como filtrar por licença
  no site. Só serve se o autor específico marcou CC0 na página.
- **Repositórios do GitHub sem `LICENSE`** (ex.: `ryok/matrix-rain-3d`, bonito mas sem arquivo
  de licença) **— repositório público não é sinônimo de livre pra usar.** Sem licença explícita,
  vale "todos os direitos reservados" por padrão, mesmo com o código visível.
- **Godot Shaders com licença CC0 explícita** (ex.: o "Matrix Rain" de lá) é o único caminho de
  "pegar pronto" que checou como realmente livre — não foi o caminho escolhido aqui porque o
  pedido era "ascii peaks" (relevo), não "matrix rain" (chuva de caracteres), e portar GLSL de
  outro motor ainda exige adaptar uniforms.

**Cor:** o acento de marca do app (`--color-cristal`), não o ciano do exemplo pago — teria que
vir de um token nosso de qualquer forma (regra do `CLAUDE.md`: nenhuma cor fora dos tokens), e
cristal já é "a cor de destaque" em todo o resto da interface (link, seleção, foco).

**Consequência ruim:** sem ter visto o efeito rodando de verdade (o ambiente onde isto foi
escrito não abre o app nem um navegador com WebGL) — a fidelidade visual ao pedido ("bem suave",
composição de "picos") pode precisar de um ou mais ajustes finos depois que o usuário vir na
tela real. Os parâmetros (tamanho de célula, velocidade de deriva, posição do aglomerado de
picos, opacidade) ficam isolados em constantes no topo de `asciiPeaksShader.ts` e uma única
regra de CSS (`.tela-inicio__ascii { opacity: 0.15 }`) exatamente por causa disso.

**Pendência encontrada, não deste ADR:** a funcionalidade de papel de parede da Home
(`papel-parede-home-store.ts`, `papel-de-parede-home.ts`) em si não tem nenhum registro em
`docs/06` nem `docs/09` — não foi documentada quando entrou. Fora do escopo deste pedido,
registrado aqui pra não se perder.

**Condição de reversão:** se a técnica de atlas-de-caractere-em-textura não ficar nítida o
bastante em telas de alto DPI, trocar por SDF de caractere (glifo vetorial, sem pixelizar ao
redimensionar) é o upgrade natural — mais caro de implementar, só vale se o atlas bitmap
realmente incomodar em tela.

**Atualização (16/09/2026) — achados do primeiro round de teste em tela real:**

1. **Efeito parado.** O `IntersectionObserver` que pausa a animação fora de vista podia
   receber uma primeira leitura falsa de "não está visível" — o layout do dockview às vezes
   ainda não tinha dado altura ao painel no instante exato da primeira medição, e o efeito
   ficava pausado no primeiro quadro pra sempre. Corrigido em `AsciiPeaks.tsx`: só passa a
   confiar num "não está visível" depois de já ter visto um "está visível" de verdade.
2. **Relevo "quadriculado", pouco parecido com o de referência.** O ruído original era um hash
   2D escrito à mão — tosco de propósito, pra não pesar, mas pareceu áspero demais. Trocado
   pelo simplex 2D de Ian McEwan/Ashima Arts (`webgl-noise`, MIT, com atribuição no comentário
   do fragment shader) — o mesmo ruído que aparece em praticamente todo shader de terreno.
3. **Sem o brilho do efeito de referência.** Cada célula só variava em opacidade, plana — sem
   o "vazamento" de luz que dá o ar de LED/neon no "ASCII Peaks" original. Adicionado um halo
   analítico (aproximação de bloom sem segunda passada de blur) que cresce com a altura do
   relevo, e a cor passou a clarear pro branco nos pontos mais altos (o núcleo quente de um
   brilho de verdade), não só ficar "mais opaca" na mesma cor — a identidade de cor continua
   vindo só de `--color-cristal`.
4. **Brilho estático demais, sem resposta a presença do usuário.** O halo só reagia à altura do
   relevo, nunca a nada que o usuário fizesse. Reaproveitado o mesmo pipeline de halo/cor (item
   3 acima) pra também intensificar perto do cursor — raio de cerca de 160–220px de tela, mesmo
   brilho e clareamento pro branco que já existiam pros picos altos, só que agora também função
   da distância até o ponteiro. Por ser resposta direta a um gesto do usuário (não animação
   automática do relevo), essa reação ao mouse não é desligada por `prefers-reduced-motion` —
   a animação automática continua respeitando a preferência normalmente.

**Bibliotecas de shader levantadas nessa investigação** (pra não perder a pesquisa): LYGIA —
**não é MIT**, é Prosperity License (grátis só pra uso não-comercial, precisa de licença paga
depois de 30 dias em produção comercial) — fácil de confundir com MIT porque é a mais
recomendada da internet, mas não serve aqui sem pagar. As de verdade livres, checadas uma a
uma: `ashima/webgl-noise` (MIT, usado acima), `hughsk/glsl-noise` (MIT, o mesmo ruído
empacotado), os artigos do `iquilezles.org` (trechos de código em MIT), e
`mattdesl/glsl-ascii-filter` (MIT, função pronta de conversão luminância→ASCII, ainda não
adotada — o núcleo atual continua sendo o atlas de caracteres em Canvas2D).

**Segunda rodada de interação (16/09/2026) — do "brilho no ponto" pro "rastro".** A v1 (item
acima) só reagia à posição ATUAL do cursor — sem memória, sem rastro. O usuário achou "muito
simples" e pediu algo mais fluido: um rastro que deixa marca e vai sumindo aos poucos, e que
também movimente os elementos de fundo (não só brilhe). Trocado por um histórico de pontos
(`rastro`, até 24 vivos por vez, `MAX_PONTOS_RASTRO`/`RASTRO_MAX` — precisam bater entre JS e
GLSL), cada um com peso caindo numa curva quadrática ao longo de 750ms (`VIDA_RASTRO_MS`) — cai
devagar no início, rápido no fim, pra ler como "sumindo" e não um corte seco. Cada ponto do
rastro faz duas coisas no fragment shader, na mesma passada: desloca a amostra do ruído por
perto de onde passou (o relevo se deforma, não só brilha) e contribui pro brilho já existente
(mesmo pipeline de núcleo/halo/cor da v1, sem camada nova). Um novo ponto só entra no histórico
se o mouse andou pelo menos `DISTANCIA_MIN_NOVO_PONTO_PX` (10px) desde o último, pra não
estourar o limite de 24 com pontos redundantes quando o mouse anda devagar ou fica parado.

**Terceira rodada (16/09/2026) — rastro maior + deformação "revolta".** Dois achados do
usuário no mesmo teste:

1. **"O rastro tem que ser maior, e se dispersar mais devagar."** Subir só a vida (`VIDA_RASTRO_MS`
   750→2200ms) sem subir também o limite de pontos (`MAX_PONTOS_RASTRO`/`RASTRO_MAX`, 24→48)
   deixaria o rastro mais ESPARSO, não maior — os pontos mais antigos seriam descartados pelo
   limite de contagem antes de terem tempo de sumir de verdade pela idade. Os dois valores
   subiram juntos. `RAIO_MOUSE_PX` também subiu (190→240px) — "maior" também no espaço que cada
   ponto do rastro ocupa, não só na duração.
2. **"A interação com os elementos do fundo está meio revolta, quebrando a fluidez."** O
   deslocamento que empurra a amostra do ruído (item "movimentar os elementos de fundo" da
   rodada anterior) somava, sem limite, um empurrão por ponto vivo do rastro — com até
   RASTRO_MAX pontos cada um puxando pro seu lado, a soma virava um campo caótico. Duas
   correções, as duas precisavam estar juntas (uma sem a outra não bastava):
   - Queda de cada empurrão mais larga/gradual (raio efetivo `* 1.6` no denominador da
     exponencial) — antes cada ponto tinha um alcance curto e isolado, lendo como vários
     puxões separados em vez de uma esteira contínua.
   - Teto no comprimento do deslocamento COMBINADO (não por ponto, na soma final) — preserva a
     direção, limita a intensidade a `uRaioMouse * 0.3`, então mais pontos vivos ao mesmo tempo
     (o rastro maior do item 1 aumenta essa chance) não conseguem mais somar um puxão
     desproporcional.

**Botão pra desligar (16/09/2026).** Pedido do usuário: uma forma de desabilitar o shader
inteiro. Preferência da máquina (`settings.json`, `asciiPeaksHabilitado`, padrão ligado — o
mesmo padrão de `barraFormatacaoAcoplada`/`nomeUsuario`, sincronizada entre janelas via
`app://prefs-mudou`), com o botão "Desabilitar shaders"/"Habilitar shaders" no rodapé da Home,
separado do grupo de papel de parede por um bullet — são preferências independentes. Desligado
não é "opacidade 0": `TelaInicio.tsx` e `PainelVazio.tsx` (Home e aba em branco, as duas telas
que usam o efeito) deixam de MONTAR o componente `AsciiPeaks` de vez, então o contexto WebGL2 é
destruído de verdade (`AsciiPeaksControle.destruir()`, já existia pro caso da tela sair de
vista) — zero custo de GPU enquanto desligado, não só invisível.

**Otimização de GPU (16/09/2026).** Pedido do usuário: o shader consome 30-50% da GPU
integrada dele (Iris Xe) mesmo ligado o tempo todo, com o aviso explícito de não arriscar
perder o trabalho de ajuste fino já feito nas rodadas acima. Por isso o critério pra escolher
o que mexer foi: só levers puramente mecânicos, nenhum que troque a aparência do efeito.
Ficaram de fora, deliberadamente, por mexerem na aparência já aprovada: número de oitavas do
fbm (4), curva de contraste, mistura de cor, `TAMANHO_CELULA_PX`, `FATOR_REDUCAO_RESOLUCAO`.

Duas mudanças, as duas dentro de `asciiPeaksShader.ts`:

1. **Draw call desacoplado do loop de `requestAnimationFrame`, limitado a 30fps
   (`INTERVALO_DESENHO_MS = 1000/30`).** O `rAF` continua rodando a cada quadro nativo (pra
   acumular o tempo de deriva e podar o rastro por idade sem saltos), mas só chama
   `gl.drawArrays` quando já se passou `INTERVALO_DESENHO_MS` desde o último desenho — em
   monitor de 60/120Hz, isso já corta a maioria dos draw calls redundantes de um efeito que é
   "bem suave" por natureza (não precisa de 60fps pra não parecer picotado). `definirAtivo`
   zera `ultimoDesenho` ao reativar, pra desenhar de novo no primeiro quadro sem esperar o
   throttle.
2. **Early-exit no loop do rastro via `uRastroContagem`.** O array de rastro no shader é de
   tamanho fixo (`RASTRO_MAX = 48`) mas normalmente tem bem menos pontos vivos — o mouse parado
   ou o rastro curto deixa a maior parte do array vazia. Antes, o loop `for` lia
   `uRastroPeso[i]`/`uRastroPos[i]` pra todo pixel da tela, pros 48 slots, e só pulava com
   `continue` quando o peso era zero (ainda pagava a leitura). Agora um novo uniform inteiro
   `uRastroContagem` (= `rastro.length` de verdade) permite `if (i >= uRastroContagem) break;`
   como primeira linha do loop — corta a leitura por completo pros slots que nem chegam a ter
   dado, maior ganho justamente quando o mouse está parado (rastro curto ou vazio), que é o caso
   mais comum.

Verificado sem regressão: `tsc --noEmit`, `vitest run` (578 testes, incluindo os puros de
`asciiPeaksShader.test.ts`) e `npm run build` passaram sem mudança de comportamento — nenhuma
função exportada mudou de assinatura. Não foi possível medir o consumo de GPU real neste
ambiente (sem WebGL/hardware do usuário); se 30-50% não cair o suficiente, os próximos levers
disponíveis (nessa ordem de menor pro maior risco visual) são: reduzir mais a resolução interna
do buffer (`FATOR_REDUCAO_RESOLUCAO`), pausar o desenho quando a janela do SO perde foco, e por
último reduzir as oitavas do fbm — esse último É um risco visual real, teria que voltar a
combinar com o usuário antes.

**Ajuste fino (16/09/2026): 24fps + rastro sumindo rápido demais.** Dois pedidos do usuário no
mesmo teste: baixar o alvo de desenho pra 24fps (`INTERVALO_DESENHO_MS`, 30→24 — GPU continuou
alta, e 24fps ainda é suave pra um efeito "bem suave" por natureza) e o rastro estava sumindo
rápido demais. Pra isso, mesma lição da "Terceira rodada" documentada acima: `VIDA_RASTRO_MS`
sozinho não bastava — subir só a vida do ponto sem subir o limite de pontos (`MAX_PONTOS_RASTRO`/
`RASTRO_MAX`) deixaria o rastro mais esparso, não mais longo (pontos antigos descartados pelo
limite de contagem antes de sumirem de verdade pela idade). Os dois subiram juntos de novo:
vida 2200→3400ms, limite 48→72 pontos.

### ADR-29 · Glossário de atalhos e símbolos (RF8.3)

**Contexto e objetivo:** RF8.3 pede uma tela de atalhos de teclado listando todos os comandos. O glossário deve ficar acessível pelas Configurações, mostrar tanto atalhos quanto símbolos de formatação markdown, com filtro por ação/tecla/símbolo.

**Arquitetura — catálogos como dados puros:**

Dois catálogos: `CATALOGO_ATALHOS` (atalhos de teclado com descrição, teclas, condição e gesto) e `CATALOGO_SIMBOLOS` (símbolos markdown com sintaxe, descrição e amostra visual). Ambos em `src/app/glossario/` sem nenhuma dependência de React ou do editor — apenas TypeScript + tipos (`tipos.ts`).

Cada catálogo tem um **teste de deriva** (`catalogoAtalhos.test.ts`, `catalogoSimbolos.test.ts`) que impede o glossário de mentir:
- O de atalhos confere contra os keymaps reais do editor (`TECLAS_FORMATACAO`, `TECLAS_QUEBRA_DE_BLOCO`, `TECLAS_SELECIONAR_CORPO`), falhando se alguma tecla do código não está no glossário.
- O de símbolos confere que cada sintaxe é mesmo reconhecida pelo parser markdown (nó no `lezer` para cada tipo de amostra visual).

**Integração com o editor:**

- **Ctrl+K agora insere link** na nota (`inserirLink()` em `comandosMarkdown.ts`, RF2.11 não estava implementado antes). Antes não havia binding nenhum e o glossário não pode listar um atalho morto.
- Keymaps próprios do editor (`atalhosFormatacao.ts`, `quebraDeBloco.ts`, `selecionarCorpoDaNota.ts`) foram refatorados pra exportar suas teclas numa lista, lida pelo teste de deriva.
- **Limite do teste de deriva:** ele só cobre esses três keymaps. Os atalhos de aplicação (`Workspace.tsx`, `App.tsx`) são handlers imperativos de `keydown`, e os do CodeMirror e do Excalidraw vêm de pacote — esses foram conferidos à mão no fonte (Excalidraw 0.18.1, `@codemirror/commands` e `@codemirror/search`) e ficam no catálogo sem teste automático.
- **Formatação respeita somente leitura:** os atalhos de `atalhosFormatacao.ts` devolvem `false` quando `state.readOnly` (2ª vista do split, ADR-13). Antes, `Ctrl+B` e afins editavam a vista somente leitura, porque `envolver()` e `inserirLink()` não checam `readOnly`.

**UI — DialogoGlossario:**

- Empilhado sobre `DialogoPreferencias` (a pilha de diálogos já existe em `Dialog.tsx`, `fila`), abre pela Configurações seção "Atalhos e símbolos".
- Dois catálogos desenhos por abas (`GrupoBotoes`): "Atalhos" (padrão) e "Símbolos".
- Filtro sem acento/caixa (`filtrarGlossario`), busca em descrição, grupo, sintaxe e rótulos de tecla.
- Teclas mostradas por plataforma: Mod → Ctrl (Windows/Linux) ou ⌘ (macOS), Alt → ⌥ (macOS), setas → símbolos.
- Amostra visual de símbolos desenhada com os estilos do editor (negrito, destaque, código etc.), amostra `comportamento` sem visual.

**Divergência registrada, não corrigida:**

Doc 03 (RF2.4 e RF2.11) diz que Ctrl+E = modo leitura e Ctrl+` = código. Na prática:
- Ctrl+E = código inline (envolve em backticks).
- Não existe modo leitura nem Ctrl+`.
- **O glossário mostra o que o código faz, não o que o doc diz.** Falta decidir qual dos dois está certo — o motivo da divergência não está registrado em lugar nenhum. Fica anotada aqui pra não virar bug oculto.

**Teclas de keymaps levantadas (Tarefa A1):**

Atalhos de ferramenta do canvas vêm direto do Excalidraw 0.18.1 nativo (doc 09, ADR-20): tecla única, nativa, não replicada — `V` seleção, `H` mão, `R` retângulo, etc. Nenhuma customização própria do app, só inventário.

**Manutenção futura:**

- Adicionar novo atalho no editor? Deve ir pra `TECLAS_*` primeiro, depois pro catálogo, e o teste avisa se faltar.
- Adicionar novo símbolo? Primeiro confira que o parser `markdownLanguage` do CodeMirror reconhece a sintaxe (nó no `lezer`), depois adicione ao catálogo com a amostra visual certa.

**Não é escopo (faz hoje e pode ser tarefa futura separada):** gerar os keymaps do editor a partir do catálogo — hoje o catálogo *confere contra* os keymaps, não *gera* eles. Refatorar `Workspace.tsx`/`App.tsx` pra ler do catálogo exigiria mais coordenação e testes; foi deixado pra depois.

### ADR-30 · Largura de coluna de tabela gravada nos traços delimitadores

**Contexto:** o usuário pediu para redimensionar colunas arrastando a linha entre elas (19/09/2026). Markdown não tem campo de largura de coluna, e o doc 02 exige que o disco continue markdown legível em qualquer editor.

**Decisão:** a largura fica na linha delimitadora da tabela, pela contagem de traços de cada célula — a mesma ideia que o Pandoc usa para larguras relativas em tabelas.

- Toda célula com no máximo 3 traços = largura automática (como sempre foi).
- Alguma célula com 4 ou mais traços = proporcional. Fração da coluna = `traços dela ÷ soma dos traços`; os `:` de alinhamento não contam.
- Ao gravar com larguras: traços = `max(4, arredondar(fração × 60))`, com os `:` de alinhamento em volta.
- Com larguras, a tabela ocupa 100% da coluna de leitura e o arrasto é soma zero entre as duas colunas vizinhas.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Só na sessão (sem gravar) | A largura se perde ao reabrir a nota |
| Fora do vault, em `workspace/<hash>.json` | Perde em outro PC; quebra quando outra tabela é inserida antes desta |
| Tabela cresce com rolagem lateral | Proporção não descreve largura absoluta; rolagem lateral esconde colunas — foi o problema relatado pelo usuário antes desta decisão |
| Outro formato além de markdown | Viola RNF6 — arquivo legível em qualquer editor |

**Consequências:**

- A linha delimitadora continua GFM válida: `| ------ | --- |` é tabela em qualquer ferramenta.
- Tabelas antigas com traços longos desiguais (feitas em outra ferramenta) passam a abrir com proporção. Aceito: antes, a primeira edição numa tabela dessas já reescrevia os traços para `---`.
- Redimensionar altera o arquivo — é gesto explícito do usuário, nunca efeito de só abrir a nota.
- O mínimo de 4 traços é o que impede uma tabela redimensionada de voltar a ser lida como automática.

**Condição de reversão:** se a contagem de traços conflitar com outra ferramenta que o usuário use no mesmo vault, voltar a ler todo delimitador como automático é mudar uma função (`parseTableText`); os arquivos continuam válidos.

---

### ADR-31 · Serviços online são opcionais e nunca atrapalham o uso local

**Contexto:** a visão original do produto (doc 01) foi escrita para a prova de conceito
técnica, quando o Excalisidian "não queria plugin, marketplace, sincronização paga, nem
conta". O usuário decidiu pivotar depois de usar o app e ver que o produto se sustenta — o
Excalisidian passa a ter serviços pagos opcionais: sincronização de vaults e IA própria.

**Decisão:** o núcleo do Excalisidian funciona inteiro sem internet e sem conta. Quem nunca
criar conta não percebe diferença nenhuma: nenhuma tela bloqueia o uso, nenhum aviso
recorrente aparece, e não há tela de login na abertura do app. Sincronização e IA própria são
serviços pagos, e são **opt-in** — nada sai da máquina do usuário sem permissão explícita
dele. Menções aos serviços pagos são permitidas, mas não invasivas: hoje isso significa que a
conta vive só dentro de Configurações, e a IA própria aparece só como mais uma opção na lista
de provedores do agente, ao lado dos outros seis. O vault continua sendo o produto — cancelar
a assinatura não tira nada de ninguém.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Manter a visão original (sem conta, sem sincronização paga) | Era a decisão certa para a prova de conceito técnica, mas o usuário decidiu pivotar depois de usar o produto — ele se sustenta melhor com serviços pagos opcionais. |
| Exigir conta, ou mostrar tela de login na abertura do app | Contraria o princípio de que nada atrapalha quem usa o app localmente — bloquear ou interromper a abertura por causa de um serviço opcional penaliza justamente quem nunca vai usá-lo. |
| Anunciar os serviços pagos de forma recorrente (banner, convite periódico) | O usuário foi explícito: "haverá menções, mensagens, avisos... mas não seremos invasivos". Um lembrete recorrente contraria isso. |

**Consequências:** a conta fica isolada dentro de Configurações, sem nenhum outro ponto de
entrada no produto. Qualquer serviço pago futuro precisa seguir a mesma regra: opt-in, sem
bloquear o núcleo, sem aviso recorrente.

### ADR-32 · Sincronização cifrada ponta a ponta; conflito vira tela, nunca merge

**Contexto:** a sincronização ainda não existe, mas precisa de uma regra de tratamento de
dados definida antes de qualquer código de servidor — é a base sobre a qual o ADR-33 (senha
sem recuperação) se sustenta.

**Decisão:** o servidor não consegue ler nada do que sincroniza — nem o conteúdo das notas,
nem o nome dos arquivos, nem quantas notas existem. Ele recebe pacotes cifrados e um
manifesto de versões, só isso. Quando a mesma nota é editada em dois computadores diferentes
(conflito), o app **nunca junta as duas versões sozinho** — mostra as duas lado a lado, com
três saídas possíveis: ficar com esta, ficar com aquela, ou manter as duas. Até o usuário
decidir, nada é apagado. Desenho não se compara como texto: duas versões de um `.draw.md`
aparecem como duas telas, lado a lado, não como um diff de linhas.

**Estado real: a tela de conflitos está concluída; a sincronização em si ainda não existe.**
O plano 04 (conflitos de sync) cobriu a tela inteira — faixa de aviso, comparador de notas
lado a lado e comparador de desenhos — que opera sobre "duas versões do mesmo arquivo" sem
depender de servidor. Falta só a sincronização de verdade: observar o vault, cifrar, subir,
baixar, detectar conflito. O desenho técnico de como isso será construído está em
`docs/17-sincronizacao.md` e no ADR-40.

**Decisões tomadas na execução (23/09/2026):**

Cinco pontos que a decisão acima não previa, resolvidos durante a construção da tela:

- **Cópia duplicada numera em vez de sobrescrever.** Quando o usuário escolhe "manter as
  duas", a versão que perde o nome original vira uma cópia separada. Se isso acontecer duas
  vezes para a mesma nota, no mesmo dia, vindo do mesmo computador, as duas cópias teriam o
  mesmo nome — e a segunda apagaria a primeira, exatamente o que este ADR promete nunca
  acontecer. Por isso a cópia segue o mesmo padrão do ADR-15 (`Nome (2)`, `Nome (3)`...) e
  nunca sobrescreve. Um duplo clique tentando resolver a mesma escolha duas vezes ao mesmo
  tempo também é barrado, pelo mesmo motivo.
- **Linhas alteradas aparecem pareadas, lado a lado.** Quando uma linha muda de uma versão
  para a outra, a tela mostra a versão antiga e a nova na mesma altura, uma em cada coluna —
  em vez da antiga numa linha e a nova sozinha na linha de baixo, que ficaria confuso de ler.
- **A comparação tem um teto de memória.** Para diferenças muito grandes — acima de cerca de
  2.000 × 2.000 linhas diferentes entre as duas versões — a tela para de tentar destacar linha
  a linha e mostra o bloco inteiro como "saiu" de um lado e "entrou" do outro, para não travar
  o app. Linhas iguais no começo e no fim do arquivo são descartadas da comparação antes desse
  cálculo, então um conflito de verdade — que normalmente muda só um trecho pequeno de uma
  nota — quase nunca chega perto desse teto.
- **Resolver atualiza a lista lateral e a aba aberta na hora (achado do teste manual de
  23/09).** Escolher uma versão gravava no disco, mas a nota só aparecia na lista de arquivos
  e, se estivesse aberta numa aba, só mostrava a versão escolhida na próxima vez que alguma
  outra ação recarregasse a tela — "demorou pra aparecer". Agora resolver sempre atualiza a
  lista e o índice de busca/links na hora, e se a nota (ou desenho) escolhida estiver aberta
  numa aba, a aba passa a mostrar a versão escolhida imediatamente, sem esperar. Um cuidado a
  mais: se a aba tinha uma edição não salva ainda esperando pra gravar sozinha (autosave), essa
  gravação pendente é cancelada antes de escrever a versão escolhida — senão ela poderia gravar
  o conteúdo antigo por cima da escolha do usuário um instante depois.
- **Simular conflito de teste numera em vez de recusar.** O comando de desenvolvimento que
  cria um conflito de teste (só existe fora da versão publicada) recusava se já existisse um
  arquivo com aquele nome exato, avisando o usuário. Ficou mais simples e mais parecido com o
  resto do app numerar (`Nome (2)`, `Nome (3)`...) como qualquer criação de nota, em vez de
  recusar — nunca sobrescreve nada e nunca precisa de aviso.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| O servidor lê o conteúdo (conexão cifrada e criptografia em repouso, mas legível para a empresa) | Rejeitada pelo usuário: a empresa vira responsável pelos dados sob LGPD, e o público que escolhe um app local-first é justamente o que mais se importa com isso. Era mais simples — recuperação de conta, busca no servidor, cliente web, suporte — e ainda assim foi rejeitada. |
| Criptografia ponta a ponta opcional, desligada por padrão | Dois caminhos de código, dois modelos de suporte e dois textos de recuperação para manter; na prática gera confusão constante. |
| Resolver conflito automaticamente (merge frase a frase, como o Google Docs) | Cerca de um ano de trabalho para um desenvolvedor sozinho até ficar confiável; quando erra, apaga texto de alguém sem avisar — contraria o princípio 1 do doc 01, "nenhuma ação apaga conteúdo do usuário sem uma volta atrás". |
| Não construir sincronização; documentar Dropbox, iCloud ou Git e vender só a IA | Perde o principal argumento do plano pago e nunca chega a um cliente web. |
| Largar a cópia de conflito na pasta, sem tela (como Dropbox e Obsidian fazem) | Rejeitada pelo próprio usuário, que propôs a tela lado a lado: o usuário acharia um arquivo estranho na pasta e teria de se virar sozinho. |
| Comparar `.draw.md` como texto (diff de linhas) | O JSON da cena não é legível como diferença; desenho se compara vendo as duas telas. |

**Consequências:** o plano 04 pode ser construído e testado sem depender de um servidor, pois
opera só sobre "duas versões de um arquivo". A sincronização de verdade — observar o vault,
cifrar, subir, baixar, detectar conflito — ainda depende de um servidor que não existe.

### ADR-33 · Senha do vault escolhida pelo usuário, sem código de recuperação

**Contexto:** esta é a decisão mais delicada deste documento, e a mais importante desta
leva. Ela decorre direto do ADR-32: se o servidor não consegue ler nada, ele também não pode
"trocar a fechadura" de quem esquece a senha, como um serviço comum faz. Discussão completa,
em linguagem de produto e sem pressa, em `docs/16-codigo-de-recuperacao.md`.

**Decisão:** como o servidor não consegue ler nada (ADR-32), **não existe "esqueci minha
senha".** Esquecer a senha do vault (que, pelo ADR-39, é a mesma senha da conta) faz as cópias sincronizadas no servidor virarem lixo
permanente — ninguém consegue recuperar, nem o usuário, nem a empresa, nem o servidor. **O
que não se perde:** os arquivos no computador do usuário continuam lá, em Markdown, legíveis,
exatamente como estavam — perde-se só as cópias no servidor e o acesso a partir de outros
computadores.

A senha que cifra o vault é escolhida pelo usuário. Não há código nem frase de recuperação,
por quatro motivos: (1) um código não é medida de segurança, é medida contra esquecimento — a
segurança vem da senha e da derivação lenta, e uma segunda cópia da chave em papel só
**reduz** a segurança, porque pode ser fotografada, perdida ou roubada; (2) neste produto o
desastre de esquecer é menor do que num gerenciador de senhas ou e-mail cifrado, porque as
notas locais continuam intactas; (3) o código acrescenta atrito na criação da conta e um
segundo segredo que muita gente guarda mal; (4) o usuário achou o código de 24 caracteres já
implementado "muito sensível" e nem sabia que ele existia.

**Derivação lenta de chave** (Argon2id ou equivalente) é obrigatória: torna cada tentativa de
adivinhar a senha cara de propósito, porque quem obtiver os pacotes cifrados ataca **offline**,
sem limite de tentativas. **Chave envelopada desde o primeiro dia:** o vault é cifrado com uma
chave aleatória, e essa chave é que é cifrada pela senha — isso permite, no futuro, acrescentar
uma forma de recuperação sem reprocessar nada e sem afetar quem já usa. É a única parte desta
decisão com prazo: precisa estar no desenho antes de o primeiro usuário sincronizar.

**Quando a senha é pedida:** uma vez por computador, ao conectá-lo à sincronização. A chave
derivada fica no cofre do sistema operacional. **Nunca na abertura do app.** **Implementado em
23/09/2026 (commit `1bf3f83`, ver ADR-39):** a tela de criação de conta diz, sem eufemismo, que
a senha não pode ser recuperada e que as notas locais continuam a salvo, e recomenda guardar a
senha no gerenciador de senhas do navegador ou do sistema — o aviso aparece antes de a conta ser
criada de fato.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Código gerado de 24 caracteres (implementado em 21/09, removido por esta decisão) | Impossível de memorizar, fácil de errar ao copiar, sensível demais, e o usuário nem sabia que existia. |
| Frase de palavras aleatórias como reserva | Melhor que o código de caracteres, mas mantém os problemas (2) e (3) acima: ainda é um segundo segredo, e ainda existe para ser perdido, fotografado ou roubado. |
| Senha humana sem derivação lenta | Uma senha humana de 16 caracteres vale, na prática, 30 a 45 bits de aleatoriedade — pouco contra um ataque offline sem limite de tentativas. |

**Consequências:** o módulo `src/conta/codigoDeRecuperacao.ts` e seu teste são removidos —
nenhuma tela chegou a usá-lo (ver item 2.6 do plano de adequação e `docs/16` §9). A tarefa que
o criou (plano 03, Task 4) fica marcada como superada, não apagada. A chave envelopada tem
prazo: precisa existir no desenho antes do primeiro usuário sincronizar.

### ADR-34 · Token de sessão no cofre do sistema operacional

**Contexto:** decisão do usuário em 22/09/2026, sobre onde guardar o token que mantém a
sessão da conta entre aberturas do app.

**Decisão:** o token da conta vai para o cofre do sistema operacional (o keyring do Windows),
e não fica em texto puro no `settings.json`. **Implementado em 23/09/2026** (commits
`f69efbe`, `82b8287` e `ab4cd73`). Quem já tinha o token em texto puro é migrado
sem perceber na primeira leitura depois da atualização. Inconsistência declarada e aceita pelo
usuário: as chaves de API dos seis provedores de IA de chave própria continuam em texto puro
no `settings.json` — o usuário foi avisado disso e escolheu manter assim por ora.

**Pendente:** a conferência no Windows real (entrar numa conta de teste, ver a entrada
aparecer no Gerenciador de Credenciais do Windows e sumir ao sair) ainda não foi feita, porque
ainda não existe servidor de conta para completar um login de verdade. Fica na lista de
conferência manual do usuário assim que o servidor existir.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Manter o token em texto puro no `settings.json`, declarando isso como incerteza no doc 09 | Rejeitada pelo usuário. Era o tratamento que as chaves de API já recebem, então não seria regressão — mas o token agora é credencial de conta paga. |
| Levar para o cofre o token **e** as chaves de API dos seis provedores | Rejeitada pelo usuário: é trabalho próprio, mexe em código que já funciona, e exige migração para quem já tem chave salva. A inconsistência resultante (chaves de API em texto puro ao lado do token no cofre) foi aceita conscientemente. |

**Consequências:** a migração seguiu o plano escrito
(`docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`).

**Como foi implementado (plano de 23/09/2026):**

1. **Se o cofre de senhas do Windows (termo técnico: *keyring*) falhar ao gravar o token, o
   app não volta a guardá-lo em texto puro.** A promessa é "o token nunca aparece em texto
   puro em disco", sem exceção — então, nesse caso, a sessão vale só enquanto o app estiver
   aberto, e na próxima abertura o usuário precisa entrar de novo.
2. **Uma falha do cofre nunca aparece para o usuário como erro de login.** Se entrar ou criar
   conta deu certo no servidor, continua dando certo para quem está usando o app, mesmo que
   guardar o token no cofre falhe por baixo dos panos. Isso só fica registrado num aviso
   técnico interno, sem nenhum texto novo na tela.
3. **Quem já tem o token salvo em texto puro é migrado sem perceber.** Na primeira vez que o
   app lê o token depois desta mudança: se ele ainda estiver no `settings.json`, o app grava
   esse token no cofre (quando o cofre ainda não tem um), e em qualquer caso apaga do
   `settings.json` só a linha do token (a chave `tokenConta`) — mesmo que gravar no cofre não
   funcione. O resto do arquivo, com as outras preferências do app, fica intacto. Nesse caso a
   sessão daquela
   abertura ainda funciona, e só a próxima abertura pede login de novo.
4. **O nome usado para guardar o token no cofre do Windows vem de um único lugar**, o
   identificador do app já configurado no projeto — assim ele acompanha automaticamente uma
   eventual troca do nome do produto (ADR-9). O app só pede esse token específico: ele não
   deixa a tela do app escolher qual credencial ler ou gravar no cofre do Windows, então não
   dá para usar esse mecanismo para mexer em outras senhas guardadas no computador.
5. **As chaves de API dos seis provedores de IA continuam do jeito que estão hoje**, em texto
   puro no `settings.json` — decisão do usuário, já registrada acima, mantida sem mudança.

### ADR-35 · IA do Excalisidian é o sétimo provedor do agente

**Contexto:** o catálogo de provedores do agente de IA (doc 11) já tem seis provedores de
chave própria. A IA do Excalisidian entra como mais um, autenticado pela conta em vez de por
chave digitada.

**Decisão:** a IA do Excalisidian entra no catálogo do doc 11 como mais um provedor, sem
dialeto de rede novo — o servidor fala o mesmo dialeto da OpenAI que o cliente já sabe
conversar. Autentica por sessão da conta, não por chave digitada; sem sessão, a chamada falha
com um código de erro próprio (`sessao`), antes de qualquer rede. Usa identificadores lógicos
de modelo (`leitura-rapida`, `acompanhamento`) em vez de nomes de modelo de fornecedor, para
poder trocar o modelo real por trás sem atualizar o app — **o nome do fornecedor de IA nunca
aparece na interface.** A cota mensal é contada **em créditos, no servidor**; o cliente só
interpreta o saldo que chega, nunca conta nada localmente. O modo com chave própria (os seis
provedores existentes) continua **gratuito e intacto** — vende-se conveniência, não
exclusividade. O agente continua desligado por padrão; nenhuma chamada de rede acontece sem
aceite explícito do usuário. `CONTA_DISPONIVEL` é a chave única que liga o provedor próprio na
interface: ficou `false` enquanto não havia tela de conta (o cartão seria um beco sem saída) e
virou `true` no plano 03.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Dialeto de rede novo, próprio do Excalisidian | Sem necessidade — o servidor já fala o dialeto da OpenAI; um dialeto próprio duplicaria código do cliente sem ganho nenhum. |
| Nomear o fornecedor de IA por trás do provedor próprio na interface | O produto usa identificadores lógicos de modelo de propósito, justamente para poder trocar o fornecedor real sem depender de uma atualização do app nem expor essa troca na interface. |
| Tornar o provedor próprio exclusivo, limitando os seis provedores de chave própria | Contraria o princípio: vende-se conveniência, não exclusividade. Os seis continuam gratuitos e intactos. |

**Consequências:** o medidor de créditos não renderiza enquanto o endpoint de saldo não
existir (Parte 3, item 32) — mostrar zero seria mentir sobre dinheiro. O provedor próprio
inteiro depende de um servidor que ainda não existe.

### ADR-36 · Tradução por catálogo de domínios, português como fonte

**Contexto:** a interface do Excalisidian precisa suportar mais de um idioma. A fundação de
tradução (doc 05, item 2.1) foi construída antes da migração completa das telas.

**Decisão:** todo texto de interface sai do catálogo — nunca literal no JSX. Português do
Brasil é a fonte da verdade e define as chaves; inglês é a tradução, e toda chave em português
precisa ter uma em inglês, travado por teste (`cobertura.test.ts`). Dentro de um componente
React usa-se `useTexto()`; fora dele — transporte, stores — usa-se `traduzirAgora()`. Estado
duradouro guarda a **chave**, e traduz no momento de renderizar, nunca o texto já traduzido.
Uma tela que traduz no primeiro render aguarda o carregamento das preferências antes de
mostrar qualquer coisa. Números e datas são formatados no idioma corrente.

**Estado real:** só estão no catálogo hoje as mensagens de erro de criar vault, o seletor de
idioma, os textos do agente de IA e a seção Conta. **O resto da interface continua em
português fixo no código** — trocar o idioma hoje quase não muda nada visível, o usuário
testou e constatou isso. A migração das telas restantes foi **adiada por decisão do usuário**
(22/09), para depois de conta e sincronização.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Texto literal espalhado pelo JSX, com tradução caso a caso | Era o estado anterior a esta fundação; dificulta manter cobertura entre os idiomas e garante divergência ao longo do tempo. |
| Migrar toda a interface para o catálogo já, de uma vez | Adiado por decisão do usuário — a prioridade foi para conta e sincronização primeiro. |
| Usar uma biblioteca de tradução | O produto tem dois idiomas e um único formato de interpolação; um catálogo com teste cobre isso melhor do que uma dependência. |
| Catálogo num arquivo só | Rejeitada na revisão da fundação: com as centenas de chaves previstas viraria um arquivo de milhares de linhas; dividir por domínio com poucas chaves é barato, depois é caro. |
| Tradução incremental, sem trava (inglês parcial, faltando chaves) | Tradução faltando passaria despercebida. Decidiu-se cobrar por teste que toda chave em português tenha inglês; a queda para o português continua existindo só como garantia de execução — nunca mostra chave crua na tela. |

**Consequências:** a interface continua majoritariamente em português fixo até a migração das
telas restantes acontecer. Trocar o idioma nas preferências hoje muda pouco do que aparece na
tela — isso é esperado, não é um bug.

### ADR-37 · Diálogo sempre por portal

**Contexto:** a tela "Criar vault" apareceu espremida dentro da sidebar em vez de centralizada
na janela. Investigação feita nesta sessão (doc 09, item 2.5 do plano de adequação).

**Decisão:** o componente `Dialog` (`src/ui/Dialog.tsx`) passa a renderizar **por portal em
`document.body`**. Motivo técnico: qualquer ancestral com `transform` — inclusive um
`translateX(0)` residual de uma animação com modo de preenchimento `both` — vira um bloco de
contenção e confina o `fixed inset-0` do diálogo dentro dele, em vez de deixá-lo cobrir a
janela inteira. Era exatamente isso que prendia "Criar vault" dentro da sidebar. A animação da
sidebar perdeu o `both` pelo mesmo motivo. **Animação com modo de preenchimento `both` fica
proibida** em qualquer elemento que possa ter um descendente `position: fixed`.

**Divergência registrada, não corrigida:** o comentário de topo de `RaizDialogos.tsx` diz que
"nada além dele renderiza `Dialog` diretamente", mas cinco componentes renderizam `Dialog`
diretamente. Com o portal, essa regra deixou de ser necessária para corrigir o posicionamento
— mas a divergência entre o comentário e o código continua lá, e este ADR só a registra, sem
prometer corrigi-la.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Só remover o `both` da animação da sidebar, sem portal | O bug some hoje, mas a armadilha fica armada — qualquer `transform` futuro em qualquer ancestral (uma animação nova, um deslocamento de redimensionar) quebra os diálogos de novo, do mesmo jeito e sem aviso. |
| Só o portal, mantendo o `both` | Resolve os diálogos, mas deixa o `both` inútil criando bloco de contenção para qualquer outro elemento `fixed` que nasça dentro da sidebar — um tooltip, um menu, um popover. |
| Registrar o defeito e seguir sem corrigir | O defeito era visível para o usuário, no diálogo de criar vault. |

**Consequências:** nenhuma tela nova pode aplicar uma animação com `both` a um elemento que
tenha, ou possa vir a ter, um descendente `position: fixed`. A divergência do comentário em
`RaizDialogos.tsx` fica registrada, não corrigida.

### ADR-38 · Códigos de erro do provedor próprio: 401 é sessão, 403 é plano

**Contexto:** antes, 401 e 403 do provedor próprio ("IA do Excalisidian") viravam o mesmo
erro, e o usuário lia "Entre na sua conta" mesmo já tendo entrado.

**Decisão:** 401 → código `sessao`, texto "Entre na sua conta do Excalisidian para usar a IA
incluída no plano."; 403 → código `plano`, texto "A IA do Excalisidian faz parte do plano
premium. Sua conta está no plano grátis." Para os seis provedores de chave própria, 401 e 403
continuam significando chave recusada. O texto de `plano` é factual e sem convite, link ou
botão, porque só aparece quando o usuário ativamente tentou usar a IA paga (ADR-31, menções
não invasivas). Depois de `sessao` ou `plano`, o agente para de tentar até a sessão ou a
configuração mudar.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Manter 403 como `sessao` | Falso — a pessoa já entrou na conta; o texto de "entre na sua conta" mentiria sobre a causa. |
| Usar o código genérico `provedor` | A mensagem dele manda "verificar a conexão", o que desviaria o usuário para o problema errado — a conexão não é a causa. |

**Consequências:** o servidor, quando existir, tem de devolver 403 exatamente nesse caso e só
nele; a mensagem de `plano` é o único lugar do app que menciona o plano premium a quem não
assinou.

### ADR-39 · Uma senha só: a da conta também protege o vault

**Contexto:** a Parte 4, item 7 deste documento, e o `docs/16-codigo-de-recuperacao.md`
(linha ~371) deixaram em aberto se a senha da conta (a que entra no site, e que dá para
redefinir por e-mail) e a senha que protege o vault sincronizado seriam a mesma coisa ou duas
senhas separadas. O dono do produto decidiu em 23/09/2026, nestas palavras: *"Só uma senha. A
senha da conta. Não tem senha por vault."*

**Decisão:** existe uma única senha, a da conta. Não há senha separada por vault. Como já
estava desenhado no ADR-33 e no doc 16, ela é pedida uma vez por computador — quando aquele
computador se conecta à sincronização — e não a cada abertura do app.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Duas senhas separadas — conta redefinível por e-mail, e senha do vault sem recuperação (ADR-33) | Rejeitada pelo dono do produto. O motivo é a simplicidade para quem usa o app: uma senha só para decorar. |

**Consequências:**

1. **A senha nunca pode ir ao servidor do jeito que foi digitada.** **Implementado em
   23/09/2026** (commits `3801410`, `58c9cad` e `1bf3f83`). Antes, `ServicoContaHttp.entrar` e
   `ServicoContaHttp.criar` (`src/conta/ServicoContaHttp.ts`) mandavam a senha crua para o
   servidor, protegida só pela conexão cifrada — o tratamento normal para uma senha de conta
   comum, redefinível por e-mail. Como essa mesma senha também protege o vault, isso tinha que
   mudar antes de a sincronização existir: o app agora deriva da senha, dentro do computador do
   usuário, duas chaves diferentes — uma que prova a identidade da pessoa para o servidor, e
   outra que cifra o vault e nunca sai do computador. É o mesmo modelo usado pelo Bitwarden e
   pelo 1Password (a técnica de derivar duas chaves de uma senha se chama, em termos
   técnicos, *key stretching*/derivação de chave). Com essa mudança, o servidor deixa de
   receber a mesma senha que abre as notas cifradas, cumprindo a promessa do ADR-32 de que o
   servidor não consegue ler nada. O plano de como isso foi feito está escrito em
   `docs/superpowers/plans/2026-09-23-06-senha-nunca-sai.md` (seção "Como será implementado",
   abaixo). **O que continua sem existir:** a sincronização de verdade, que é quem vai usar a
   chave de envelope (`chaveDeEnvelope`) para proteger o vault — essa chave já é calculada e
   testada, mas hoje ninguém a consome. Ela fica pronta, guardada em lugar nenhum, esperando a
   sincronização chegar.
2. **Esquecer a senha faz perder o acesso à conta e às cópias sincronizadas no servidor, ao
   mesmo tempo.** Os arquivos que já estão em cada computador continuam lá, intactos, porque
   o vault é uma pasta comum de arquivos — o que se perde é só a cópia cifrada guardada no
   servidor. Um eventual "esqueci minha senha" por e-mail só pode criar uma conta nova, vazia
   de sincronização; nunca recuperar as cópias antigas, porque o servidor não tem como lê-las
   (ADR-32, ADR-33).
3. **Trocar a senha, sabendo a atual, precisa reenvelopar a chave do vault no computador —
   não precisa recifrar todos os arquivos.** Isso é consequência do desenho de chave
   envelopada já previsto no ADR-33 (a senha nunca cifra os arquivos diretamente; ela cifra
   uma chave aleatória, e é essa chave que cifra o vault). Trocar a senha troca só o
   envelope, não o conteúdo. Isto é registro de como o desenho se comporta — não é uma
   promessa de quando essa tela vai existir.

**Como será implementado (plano de 23/09/2026).** Existe agora um plano escrito para a
consequência 1 acima: `docs/superpowers/plans/2026-09-23-06-senha-nunca-sai.md`. Resumo das
decisões desse plano, em linguagem simples:

1. **Parâmetros de segurança.** O app vai usar os mesmos parâmetros do Bitwarden (um
   concorrente sério de gerenciador de senhas) para transformar a senha numa chave (a técnica
   se chama Argon2id). Quanto mais "pesado" esse cálculo, mais caro fica para alguém tentar
   adivinhar a senha testando várias de uma vez. Um rótulo de versão desses parâmetros viaja
   junto para o servidor, para poder torná-los mais pesados no futuro sem travar quem já tem
   conta.

   **Troca feita durante a implementação: quem faz esse cálculo pesado é a peça `hash-wasm`,
   não a `@noble/hashes` da pesquisa inicial.** Motivo: medido nesta máquina, o cálculo
   levava cerca de 3,8 segundos numa biblioteca (tempo alto demais — a pessoa ficaria olhando
   para uma tela parada) e cerca de 0,3 segundo na outra, com exatamente os mesmos parâmetros
   de segurança (nenhum parâmetro foi afrouxado para ganhar velocidade). A `hash-wasm` é uma
   compilação, para rodar no navegador embutido do app, do próprio código de referência escrito
   pelos autores do algoritmo Argon2 — não é uma reimplementação nossa. Para garantir que as
   duas pecas concordam, a conferência ficou em dobro: primeiro, o resultado bate com o vetor de
   teste oficial do padrão internacional do Argon2id (RFC 9106) calculado pela `@noble/hashes`;
   segundo, as duas peças, calculando com os parâmetros reais do app, dão exatamente o mesmo
   resultado, byte a byte. Ou seja: duas implementações independentes, escritas por equipes
   diferentes, concordando — a garantia de que a peça mais rápida não introduziu erro nenhum. A
   `@noble/hashes` continua no projeto, só que agora para as outras duas contas (HKDF e
   SHA-256, explicadas na decisão 4) e para esse teste cruzado.
2. **Sal.** Cada conta usa um ingrediente extra fixo, calculado a partir do e-mail (chamado
   "sal" em criptografia), para que a mesma senha não vire a mesma chave em contas diferentes.
   Esse ingrediente usa um texto fixo do próprio código — e não o nome do produto, que ainda
   pode mudar (ver ADR-9): se o nome mudasse e o ingrediente mudasse com ele, ninguém mais
   conseguiria entrar na própria conta. Consequência: hoje não existe tela para trocar o
   e-mail da conta, e trocar o e-mail exigiria recalcular tudo de novo.
3. **Normalização.** Antes de calcular, o e-mail é limpo (sem espaços nas pontas, tudo
   minúsculo) e tanto o e-mail quanto a senha passam por uma "unificação de acentos" (chamada
   de normalização NFC): uma letra acentuada, como "ç", pode chegar do teclado ou do sistema
   como um caractere só ou como duas partes separadas ("c" mais o acento), dependendo de onde
   foi digitada — essa unificação faz as duas formas darem sempre o mesmo resultado, sem
   remover nem apagar nenhum caractere. Espaços que fazem parte da própria senha continuam
   contando normalmente.
4. **Separação em duas chaves.** Da senha nasce uma chave-mestra que nunca é usada
   diretamente. Dela nascem duas outras, cada uma feita só para um uso (a técnica se chama
   HKDF): a **prova de identidade**, que vai para o servidor, e a **chave de envelope**, que
   vai proteger o vault e nunca sai do computador do usuário. Hoje ainda não existe
   sincronização, então ainda ninguém usa essa chave de envelope — ela já está sendo criada
   agora para existir pronta quando a sincronização chegar.
5. **Contrato novo com o servidor.** Em vez de mandar `{ e-mail, senha }`, o app passa a
   mandar `{ e-mail, prova de identidade, rótulo dos parâmetros }`. O servidor trata essa prova
   exatamente como trataria uma senha comum — em nenhum momento ele vê a senha real. E, do
   lado do servidor, quem tiver essa prova de identidade em mãos consegue entrar na conta, do
   mesmo jeito que quem tivesse a senha original conseguiria — então o servidor precisa guardar
   só um resumo lento dela (um "hash lento", a mesma ideia da decisão 1, aplicada de novo do
   lado do servidor), nunca a prova em si, do mesmo jeito que um serviço bem feito nunca guarda
   a senha do usuário do jeito que ela foi digitada.
6. **Não travar a tela.** Como o cálculo é pesado de propósito (decisão 1), ele roda de um
   jeito que não congela a tela do app enquanto a pessoa espera.
7. **Senha mínima de 12 caracteres, só para conta nova.** Quem já tem conta com senha menor
   continua conseguindo entrar normalmente — a regra nova não tranca ninguém que já existe.
8. **Aviso na tela de criação de conta.** **Implementado em 23/09/2026** (commit `1bf3f83`).
   Um texto avisa, sem rodeios, que essa senha não pode ser recuperada por ninguém (nem pela
   própria empresa), que as notas já salvas no computador continuam seguras mesmo assim, e
   recomenda guardar a senha num gerenciador de senhas. Isso cumpre um aviso que o ADR-33 já
   previa e que não estava colocado na tela.

   **O aviso acontece em dois passos, de propósito.** Clicar em "Criar conta" pela primeira vez
   não cria conta nenhuma — só troca o formulário para o modo de criação, onde o aviso já
   aparece visível. A conta só é criada de fato no segundo clique, depois de a pessoa ter visto
   o aviso. Isso garante que ninguém cria uma conta sem passar pelo aviso antes — se o clique
   único criasse a conta e mostrasse o aviso depois, o aviso chegaria tarde demais para servir
   de alerta.

**Estado real: a consequência 1 e o aviso da decisão 8 estão implementados (23/09/2026,
commits `3801410`, `58c9cad` e `1bf3f83`). A sincronização — que é quem vai usar a chave de
envelope de verdade — continua não implementada.**

**Mudança de 27/09/2026.** Um vault de teste tinha subido para o servidor trancado com a chave
da conta de teste, em vez da chave da conta de verdade — a chave certa e a errada moravam no
mesmo lugar do cofre do computador, e uma tinha sobrado da outra. Para isso nunca mais
acontecer, a chave de envelope passou a nascer no momento de entrar ou criar a conta — quando a
senha digitada ainda está em mãos — e não mais só quando a pessoa liga a sincronização de um
vault. A chave fica guardada no cofre do computador junto com o e-mail da conta dona dela;
trocar de conta neste mesmo computador, sem sair da anterior, descarta a chave errada e passa a
usar a certa. Sair da conta continua apagando a chave, como antes.

### ADR-40 · Sincronização como diário de pacotes lacrados

**Contexto:** os ADR-32, ADR-33 e ADR-39 já tinham decidido *o quê* a sincronização promete
(servidor cego, senha única, conflito nunca funde sozinho). Faltava decidir *como* isso é
construído de verdade — o formato dos pacotes que viajam até o servidor e a chave que os tranca.
Essas decisões técnicas estão detalhadas em `docs/17-sincronizacao.md` (normativo); este ADR
resume o que foi decidido, em linguagem simples, e registra as alternativas que foram
consideradas e descartadas.

**Decisão:** o servidor guarda, por vault, um diário de pacotes numerados por ele mesmo, dois
tipos: **lotes** (as mudanças que um computador fez desde a última vez) e **retratos** (o vault
inteiro num ponto do diário, para um computador novo não precisar baixar tudo desde o início).
Cada pacote é trancado com uma chave própria do vault (a `chaveDoVault`), gerada uma vez,
aleatória, e guardada — também trancada — no servidor dentro de um "envelope" que só a chave da
conta do usuário (a `chaveDeEnvelope` do ADR-39) consegue abrir. A cifra usada é a que já vem
pronta no navegador embutido do app, sem precisar instalar nada a mais (o nome técnico é
AES-256-GCM, da WebCrypto).

Antes de trancar, cada pacote é preenchido até um dos tamanhos de uma escada fixa (16 KiB, 32
KiB, 64 KiB... até 8 MiB), para o servidor não conseguir estimar o tamanho exato do que foi
escrito só pelo tamanho do pacote. Um arquivo maior que 7 MiB fica de fora da sincronização —
continua só no computador — porque o pacote inteiro (depois de compactado e cifrado) precisa
caber no teto de 8 MiB; o app avisa quais arquivos ficaram de fora.

Cada computador tem a própria lixeira: quando uma exclusão chega de outro computador, o arquivo
não some — vai para a lixeira deste computador, recuperável aqui como qualquer exclusão. E, na
regra de quem ganha quando os dois lados mexeram na mesma nota, **apagar nunca vence editar**: se
um computador apagou e o outro editou, a versão editada volta; o que se perde, no pior caso, é um
apagamento, nunca um texto. Um desenho (`.draw.md`) em conflito abre a tela de comparação do
ADR-32 normalmente — duas telas lado a lado, como qualquer nota. Só um anexo que não é Markdown
(imagem, PDF) — que não tem como comparar linha a linha — não abre tela nenhuma: vira "manter as
duas" cópias automaticamente.

**Limite honesto desta promessa:** mesmo sem conseguir ler nada, o servidor vê quantos pacotes
cada vault tem, o tamanho arredondado de cada um (por causa da escada) e quando chegaram. Isso
deixa ele saber, **aproximadamente**, quanto a pessoa escreve e quando usa o app — mas nunca o
quê, nunca o nome de um arquivo, nunca quantas notas existem. Esse resíduo é inerente a qualquer
sincronização entre computadores e é aceito como parte do desenho (docs/17-sincronizacao.md §3).

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Um pacote cifrado por arquivo, em vez de agrupar mudanças num lote | O número de pacotes revelaria quantas notas existem, o que contraria diretamente a promessa do ADR-32 de que o servidor não sabe quantas notas a pessoa tem. |
| Outra cifra (XChaCha20-Poly1305, por uma biblioteca externa, `@noble/ciphers`) em vez da cifra já embutida no navegador do app | Traria uma dependência a mais sem ganho de segurança sobre a cifra que já vem pronta (AES-256-GCM da WebCrypto), disponível tanto no app quanto nos testes automatizados. |
| Sincronizar também a lixeira de cada computador | Uma exclusão viraria duas mudanças (o arquivo some de um lado, aparece na lixeira do outro) que se cruzariam de volta no computador que apagou — voltando a mostrar um arquivo que a pessoa já tinha decidido apagar. |

**Estado real: sincronização pronta no cliente — a lista "Seus vaults" nas Configurações, ícone
de estado, chave no cofre do Windows — e testável em desenvolvimento com um servidor de teste
local e uma conta de teste (doc 17 §10). Todo vault sincronizado deste computador sincroniza
sozinho enquanto o app está aberto, mesmo fechado numa janela: uma janela designada roda os
ciclos dos vaults fechados a cada 60 s, e uma trava por vault (guardada no processo do Rust,
doc 17 §8.1) garante que o mesmo vault nunca sincroniza duas vezes ao mesmo tempo — nem por duas
janelas, nem pela janela e pelo segundo plano juntos. Falta o servidor de verdade
(plano `docs/superpowers/plans/2026-09-24-10-sincronizacao-na-tela.md`).**

**Concluído em 28/09/2026** (plano `docs/superpowers/plans/2026-09-28-12-seus-vaults.md`,
commits `78d6de9`..`9c94f3a`): a chave que tranca os pacotes de cada vault nasce no login e fica
presa ao e-mail da conta; a lista "Seus vaults" foi para a aba Sincronização das Configurações;
e a sincronização automática em segundo plano descrita acima passou a valer para todos os
vaults já sincronizados neste computador, não só o aberto na janela. 1427 testes no app, 61 no
servidor. Falta o teste manual do dono do produto.

**Consequências:** a Fatia 15 do roadmap passa a ter um desenho técnico completo para seguir,
não só a decisão de produto. O plano citado acima constrói as peças isoladas, sem tela, sem
disco e sem rede de verdade; um próximo plano monta o motor que as liga ao vault, e outro liga
a interface.

### ADR-41 · Servidor próprio numa VPS

**Contexto:** o app já sabe conversar com um servidor de conta e sincronização (ADR-38, ADR-39,
ADR-40), mas até aqui só existia um servidor de teste, no próprio computador. Faltava decidir
onde e como o servidor de verdade roda. O desenho completo está em `docs/18-servidor.md`
(normativo); este ADR resume a decisão em linguagem simples e registra o que foi descartado.

**Decisão:** o servidor roda numa VPS que o dono do produto já tem, guardando as contas, as
sessões e os pacotes cifrados da sincronização, no endereço `https://api.excalisidian.com`.
Nenhum outro serviço que já roda nessa VPS é afetado — só as portas da internet passam a
aceitar conexão de fora, e só para este servidor novo.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Serviço gerenciado de backend (um provedor de nuvem cuidando do servidor) | Depender de um fornecedor externo e pagar por uso, num produto de uma pessoa só, sem ganho que justifique o custo. |
| Docker | Não está instalado na VPS, e seria mais uma camada para o dono do produto administrar sem necessidade. |
| Postgres (banco de dados maior) | Mais um serviço rodando na VPS para uma quantidade de dados que o SQLite já atende sem problema. |

**Estado: instalado e no ar** em `https://api.excalisidian.com/v1/saude`, com certificado válido
(26/09/2026). Falta o dono do produto testar entre dois computadores.

**Consequência declarada:** o backup do servidor fica só no disco da própria VPS até existir
uma cópia guardada fora dela.

### ADR-42 · Planos pagos sobre código open source: pode, desde que os avisos viajem junto

**Contexto:** decisão do usuário (24/09/2026) de passar a cobrar pelo app (planos pagos), com
a dúvida de se isso conflita com o uso de código open source — o Excalidraw, em especial.

**Achado — o dinheiro não muda nada, o aviso muda.** A licença do `@excalidraw/excalidraw` é
MIT (confirmado no registry do npm para a 0.18.1: campo `"license": "MIT"`, e no `LICENSE` do
repositório: `Copyright (c) 2020 Excalidraw`). MIT concede explicitamente "use, copy, modify,
merge, publish, distribute, sublicense, and/or sell" — **vender, cobrar e ter plano pago é
permitido**, e MIT não é copyleft: nada obriga a abrir o código do Excalisidian. A única
obrigação é manter "the above copyright notice and this permission notice" **junto das cópias
distribuídas**. Não existe exigência de crédito visível na interface nem de "powered by". O
mesmo vale para as demais dependências (React, CodeMirror, plugins do Tauri, dockview,
zustand…): todas permissivas (MIT/ISC/Apache-2.0). As fontes embutidas são OFL-1.1, que
permite redistribuição embutida em software vendido, desde que a fonte não seja vendida
sozinha.

**Achado — onde estava o furo.** O `THIRD_PARTY_LICENSES.md` existia, mas (1) citava o MIT do
Excalidraw por link, sem reproduzir o aviso de copyright + texto que a licença exige, e (2)
não era distribuído: o `bundle` do `tauri.conf.json` não tinha `resources`, então o instalador
saía só com o binário. (O `LICENSE` do editor vendorizado em `src/editor/atomico/` já estava
no lugar — checado, sem pendência.)

**Decisão:**
1. `THIRD_PARTY_LICENSES.md` passou a reproduzir o texto MIT e o aviso de copyright de cada
   componente (Excalidraw, editor vendorizado, ruído do shader) e o texto da OFL-1.1, com uma
   seção "Marcas" separando o que a licença cobre do que ela não cobre.
2. `src-tauri/tauri.conf.json` ganhou `bundle.resources`, que leva `LICENSE` e
   `THIRD_PARTY_LICENSES.md` para `licenses/` dentro do app instalado — cumprindo o "incluído
   nas cópias distribuídas".
3. Configurações → "Licenças e créditos": a versão curta, visível, com o aviso de que
   Excalidraw não endossa o app. Isto é boa prática, não exigência da licença.

**Consequência ruim / risco que continua aberto:** **marca não é licença.** MIT não dá nem
tira direito sobre o nome "Excalidraw" — o ADR-9 já registrava que "Excalisidian" é a maior
exposição de marca do produto. Cobrar aumenta o perfil comercial e, com ele, o risco de uma
reclamação de marca que hoje, num app pessoal, provavelmente não viria. Nada aqui renomeia o
produto; o que fica recomendado é não usar "Excalidraw" como nome do produto em marketing,
manter o uso só referencial ("diagramas no estilo do Excalidraw") e, se o produto crescer,
levar o nome a uma revisão jurídica. Nada disto é conselho jurídico — é leitura do que está
publicado.

**Segundo risco, tão relevante quanto — a licença do próprio app.** O `LICENSE` do Excalisidian
também é MIT, e quem detém o copyright (o usuário) é quem pode relicenciar. MIT no próprio
código significa que qualquer um pode copiar, modificar e **revender o app** — inclusive as
funcionalidades que se pretende cobrar. Isso não é erro de terceiros: é escolha de licença
própria. Se a intenção é cobrar e proteger o produto, o caminho é trocar a licença do app para
proprietária (ou source-available com restrição de revenda) — as versões já publicadas sob MIT
continuam MIT para quem as baixou, então a mudança só vale de uma versão para frente. Decisão
do usuário, não tomada aqui; nenhuma ação foi feita sobre o `LICENSE`.

**Pendência registrada:** a lista de avisos cobre Excalidraw, o editor vendorizado e as
fontes, mas não reproduz o texto de cada um dos demais pacotes npm (todos permissivos). Montar
a lista completa antes de um lançamento público que não seja beta.

**Condição de reversão:** se o produto voltar a ser distribuído só como uso pessoal, nada
disso precisa ser desfeito — manter os avisos não custa nada e já está no lugar. Só o item 3
(a seção de créditos na interface) seria dispensável, e mesmo assim é inofensivo.

### ADR-43 · IA do Excalisidian no servidor: repasse com créditos pelo custo real

**Contexto:** o provedor "IA do Excalisidian" já existe no app (ADR-35, ADR-38): dialeto OpenAI,
`POST {BASE}/chat/completions` sem streaming, sessão da conta como credencial, modelos lógicos
`leitura-rapida` e `acompanhamento`, e um medidor de créditos pronto mas oculto por falta de
endpoint. O servidor (ADR-41, `docs/18-servidor.md`) agora ganha a IA. Contrato completo em
`docs/18-servidor.md` §5; fatos do fornecedor na Parte 2.

**Decisão:** o servidor recebe o pedido do app, confere sessão e plano, repassa ao fornecedor,
devolve a resposta no mesmo dialeto e debita créditos. 1 crédito = US$ 0,001 de custo real do
fornecedor, calculado pelo `usage` da resposta, pela faixa de horário (pico ou fora de pico) e
pelo detalhe de cache. Cotas por mês civil de Brasília: premium 3.000 créditos, plano superior
10.000 (faixa de IA guardada na conta; as duas são "premium" para o resto do produto). Créditos
esgotados respondem 429 `{"codigo":"creditos"}`; falha do fornecedor responde 502 e nada é
cobrado. O texto das notas não é guardado nem registrado em log. A chave do fornecedor vive só
na VPS, em `/etc/excalisidian/ia.env`. A cobrança continua manual (`excalisidian-admin`).

**Planos e preços** (decisão do dono do produto, 28/09/2026):

| Plano | Créditos/mês | Mensal (US$) | Anual (US$) | Mensal (R$) | Anual (R$) |
|---|---|---|---|---|---|
| Premium | 3.000 | 8 | 59 | 35 | 249 |
| Superior | 10.000 | 18 | 149 | 99 | 779 |

Nome comercial do plano superior: ainda aberto, entra com a cobrança.

**Conta do pior caso** (o assinante gasta todos os créditos). Premissas do relatório de negócio:
intermediário de pagamento 5% + US$ 0,50 por cobrança, armazenamento até US$ 0,10 por mês,
câmbio suposto de R$ 5,50 por US$ (não verificado).

| Plano | Recebido/mês (US$) | Taxa/mês | IA máx. | Sobra no pior caso |
|---|---|---|---|---|
| Premium mensal US$ 8 | 8,00 | 0,90 | 3,00 | 4,00 |
| Premium anual US$ 59 | 4,92 | 0,29 | 3,00 | 1,53 |
| Superior mensal US$ 18 | 18,00 | 1,40 | 10,00 | 6,50 |
| Superior anual US$ 149 | 12,42 | 0,66 | 10,00 | 1,66 |
| Premium mensal R$ 35 | 6,36 | 0,82 | 3,00 | 2,44 |
| Premium anual R$ 249 | 3,77 | 0,23 | 3,00 | 0,44 |
| Superior mensal R$ 99 | 18,00 | 1,40 | 10,00 | 6,50 |
| Superior anual R$ 779 | 11,80 | 0,63 | 10,00 | 1,07 |

**Risco de câmbio:** o custo de IA é em dólar. No pior caso, o anual em reais passa a dar
prejuízo com o dólar acima de ~R$ 6,27 (premium) e ~R$ 6,08 (superior). Mitigação: créditos são
dinheiro real, então a alavanca é a cota ou o preço em reais, ajustáveis sem atualizar o app.
Imposto sobre consumo no Brasil a conferir com o intermediário (preço com ou sem imposto
incluso) — Parte 3, itens 34 e 35.

**Uso esperado** (estimativa, Parte 3, item 37): leitura rápida ~1 crédito; rodada do
acompanhamento 2 a 3; mensagem no chat ~2 — no preço de pico e sem cache. De dia no Brasil, fora
de pico e com cache, rende de 2 a 3 vezes mais. 3.000 créditos equivalem a ~120 h de escrita
intensa com acompanhamento no pior horário, ~300 h de dia.

**Alternativas rejeitadas:**

| Opção | Por que não |
|---|---|
| Serviço separado só para IA | Duplicaria sessão e plano, que o servidor atual já tem. |
| Intermediário tipo OpenRouter | Outra conta, outra taxa e mais uma empresa vendo o texto das notas. |
| Cobrar sempre pelo preço de pico | Mais simples, mas entregaria metade do uso pelo mesmo custo máximo. |
| Contar créditos no app | O app não é confiável para contar dinheiro (ADR-35: contado no servidor). |
| Streaming | O cliente não usa; fica fora. |

**Consequências:** o texto das notas passa pelo servidor, sem ser guardado; a transferência a um
fornecedor chinês segue pendente de GDPR (Parte 3, item 31), sem bloquear o uso no Brasil. O
último pedido do mês pode passar um pouco do total (checagem antes, débito depois); o corpo
limitado a 256 KiB limita o excesso a poucas dezenas de créditos. Sem chave do fornecedor na VPS,
só a IA responde 503. Mudar cotas ou preços é atualizar o servidor, não o app. Fica pendente
confirmar o lugar do detalhe de cache com uma chamada real (Parte 3, item 33).
