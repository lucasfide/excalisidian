# Landing page Excalisidian

Conceito aprovado: o hero é um preview básico do aplicativo, com pastas à esquerda, nota ao centro e tarefas à direita. A base da moldura desaparece no fundo sem esconder controles. H1: “Notas, Diagramas e Tarefas”; apoio: “Só isso.” e “(Com IA, se você quiser)”.

## Experiência

- Cabeçalho sticky com marca e Download. Clique no link baixa o instalador do SO detectado; hover abre navegação por âncoras. Botão adjacente abre/fecha por teclado/toque; Escape fecha. SO desconhecido/mobile leva a #download.
- Preview: nota editável, árvore expansível com uma nota e um diagrama, tarefas criáveis, excluíveis e concluíveis (saída suave e remoção). Dados apenas na sessão; sem acesso ao vault, backend ou IA real. Diagrama somente visualização.
- Mobile: alternância Nota/Pastas/Tarefas mantendo estado. Controles com 44px; inputs com 16px. Breakpoints 640, 768, 1024 e 1280 conforme necessário, restritos à LP.
- Seções com âncoras: Início, Notas, Diagramas, Tarefas e Download. Conteúdo técnico e exemplos mínimos. IA mencionada somente no apoio do H1 aprovado.
- Downloads: três opções, destaque para SO detectado. Links diretos verificados da release pública v0.5.6: Windows x64 (.exe), Linux x64 (.AppImage), macOS Apple Silicon (.dmg). As arquiteturas são explícitas; a detecção identifica o SO, não garante a arquitetura de CPU. Não publicar releases.

## Interface e movimento

Fraunces nos títulos, Instrument Sans na interface e IBM Plex Mono em metadados. Tema Cristal atual recuperado do repositório público e isolado em `landing-theme.css`, sem alterar os tokens globais deste checkout antigo. Marca e shader ASCII originais da home recuperados do commit `e9255bb202aca2ab700867127533896c51b6977a`. Fonte: `src/ui/excalisidian/asciiPeaksShader.ts`, copiada para `src/lib/landing-home-shader.ts` com atribuição preservada. O wrapper limita a área, pausa fora de tela/aba oculta e respeita movimento reduzido. Nenhuma dependência nova. Rolagem natural.

## Código e escopo

Entrada web independente em landing/index.html e configuração Vite própria; saída dist-landing. Componentes de domínio em src/components/features/landing, página em src/pages/landing-page.tsx, tipos em src/types/landing.ts e dados mínimos em src/data/. Não importar editor Excalidraw nem APIs Tauri no bundle web. Nenhuma edição em src/components/ui/.

Nomenclatura separada: trocar desenho(s) por diagrama(s) nos textos visíveis do aplicativo; preservar extensões, identificadores, formatos e compatibilidade dos documentos.

## Distribuição Luna

1. high: preview interativo e CSS próprio; árvore, nota, tarefas e navegação mobile.
2. high: composição da página, shader e estilos responsivos, conectando preview e controle Download por contratos de importação.
3. low: nomenclatura visível desenho → diagrama no aplicativo existente.
4. Integração principal: entrada web, resolução de downloads, cabeçalho acessível, documentação e validação. Revisão final dos agentes pelo coordenador.

## Aceite

TypeScript strict, build web/app e suíte existente. Testes de detecção de SO e seleção de assets. Verificar preview (editar, criar, concluir, excluir, explorar), dropdown com hover/teclado/toque e links. Conferir larguras 375, 768, 1024 e 1440 quando navegador disponível. Documentar limitações reais de artefatos e inspeção visual. LP não altera breakpoints do aplicativo.

## Executar e publicar

