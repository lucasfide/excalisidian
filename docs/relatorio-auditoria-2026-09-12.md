# Relatório de auditoria — Excalisidian

Data: 12/09/2026. Versão: 0.2.0. Commit examinado: `5bff5f2a333e511e7203b8056a0c92192bd7d4a9`.

## Resumo executivo

Foram identificados **20 achados: 10 de prioridade P1 e 10 de prioridade P2**. Os problemas mais urgentes são de integridade: sobrescrita de conflitos, descarte de edições ao fechar, gravações incompletas do canvas e corrupção de metadados de desenhos. Também há falhas na indexação concorrente, inconsistências de links, processamento quadrático de texto e fragilidades na contenção do acesso ao disco.

A suíte existente passou: **237 testes em 32 arquivos**. O build TypeScript/Vite também passou. Isso não elimina os achados: diagnósticos adicionais reproduziram **11 cenários** usando os módulos reais com disco, relógio e integrações simulados. O `npm audit` apontou **9 pacotes afetados, 2 classificados como altos e 7 como moderados**, sem demonstração de exploração desses avisos no aplicativo.

Não foi demonstrada execução remota de código, extração de arquivos ou vulnerabilidade crítica explorável a partir de uma nota. Os achados de segurança abaixo deixam explícitas as condições necessárias e o que ainda precisa de validação nativa.

## Escopo, método e limitações

- Revisão de código em `src/`, comandos Rust em `src-tauri/src/`, permissões Tauri, configurações, dependências, persistência, watcher, links, canvas, fluxo de atualização e workflows de CI/release.
- Comparação de comportamentos com as especificações locais, especialmente `docs/02-modelo-de-dados.md`, `docs/04-regras-de-negocio.md` e decisões pertinentes de `docs/09-decisoes-e-incertezas.md`. Funcionalidades explicitamente adiadas não foram automaticamente classificadas como bugs.
- Buscas por sinks de HTML, navegação, carregamento externo, operações de disco e padrões comuns de credenciais. Não apareceram credenciais nos padrões pesquisados; isso não equivale a uma varredura completa do histórico Git.
- `npm ci --ignore-scripts --no-audit --no-fund` instalou as dependências do lockfile. Scripts de instalação não foram executados. O build validado é o do frontend, não o instalador nem o funcionamento offline de todos os assets.
- Na primeira rodada, `cargo` não estava disponível. Na complementação de 12/09/2026, após a instalação das dependências, foi localizado em `C:\Users\Usuário\.cargo\bin\cargo.exe` (versão 1.98.1); o terminal ainda mantinha o PATH anterior. `cargo fmt --check` e `cargo check --locked` passaram. Os resultados adicionais estão na tabela de verificações. Não foram executados empacotamento do instalador Tauri, interface WebView2, atualização real ou operações em vaults do usuário.
- Performance foi medida em um microbenchmark Node.js 24.16.0 nesta máquina. Não foram medidos FPS, consumo de RAM do aplicativo ou tempo de abertura de um vault real com 5.000 notas.
- A revisão é ampla, mas não constitui prova de ausência de outros defeitos. Condições de corrida no sistema de arquivos e comportamentos nativos exigem testes adicionais em Windows.

O código funcional não foi corrigido. Foram acrescentados este relatório e um script de diagnóstico.

### Skills pesquisadas e utilizadas

