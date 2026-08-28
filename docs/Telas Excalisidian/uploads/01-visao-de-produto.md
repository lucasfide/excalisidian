# 01 — Visão de produto

## Uma frase

Excalisidian é um caderno de trabalho local onde texto e desenho moram no mesmo arquivo de pasta e se referenciam entre si.

## O problema

Quem pensa escrevendo usa dois programas. As notas ficam num app de markdown, os diagramas ficam num quadro branco, e os dois nunca se encontram: o diagrama vira um PNG colado que envelhece, o link para a nota vira uma URL que quebra.

O plugin Excalidraw do Obsidian resolve isso, e resolve bem — mas ao custo de instalar o Obsidian, instalar o plugin, e conviver com um canvas que é um cidadão de segunda classe dentro de um app que foi feito para texto. A hipótese do Excalisidian é que dá para tratar os dois como cidadãos de primeira classe desde o início, com um recorte de funcionalidades muito menor.

## Para quem

Uma pessoa (você) que:

- pensa em diagramas tanto quanto em listas;
- quer os arquivos no próprio disco, em texto, versionáveis no Git;
- não quer plugin, marketplace, sincronização paga, nem conta;
- usa Windows como máquina principal.

Não é um produto multiusuário, não tem colaboração em tempo real, não tem servidor. Se um dia tiver, será depois — e a arquitetura não deve impedir, mas também não deve pagar o preço antecipado.

## Princípios

Cinco princípios, em ordem. Quando duas soluções empatarem, ganha a que respeita o princípio mais alto da lista.

### 1. Os arquivos são o produto

O banco de dados é a pasta. Toda informação que o usuário criou tem que sobreviver à desinstalação do app. Índice, cache e layout de abas ficam **fora** do vault, em `%APPDATA%`, e podem ser jogados fora e reconstruídos a qualquer momento sem perda.

A exceção são as preferências **do vault** — pasta de anexos, formato de link, comportamento da lixeira. Essas moram em `.excalisidian/vault.json`, dentro do vault, porque descrevem aquele conjunto de arquivos e devem viajar com ele. Preferências da máquina — tema, tamanho da janela, vaults recentes — ficam fora.

Consequência dura: nada de campo que só existe no índice. Se o usuário fixou uma nota, isso é um dado de workspace (descartável). Se o usuário deu um título a um desenho, isso é o nome do arquivo.

### 2. Um desenho é uma nota

Desenhos são arquivos `.excalidraw.md`: um markdown de verdade, com frontmatter, com o JSON da cena dentro. Isso não é um detalhe de implementação — é o que faz backlink, busca, Git diff e "abrir no Bloco de Notas" funcionarem para desenho do mesmo jeito que funcionam para texto.

### 3. Editar é ver

O editor de markdown não tem modo "código" e modo "preview" lado a lado. Tem um modo só: a sintaxe some quando o cursor sai da linha e reaparece quando volta. Você edita o documento renderizado, e o arquivo em disco continua sendo markdown limpo.

### 4. Nada de destruição silenciosa

Nenhuma ação apaga conteúdo do usuário sem uma volta atrás. Deletar vai para a lixeira do vault; salvar é atômico; conflito entre o disco e o editor sempre pergunta. A única ação irreversível do produto é esvaziar a lixeira, e ela pede confirmação com a contagem real do que será perdido.

### 5. Poucas escolhas, boas escolhas

Cinco cores de traço, cinco opções de preenchimento (uma delas transparente), três espessuras. É decisão estética, não limitação de escopo. O mesmo vale para o editor: sem temas customizáveis, sem plugins, sem trezentas configurações.

## O que o produto é

- Um vault: uma pasta que o usuário escolhe, com subpastas livres.
- Notas `.md` com live preview, wikilinks, embeds e frontmatter.
- Desenhos `.excalidraw.md` com formas, texto, conectores, post-its e imagens coladas.
- Abas com `Ctrl+T`, divisão de tela horizontal e vertical, arrastar aba para dividir.
- Sidebar com a árvore de pastas.
- Busca por nome (quick switcher) e por conteúdo.
- Backlinks.
- Lixeira com restaurar e esvaziar.

## O que o produto explicitamente NÃO é (no MVP)

Escrito aqui para não virar discussão depois:

- Não tem graph view.
- Não tem plugins nem API de extensão.
- Não tem sincronização, conta, nuvem ou colaboração.
- Não tem mobile.
- Não tem tags, kanban, daily notes, templates, dataview.
- Não tem canvas infinito de cards estilo "Obsidian Canvas" — o canvas do Excalisidian é o de desenho.
- Não tem editor de tabelas WYSIWYG (tabela é markdown puro em live preview simples).
- Não tem colaboração em tempo real no desenho.
- Não tem histórico de versões próprio (isso é trabalho do Git).
- Não tem exportação para PDF no MVP (exportar PNG/SVG do desenho, sim).

## Como sei que deu certo

Critério de sucesso do MVP, em ordem:

1. Consigo passar uma semana usando o Excalisidian como caderno principal sem abrir o Obsidian.
2. Abro o vault num editor externo e o conteúdo faz sentido: markdown legível, desenhos com os textos pesquisáveis.
3. `git diff` de um desenho editado mostra uma mudança compreensível, não um blob inteiro trocado.
4. Um desenho com 500 elementos rola e faz zoom sem engasgo perceptível.
5. Nunca perdi uma nota.