- `npm run dev:landing`: acessar `http://localhost:1422/landing/`.
- `npm run build:landing`: gera `dist-landing/landing/index.html` e assets em `dist-landing/assets/`. Servir `dist-landing` como raiz e `/landing/` como página de entrada (ou configurar rewrite do host).
- `npm run preview:landing`: conferir a saída de produção em `/landing/`.
- Os links de instalação estão centralizados em `src/data/landing-downloads.ts`; atualizar a versão e confirmar os nomes dos três assets ao lançar uma versão. Nenhuma chamada à API do GitHub é necessária ao visitar a LP.
- Texto e tarefas do preview duram somente enquanto a página está aberta. Não são enviados para serviços nem salvos no vault.
- Nenhuma nova dependência foi adicionada. Não há script lint no projeto; TypeScript faz parte dos dois builds.

## Validação e refinamento

- Agentes Luna: preview e composição com effort high, nomenclatura com low, revisão visual independente com high. Integração e refinamento final pelo coordenador.
- 45 arquivos de testes / 370 testes passaram; build do aplicativo e build independente da LP passaram, incluindo TypeScript strict. O build do aplicativo mantém avisos de chunks grandes e imports dinâmicos preexistentes.
- Chrome headless: edição da nota, tarefas (criação/conclusão/exclusão), árvore, diagrama, persistência da nota entre painéis, navegação mobile, hover, Escape, sticky, seleção de conexões, exemplo opcional de IA e roteamento de downloads para Windows/macOS/Linux/Android.
- WebGL2 compilado e ativo, sem exceções de runtime. Fallback CSS disponível se WebGL não estiver presente.
- Inspeção visual em 375/768/1024/1440 px. Ajustes restritos à LP: sm 640 (navegação), md 768 (downloads e editor tablet), lg 1024 (preview de três colunas e seções), xl 1280 (largura editorial). Breakpoints e layouts do aplicativo não foram alterados.
- Refinamentos após screenshots: tema correto, shader original, fade sem encobrir controles, preview mais compacto, abas até 1024 px, conteúdo de tablet ocupando a largura, estudos interativos maiores e tipografia das seções equilibrada.
- Downloads vinculados à release verificada; macOS é Apple Silicon, Linux/Windows são x64. Atualizações dos links são manuais e centralizadas. Preview não persiste após recarregar.

## Revisão solicitada em 21/09 — quatro camadas

### Experiência

Entrada direto na nota, sem slogans ao redor. Seções explicam recursos: arquivos .md, checklists, tabelas, imagens, atalhos, blocos móveis e links; Excalidraw como base dos diagramas; lista de tarefas organizada em Hoje, Amanhã, Essa semana e Semana que vem. Remover a seção de IA e as respectivas âncoras.

### Comportamento

Foco inicial no campo da nota sem deslocar a página ou recuperar o foco após o visitante trocar de painel. Texto inicial vazio; manter placeholder de escrita. Remover o redimensionamento manual da textarea. Conexões e nós do diagrama compartilham um sistema de coordenadas para evitar desalinhamento ao redimensionar.

### Interface

Preservar H1, “Só isso.” e “(Com IA, se você quiser)”. Remover frases genéricas do hero, sidebar, rodapé do preview e legenda do diagrama. As colunas do aplicativo continuam por trás do gradiente; não há barra ou divisória separando a área que desaparece. Controles permanecem acima da região de fade.

### Código e distribuição

- Luna high: foco, textarea, diagrama e geometria do fade em app-preview.
- Luna medium: exemplos técnicos em feature-study, incluindo quatro períodos da lista de tarefas.
- Luna low: conteúdo das seções e remoção de IA/âncoras.
- Coordenador: integração, CSS da página, build, testes e inspeção visual do preview em desktop/mobile. Alterações restritas à LP.

## Planos e páginas legais (03/10/2026)

- A home ganhou a seção 04 Planos por pedido do dono do produto. Esse pedido substitui a restrição anterior de mencionar IA só no H1.
- Páginas novas: `/planos/`, `/termos/`, `/privacidade/`, `/en/terms/` e `/en/privacy/`.
- Dados em `src/data/planos.ts` (planos e preços) e `src/data/empresa.ts` (identidade de quem vende, com marcadores a preencher).
- Textos legais em `docs/legal/`.