| Etapa | Skill/recurso | Aplicação nesta auditoria |
|---|---|---|
| Descoberta | `skill-installer`, local | Consultada para localizar skills. O helper falhou porque Python não estava instalado; o catálogo oficial foi consultado pela web. |
| Segurança do frontend | [security-best-practices](https://github.com/openai/skills/blob/main/skills/.curated/security-best-practices/SKILL.md) | Aplicada após leitura das referências de JavaScript geral e React/TypeScript: rastreamento de entradas/sinks, permissões, configuração e dependências; achados com evidência e ressalvas. |
| Revisão de mudanças | `review-agent`, encontrada localmente | Inspecionada, mas não aplicada: é destinada à revisão delegada de regressões em um diff, enquanto o pedido cobre o estado do projeto inteiro. |
| Modelagem formal de ameaças | [security-threat-model](https://github.com/openai/skills/blob/main/skills/.curated/security-threat-model/SKILL.md) | Avaliada, não aplicada como workflow: o pedido é uma auditoria de defeitos, não a produção separada de um modelo formal. |
| Testes de interface | `playwright` / `playwright-interactive`, encontrados no [catálogo oficial](https://github.com/openai/skills/tree/main/skills/.curated) | Potencialmente úteis para frontend; não usados como substitutos de testes nativos de IPC, fechamento e disco no WebView2. |
| Rust, bugs, performance e escala | Código local, Vitest e diagnósticos próprios | Não havia skill instalada específica que cobrisse adequadamente a auditoria Rust/Tauri e esses testes. A referência de segurança utilizada não cobre Rust. |
| Entrega | Markdown | Criação direta; skills de Word/PDF não eram necessárias. |

Nenhuma skill foi instalada globalmente. A orientação de segurança influenciou a separação entre falha confirmada, defesa ausente e exploração ainda não demonstrada.

## Prioridades e índice dos achados

P1: corrigir com urgência, preferencialmente antes da próxima distribuição. P2: defeito ou fragilidade acionável, a tratar em seguida. Prioridade do projeto não é o mesmo que severidade de um advisory.

“Reproduzido” significa execução dos módulos reais com dependências externas simuladas. “Código” significa fluxo demonstrável por inspeção, sem execução da interface nativa. “Condicional” exige uma precondição adicional indicada no texto.

| ID | Prioridade | Categoria | Achado | Evidência |
|---|---|---|---|---|
| 01 | P1 | Bug / integridade | Autosave sobrescreve conflito sem decisão do usuário | Reproduzido |
| 02 | P1 | Bug / integridade | Fechamento prossegue após falha de gravação | Reproduzido + código |
| 03 | P1 | Bug / integridade | Fechar última aba descarta edição mais nova que a gravação em andamento | Reproduzido |
| 04 | P1 | Bug / integridade | Gravação lenta deixa edição pendente marcada como salva | Reproduzido |
| 05 | P1 | Bug / integridade | Debounce do canvas fica fora do flush de fechamento | Código |
| 06 | P1 | Bug / integridade | Atualização pode encerrar o aplicativo sem salvar pendências | Código + contrato do plugin |
| 07 | P1 | Bug / formato | Serialização manual corrompe frontmatter YAML | Reproduzido |
| 08 | P1 | Bug / integridade | Cena inválida é tratada como desenho vazio e pode ser sobrescrita | Reproduzido + código |
| 09 | P1 | Bug / inconsistência | Rename torna editável o painel que era somente leitura | Reproduzido |
| 10 | P1 | Bug / integração | Embed de desenho usa decoração de bloco proibida em ViewPlugin | Código + biblioteca instalada |
| 11 | P2 | Bug / sincronização | Ressincronização não atualiza documentos abertos | Reproduzido |
| 12 | P2 | Bug / concorrência | Reindexações paralelas descartam entradas umas das outras | Reproduzido |
| 13 | P2 | Performance / escala | Extração de links tem custo quadrático | Medido |
| 14 | P2 | Performance / escala | Atualização de um arquivo reconstrói e persiste o índice completo | Código |
| 15 | P2 | Bug / inconsistência | Wikilinks sem pasta e com extensão explícita não resolvem | Reproduzido |
| 16 | P2 | Bug / inconsistência | Mover arquivo pode fazer link existente apontar para outro arquivo | Resolução reproduzida + código |
| 17 | P2 | Segurança | Frontend pode ampliar arbitrariamente o escopo de disco | Código; impacto condicional |
| 18 | P2 | Segurança | CSP está desativada | Configuração confirmada |
| 19 | P2 | Segurança / dependências | Lockfile contém dependências com advisories | npm audit |
| 20 | P2 | Bug / cache | Preview SVG não acompanha alterações do desenho | Código; após corrigir 10 |

## Achados P1

### 01 — Autosave sobrescreve conflitos e recria órfãos sem autorização

**Local:** `src/estado/documentosStore.ts:100–120, 190–225`.

`aoEventoExterno()` muda o estado para `conflito` ou `orfao`, mas não cancela o timer. `salvar()` verifica diferença de conteúdo, sem impedir esses estados. `flushTudo()` também inclui documentos em conflito. A regra de negócio exige decisão do usuário nesses casos (`docs/04-regras-de-negocio.md:17–18`).

**Reprodução executada:** abrir `Nota.md` com `original`, editar para `local`, mudar o disco simulado para `externo`, entregar o evento e avançar o relógio em 800 ms. O estado chega a `conflito`, mas o disco termina com `local` sem chamada a `manterMinhaVersao()`.

**Impacto:** perda silenciosa da versão externa. No caminho de remoção, uma nota pode ser recriada automaticamente se a pasta ainda existir.

**Correção sugerida:** cancelar autosave ao entrar nesses estados e impedir gravação automática/flush até resolução explícita; preservar a decisão também no blur e fechamento. Testar conflito seguido de avanço do relógio, blur, fechar e renomear outro arquivo.

### 02 — Falha ao salvar não impede o fechamento

**Local:** `src/estado/documentosStore.ts:143–148, 217–225`; `src/editor/useAutosave.ts:16–24`; `src/estado/tarefasStore.ts:290–302`; `src/estado/workspaceStore.ts:228–230`.

`salvar()` captura a exceção e resolve sua Promise. `flushTudo()` exclui documentos em `erro` e não devolve um resultado que indique pendências. O handler aguarda essa Promise e chama `janela.close()` mesmo assim. `_persistirAgora()` das tarefas também engole a falha depois do toast. Ao fechar uma aba, o documento é removido sem aguardar nem confirmar uma gravação malsucedida.

**Reprodução executada:** adapter que lança `EACCES`; `await flushTudo()` termina normalmente com a nota ainda em `erro` e o disco inalterado. A chamada posterior a `close()` foi verificada no código, não executada nativamente.

**Impacto:** perda de edições com disco cheio, permissão revogada ou outra falha de I/O, contrariando o diálogo de descarte exigido em `docs/04-regras-de-negocio.md:23`.

**Correção sugerida:** retornar/propagar falhas de persistência, manter janela/aba aberta e oferecer tentar novamente ou descartar explicitamente. Aplicar o mesmo contrato a tarefas e layout.

### 03 — Fechar uma aba durante uma gravação descarta a edição mais recente

**Local:** `src/estado/workspaceStore.ts:218–230`; `src/estado/documentosStore.ts:118–120, 228–235`.

`aoRemoverPainel()` chama `void salvar(path)` e imediatamente `fechar(path)`. Se uma gravação de v1 já estiver em andamento, `salvar()` devolve essa operação, sem capturar v2. `fechar()` apaga o documento e cancela o timer que ainda poderia salvar v2.

**Reprodução executada:** iniciar uma gravação bloqueada de v1, editar para v2, remover o último painel e liberar a gravação. Resultado: disco em v1, documento ausente do store e v2 perdida.

**Correção sugerida:** reter o estado até drenar a fila de gravação, incluindo a versão mais recente, e só então descartar a aba. Preservar o conteúdo em caso de erro. É um defeito de descarte imediato distinto do reagendamento do achado 04.

### 04 — Autosave lento abandona a versão mais nova e mostra “salvo”

**Local:** `src/estado/documentosStore.ts:118–151`.

Quando o timer de uma nova edição vence durante uma gravação anterior, `if (emVoo) return emVoo` consome a oportunidade de salvar. Ao concluir, a operação anterior marca `estado: "salvo"` incondicionalmente. Não há reagendamento para a diferença entre `conteudoEditor` e o conteúdo efetivamente gravado.

**Reprodução executada:** manter v1 em gravação por mais de 800 ms, editar para v2 e disparar seu timer; concluir v1 e avançar mais 3 segundos. O disco segue em v1, o editor em v2 e o estado em `salvo`.

**Impacto:** informação enganosa de persistência e perda em encerramento inesperado. Um flush posterior pode recuperar v2 se o documento ainda estiver no store, mas o autosave sozinho não converge.

**Correção sugerida:** após cada gravação, comparar a revisão atual com a revisão salva e continuar a fila enquanto houver diferença; derivar o indicador de salvo dessa comparação.

### 05 — A última edição do canvas ainda não existe no store quando o app fecha

**Local:** `src/canvas/EditorDesenho.tsx:40, 341–418`; `src/layout/PainelDesenho.tsx:35–39`; `src/editor/useAutosave.ts:20–24`.

O canvas tem um debounce próprio de 800 ms antes de serializar e chamar `onEditar(md)`. Depois disso ainda existe o debounce do store. Fechar a janela ou a aba antes do primeiro debounce faz o flush enxergar apenas a versão anterior. O timer local não integra o contrato de flush; não há limpeza/drenagem desse timer no desmontar.

**Cenário:** alterar uma forma e fechar em menos de 800 ms. Ao fechar a aba, o callback tardio pode encontrar o documento já removido e `editar()` retorna sem fazer nada.

**Impacto:** desaparecimento da última alteração ou da imagem recém-colada. O caminho foi verificado estaticamente; precisa de reprodução WebView2.

**Correção sugerida:** registrar imediatamente que a cena está pendente e disponibilizar um flush assíncrono do editor, aguardado antes do flush dos documentos. Esse flush deve aguardar também a adoção dos binários.

### 06 — O fluxo de atualização não salva antes da instalação/reinício

**Local:** `src/estado/atualizacaoStore.ts:43–81`; `src/editor/useAutosave.ts:16–24`.

`aplicar()` chama `downloadAndInstall()` e `relaunch()` sem drenar documentos, canvas, tarefas ou layout. O flush existente está ligado a `onCloseRequested`, que não é um contrato geral para encerramento do processo. A documentação no plugin instalado, `node_modules/@tauri-apps/plugin-updater/dist-js/index.js:50–58`, especifica que `downloadAndInstall()` encerra o aplicativo no Windows após iniciar o instalador.

**Impacto:** uma edição ainda no debounce ou em gravação pode se perder durante atualização; só salvar depois de `downloadAndInstall()` já seria tarde no Windows.

**Correção sugerida:** separar download de instalação, bloquear novas alterações no momento final, executar um flush completo com tratamento de falhas e então instalar. Não foi disparada uma atualização real nesta auditoria.

### 07 — Serialização de YAML não preserva strings e objetos válidos

**Local:** `src/canvas/formatoDesenho.ts:155–168`; `src/indice/frontmatter.ts:36–46`.

`emitirValorYaml()` usa `String(v)` e concatenação de arrays. Uma string válida como `descricao: "a: b"` é reemitida como `descricao: a: b`, que é YAML inválido. Objetos viram `[object Object]`; strings com vírgulas em arrays, quebras de linha e valores que parecem booleanos/números também precisam de escaping e preservação de tipo.

**Reprodução executada:** serializar um desenho com `descricao = "a: b"` e objeto em `detalhes`; reabrir o resultado. O frontmatter retornou `{}` porque o parser capturou o erro de YAML.

**Impacto:** corrupção de metadados do usuário ao salvar um desenho válido. Na gravação seguinte os campos perdidos deixam de ser emitidos.

**Correção sugerida:** usar serialização YAML apropriada, já disponível por `js-yaml`, com testes de round-trip de strings, arrays, objetos, nulos, datas e campos desconhecidos; preservar o original quando a leitura falhar.

### 08 — Cena inválida é convertida silenciosamente em cena vazia

**Local:** `src/canvas/formatoDesenho.ts:290–310, 328–367`; `src/canvas/EditorDesenho.tsx:342–416`.

Uma cerca não reconhecida ou JSON inválido faz `parsearCena()` devolver `{ elements: [], appState: {} }`, sem distinguir corrupção de desenho vazio. O editor permite seguir pelo caminho normal de alteração/serialização.

**Reprodução executada:** inserir `{ JSON INVALIDO }` na seção Scene de um desenho; parsear e serializar. A cena resulta vazia, e o texto inválido original desaparece do resultado.

**Impacto:** um arquivo parcialmente recuperável pode ser substituído por um desenho vazio quando o usuário interagir ou ocorrer uma alteração serializável. O round-trip destrutivo foi reproduzido; o disparo automático na montagem não foi validado em WebView2 e não é necessário para o cenário de edição subsequente.

**Correção sugerida:** retornar erro de formato separado, abrir em modo de recuperação sem autosave e preservar o conteúdo original. Validar também o schema antes de usar `elements.map()`.

### 09 — Renomear remove a proteção de somente leitura do split

**Local:** `src/estado/workspaceStore.ts:128–149, 161–179`; `src/layout/PainelDocumento.tsx:31–33`; `src/layout/PainelDesenho.tsx:20–22`.

`dividirAtivo()` cria a segunda vista com `somenteLeitura: true` para evitar sobrescrita entre editores. `renomearDocumento()` recria todos os painéis com apenas `params: { path: novo }`, descartando essa propriedade. Os painéis interpretam a ausência como `false`.

**Reprodução executada:** simular dois painéis da mesma nota, um de leitura, e renomear. Os dois novos painéis foram criados sem `somenteLeitura`.

**Impacto:** reativa justamente a edição simultânea que a restrição documentada procurava evitar; uma vista desatualizada pode substituir conteúdo da outra.

**Correção sugerida:** preservar parâmetros, condição de leitura e posicionamento de cada painel ao trocar o caminho. Testar split → rename/move → edição.

### 10 — Embed de desenho usa decoração de bloco em um ViewPlugin

**Local:** `src/editor/extensoes/embedDesenho.ts:128–138, 177`; `src/editor/EditorNota.tsx:35–39`.

A extensão cria `Decoration.replace({ widget, block: true })` e fornece essas decorações por `ViewPlugin.fromClass(..., { decorations })`. O CodeMirror instalado rejeita essa combinação com `RangeError("Block decorations may not be specified via plugins")` em `node_modules/@codemirror/view/dist/index.js:2752`. A própria extensão de imagens do projeto usa um `StateField` por esse motivo.

**Cenário:** abrir uma nota contendo um `![[D.draw]]` que resolva para um desenho existente. Ao fornecer a decoração de bloco, o editor alcança a restrição da biblioteca; o limite de erro pode substituir o editor pela tela de falha.

**Impacto:** quebra de uma funcionalidade central especificada por RF6.1. Evidência estática de alta confiança, sem execução de DOM nesta auditoria.

**Correção sugerida:** fornecer os blocos diretamente por um `StateField`/facet compatível. Incluir teste de integração que monte de fato o EditorView com um embed resolvido; testar somente o exportador SVG não cobre essa falha.

## Achados P2

### 11 — Ressincronizar não reconcilia notas já abertas

**Local:** `src/estado/vaultStore.ts:124–127`; `src/app/useRessincronizarAoVoltar.ts`; `src/estado/documentosStore.ts:190–214`.

`ressincronizar()` refaz árvore e índice, mas não chama `aoEventoExterno()` para os documentos abertos. A rotina é usada justamente quando o watcher perdeu eventos ou a janela retorna após ausência prolongada.

**Reprodução executada:** invocar a rotina com adapter simulado e contar notificações a documentos: zero. **Impacto:** uma aba limpa continua mostrando a versão antiga, e uma aba suja não recebe indicação do conflito perdido. A próxima edição pode sobrescrever conteúdo externo.

**Correção sugerida:** comparar todos os documentos abertos com o disco após a varredura, tratando alterações e remoções com o mesmo contrato dos eventos normais.

### 12 — Atualizações concorrentes do índice perdem modificações

**Local:** `src/estado/vaultStore.ts:174–194, 111–112`; `src/estado/documentosStore.ts:134`.

`reindexarArquivo()` copia `indice` antes de aguardar a leitura. Duas chamadas partem do mesmo snapshot; cada uma publica seu mapa completo e a última sobrescreve a primeira. Chamadas disparadas sem await pelos saves e lotes do watcher tornam essa interleaving alcançável.

**Reprodução executada:** iniciar a indexação de A e B com índice vazio, concluir A e depois B. A desapareceu do índice final, embora permaneça no disco.

**Impacto:** backlinks, sugestões e operações de rename podem usar dados incompletos até nova indexação.

**Correção sugerida:** serializar commits do índice ou aplicar o resultado da leitura sobre o estado mais recente com controle de revisão/vault; agregar lotes e invalidar resultados antigos.

### 13 — Extração de links percorre o início do texto novamente para cada ocorrência

**Local:** `src/indice/wikilink.ts:67–91`; `src/editor/extensoes/embedDesenho.ts:112–113, 165–168`; `src/indice/parser.ts:102`.

`linhaEm()` percorre de zero até a posição de cada match. Com L links e T caracteres, o custo é O(L × T); aumentando ambos proporcionalmente, o crescimento é quadrático. O indexador usa essa função e a extensão de embed a chama novamente em alterações do documento, na thread de interface.

**Microbenchmark executado:** texto ASCII formado por linhas de 100 caracteres, uma ocorrência de `[[Nota]]` por linha; uma execução de aquecimento e uma medida por tamanho.

| Links | Caracteres/bytes ASCII | Tempo da extração |
|---:|---:|---:|
| 2.000 | 200.000 | 369,5 ms |
| 4.000 | 400.000 | 2.402,4 ms |
| 8.000 | 800.000 | 10.218,9 ms |

**Impacto:** pausas prolongadas com notas densas em links e indexação muito cara de arquivos grandes. Os tempos são ilustrativos desta máquina, não percentis de produção nem benchmark de WebView2.

**Correção sugerida:** manter posição/linha durante uma única passagem ou pré-calcular offsets de linhas; atualizar apenas regiões alteradas no editor e deslocar trabalho pesado para worker quando necessário.

### 14 — A indexação incremental faz trabalho global por arquivo

**Local:** `src/estado/vaultStore.ts:174–194, 229–233`; `src/indice/backlinks.ts:28–67`; `src/indice/cache.ts:44–56`.

Uma mudança copia o mapa completo, percorre todas as entradas, reconstrói resolução e backlinks de todo o vault e persiste todas as metas. Um lote de até 50 eventos repete esse trabalho por caminho. `salvarIndice()` ainda é disparado sem await, permitindo gravações de cache sobrepostas.

**Impacto de escala:** K arquivos alterados podem provocar K reconstruções e K serializações globais; o custo cresce com arquivos e links do vault mesmo quando o texto modificado é mínimo. A reconstrução de backlinks também ordena listas. Não foi medido o tempo total de um vault de 5.000 notas.

**Correção sugerida:** aplicar o lote inteiro antes de derivar/persistir uma vez, usar debounce do cache e atualizar backlinks por origem. Medir abertura quente/fria e latência após bursts de alterações antes de declarar atendimento ao RNF1.

### 15 — Extensão explícita funciona com pasta, mas falha sem pasta

**Local:** `src/indice/resolucao.ts:33–41, 113–124`; `docs/03-requisitos-mvp.md:107`.

O índice por basename registra `Nota` e `D.draw`/`D`, mas não `Nota.md` e `D.draw.md`. Sem `/`, o resolvedor consulta apenas esse índice; não tenta o caminho exato.

**Reprodução executada:** com `Nota.md` e `D.draw.md` presentes, resolver `Nota.md` e `D.draw.md` retorna `null`. Com caminho de pasta, o ramo de caminho exato é diferente.

**Impacto:** links válidos aparecem não resolvidos, embeds com extensão explícita falham e o caminho de criação pode gerar uma nota em outra pasta em vez de navegar ao arquivo existente.

**Correção sugerida:** suportar a forma explícita sem sacrificar a precedência e proximidade entre homônimos; adicionar testes com e sem pasta e com `.md`/`.draw.md`.

### 16 — A reescrita após mover não garante que o link continue apontando ao mesmo arquivo

**Local:** `src/vault/renomear.ts:127–135, 214–225`; `src/indice/resolucao.ts:70–102`.

`calcularNovoAlvo()` preserva basename para todo link antigo sem `/`, sem verificar se o novo basename é inequívoco para aquela origem após a movimentação.

**Cenário concreto:** `A/Origem.md` contém `[[Antigo]]`, que aponta para `A/Antigo.md`; existe também `A/Alvo.md`. Ao mover/renomear o primeiro para `B/Alvo.md`, a reescrita produz `[[Alvo]]`. O resolvedor prefere `A/Alvo.md`, que é outro arquivo. Essa preferência foi executada no diagnóstico; a transformação foi confirmada no código da movimentação.

**Impacto:** links continuam visualmente válidos, mas navegam para conteúdo errado, tornando o defeito menos perceptível que um link quebrado.

**Correção sugerida:** construir a resolução pós-movimentação e escolher o menor texto que ainda resolva para `pathNovo` a partir de cada origem; usar caminho completo quando o basename for ambíguo.

### 17 — A fronteira Rust permite ao frontend conceder acesso a qualquer pasta

**Regra:** autorização na fronteira de confiança, relacionada a `REACT-AUTHZ-001`. **Severidade técnica:** impacto potencial alto; prioridade P2 pela precondição de comprometimento do frontend.

**Local:** `src-tauri/src/vault.rs:31–34, 55–57, 67`; `src-tauri/src/watcher.rs:74–80`; `src-tauri/src/lib.rs:22–27`; `src-tauri/capabilities/main.json:13–24`.

**Evidência:** `permitir_vault(app, path)` chama `.allow_directory(path, true)` para a string recebida do JavaScript, sem verificar uma raiz selecionada/persistida sob controle do backend. `walk_vault(path)` e `observar_vault(path)` também aceitam caminhos sem validar o vault ativo. Existe `escolher_vault()` com diálogo nativo no Rust, mas a escolha do frontend usa o comando permissivo.

**Impacto e condição:** código que já consiga executar no contexto autorizado da janela pode pedir um novo escopo e usar as permissões de leitura/escrita/remoção fora do vault escolhido, dentro dos direitos do usuário do SO. Não exige traversal. Isso não demonstra que um site remoto ou uma imagem consegue executar esse código; essa etapa não foi encontrada/reproduzida.

**Correção sugerida:** fazer seleção/restauração da raiz no backend, validar canonicalização e pertencimento em todos os comandos de vault e impedir concessões arbitrárias por string do frontend. Se houver troca de vault, rever também os escopos anteriores. **Mitigação:** reduzir permissões e aplicar CSP; validar a rejeição de raízes não autorizadas em testes nativos. A separação de capacidades é documentada pelo [Tauri](https://v2.tauri.app/security/capabilities/).

### 18 — CSP está explicitamente desativada

**Regra:** `JS-CSP-001` / `REACT-CSP-001`. **Severidade:** média, defesa em profundidade.

**Local:** `src-tauri/tauri.conf.json:23–25`; `index.html`.

**Evidência:** `"csp": null`, sem política equivalente no HTML. O aplicativo renderiza conteúdo de arquivos, usa componentes de terceiros e carrega URLs de imagem a partir do Markdown (`src/editor/atomico/image-blocks.ts:64`).

**Impacto:** falta uma barreira contra execução de scripts e conexões/carregamentos indesejados caso uma entrada ou dependência introduza uma falha. Não é prova isolada de XSS. A [documentação oficial do Tauri](https://v2.tauri.app/security/csp/) confirma que a proteção depende de configuração explícita.

**Correção sugerida:** definir uma política compatível com IPC, scripts/assets locais, imagens e recursos necessários ao Excalidraw; testar o build empacotado e o funcionamento offline. **Mitigação:** restringir conteúdo remoto e evitar sinks inseguros. Não introduzir permissões genéricas de script como correção de compatibilidade sem investigar a necessidade.

### 19 — Dependências transitivas têm avisos de segurança conhecidos

**Regra:** `REACT-SUPPLY-001`. **Severidade reportada pelo npm:** 2 pacotes altos e 7 moderados; exploração no aplicativo não confirmada.

**Local:** `package-lock.json:817–820, 4558–4561, 5479–5482`.

| Dependência instalada | Versão | Evidência do audit |
|---|---|---|
| `lodash-es` | 4.17.21 | Code injection em `template` e prototype pollution em operações específicas |
| `nanoid` | 3.3.3 | Advisories de geração com tamanhos/parâmetros problemáticos |
| `nanoid` via mermaid-to-excalidraw | 4.0.2 | Advisories de geração, loops e overflow em condições específicas |

Os sete avisos moderados incluem a propagação pelos pacotes Excalidraw/Mermaid/Chevrotain/Langium; não representam necessariamente sete vulnerabilidades independentes. Fontes retornadas pela consulta incluem [advisory do mantenedor do Lodash](https://github.com/lodash/lodash/security/advisories/GHSA-r5fr-rjxr-66jc), [Nano ID — parâmetros não inteiros](https://github.com/advisories/GHSA-mwcw-c2x4-8c55) e [Nano ID — overflow](https://github.com/advisories/GHSA-xwg4-73v4-xw9w).

**Impacto e ressalva:** a presença da versão afetada foi confirmada; não foi estabelecido que conteúdo não confiável alcance os parâmetros vulneráveis. Não se deve converter automaticamente o score do advisory em “RCE no Excalisidian”.

**Correção sugerida:** rastrear os usos vulneráveis e atualizar transitivas/avaliar overrides compatíveis, verificando o resultado por testes e novo audit. O Excalidraw está explicitamente fixado em 0.18.1. O npm sugeriu inclusive 0.17.6 como alternativa para parte da árvore: não aplicar `audit fix --force` ou esse downgrade sem uma análise dedicada. **Mitigação:** limitar funcionalidades/caminhos afetados quando a atualização não for viável e incluir triagem recorrente de dependências no CI.

### 20 — O cache SVG usa metadados que o autosave não atualiza

**Local:** `src/canvas/renderSvg.ts:19–23, 41–47, 73–75`; `src/estado/vaultStore.ts:174–194, 216–226`; `src/editor/extensoes/embedDesenho.ts:48–55, 165–168`.

O cache usa caminho/tema e o `mtimeMs` de `entradas`. O save chama `reindexarArquivo()`, que reutiliza os metadados existentes; o evento da escrita própria é ignorado antes da recarga da árvore. Assim, o mtime utilizado pelo cache pode continuar igual após alterar o desenho. Além disso, o widget só é reconstruído por edição da nota ou mudança de tema, e sua igualdade não inclui revisão da cena.

**Cenário:** depois de corrigir o achado 10, renderizar um desenho em uma nota, editar e salvar o desenho e voltar à nota/reabrir o embed na mesma sessão. O cache pode devolver o SVG anterior; um widget já montado também não acompanha a mudança.

**Impacto:** nota e canvas exibem versões diferentes do mesmo desenho. É um defeito latente adicional, atualmente mascarado pela integração de blocos do achado 10; não foi observado visualmente nesta auditoria.

**Correção sugerida:** invalidar por revisão/conteúdo após save, atualizar metadados reais e notificar widgets dependentes; incluir identidade do vault na chave e uma política de limite para o cache. Testar alteração do desenho e também de uma imagem referenciada.

## Evidências executáveis e resultados

O script [auditoria-reproducoes.cjs](../scripts/auditoria-reproducoes.cjs) lê e transpila os módulos TypeScript reais em memória. Substitui filesystem/IPC/timers por adapters e relógio controlados. **Sucesso no script significa que os defeitos atuais foram reproduzidos**, não que o produto foi aprovado. Depois das correções, algumas assertions devem falhar e poderão ser convertidas em testes de regressão que esperam o comportamento correto.

Executar a partir da raiz do repositório:

```powershell
rtk proxy npm test
rtk proxy npm run build
rtk proxy node scripts/auditoria-reproducoes.cjs
rtk proxy node scripts/auditoria-reproducoes.cjs --benchmark
rtk proxy npm audit --json --ignore-scripts
```

O benchmark é opcional e pode levar dezenas de segundos. O script não escreve notas nem chama o backend nativo. A consulta de audit depende de rede e seus resultados mudam conforme novos advisories são publicados.

| Verificação | Resultado nesta auditoria |
|---|---|
| Vitest | 32 arquivos, 237 testes aprovados; 8,27 s informados pelo runner |
| TypeScript + Vite | Aprovado; 4.312 módulos transformados |
| Diagnósticos adicionais | 11 cenários confirmados, exit code 0 |
| Microbenchmark | 8.000 links / 800.000 caracteres: 10.218,9 ms na extração medida |
| npm audit | Exit code 1; 9 pacotes afetados, 2 altos e 7 moderados |
| Cargo / formatação Rust | Cargo 1.98.1; `cargo fmt --manifest-path src-tauri/Cargo.toml --check` aprovado |
| Checagem Rust | `cargo check --locked --manifest-path src-tauri/Cargo.toml` aprovado em 23,95 s |
| Instalador / WebView2 | Empacotamento e testes da interface nativa não executados |

O build também avisou sobre chunks maiores que 500 KB e imports dinâmicos de linguagens CodeMirror que já entram estaticamente por outras dependências. O chunk principal emitido ficou em aproximadamente **2.260,95 KB minificado / 692,79 KB gzip**. Isso merece medição de inicialização e análise de carregamento sob demanda, mas o tamanho isolado não foi contado como bug nem como prova de violação de uma meta de latência.

## Ordem recomendada de tratamento

1. **Persistência e encerramento:** 01–06. Definir um único contrato de flush que inclua editores, documentos, tarefas e layout, com fila por arquivo, preservação de conflito e propagação de falhas.
2. **Proteção do formato e das vistas:** 07–09. Adicionar testes de round-trip e de preservação de estado em rename/split antes de alterar serializadores.
3. **Integração de embeds:** 10 e 20. Validar em EditorView real e depois em WebView2; conferir invalidação após edição do desenho e dos anexos.
4. **Coerência de índice e links:** 11, 12, 15 e 16. Exercitar alterações externas, homônimos e commits concorrentes de indexação.
5. **Contenção e dependências:** 17–19. Testar rejeição de caminhos não autorizados no backend, configurar CSP e tratar os advisories sem violar a fixação do Excalidraw.
6. **Escala:** 13 e 14. Medir depois das mudanças com vaults sintéticos e reais, incluindo links densos, bursts de eventos e cache quente/frio.

### Lacunas de teste a fechar

- Montagem real do CodeMirror com embeds resolvidos e múltiplos painéis.
- I/O lento, erro de permissão/disco cheio, fechamento repetido e update com alterações pendentes.
- Conflito/remoção externa durante autosave; recuperação após perda de eventos do watcher.
- Corrupção parcial de `.draw.md` e metadados YAML não triviais, preservando sempre o original.
- Testes nativos de permissões e contenção; auditoria do `Cargo.lock` com ferramenta apropriada.
- Benchmarks de abertura quente/fria, RAM e latência de interação no Windows/WebView2.

As falhas demonstradas de integridade devem ser corrigidas antes de considerar o resultado dos testes atuais suficiente para uma nova distribuição.
