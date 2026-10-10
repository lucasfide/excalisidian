# Excalisidian mobile — plano aprovado

Status: aprovado pelo usuário em 03/10/2026; execução iniciada.
Base da análise inicial: branch `lucasfide/Mobile`, commit `e9255bb`, versão 0.5.6.
Base da execução: `servicos-online`, commit `475097e`, integrado por fast-forward
na branch `lucasfide/Mobile`. Trabalho não commitado de `C:/Excalisidian` não foi
copiado nem alterado.

Decisões confirmadas: Android primeiro; Tauri, vault privado e ZIP manual;
escopo e adiamentos aprovados; nenhuma mudança de aparência ou comportamento
desktop. iOS fica para fase posterior. Usar agentes Luna 6 com effort variável.

### Execução do marco de viabilidade

O protótipo Android utiliza vaults privados, os editores existentes de nota e
desenho e uma interface mobile separada. A seleção da interface depende da
plataforma de build, sem adaptar a janela desktop por largura.

O usuário prefere instalar um APK e autorizou a instalação de JDK, SDK/NDK
Android e o aceite das licenças Google. JDK 21, SDK API 36 e NDK 27.2 foram
instalados em `.tools.local`; o alvo Rust ARM64 foi acrescentado ao toolchain
Rust existente. Nenhuma variável de ambiente global foi alterada.

O APK deste marco será debug assinado, destinado ao teste no aparelho.
APK gerado e verificado: `.tools.local/entrega/excalisidian-android-viabilidade.apk`,
ARM64, assinatura debug v2 válida, Android mínimo API 24, target API 36.
O bundle confirma a seleção Android; o hash da biblioteca empacotada coincide
com o artefato Rust. O roteiro e o checksum estão em `teste-mobile-android.md`.
A viabilidade ainda depende de validar teclado, gestos do canvas, salvamento
e reabertura offline no Android real. As fases seguintes do plano, incluindo
ZIP manual e recuperação durável de rascunhos, continuam pendentes desse gate.

Verificações já executadas: build TypeScript/Vite aprovado; testes específicos
de plataforma, contratos e armazenamento aprovados. Na suíte completa,
1.639 testes passaram e o setup de um teste Argon2id excedeu o timeout de
20 segundos; o arquivo passou ao ser repetido isoladamente (15/15).
A interface mobile foi inspecionada em navegador com IPC simulado nas larguras
375, 414, 640, 768, 1024 e 1280 px, sem overflow horizontal. Nota e canvas
renderizaram em 375 px; inputs têm 16 px e os controles próprios têm 48 px de
altura. Isso não valida teclado virtual, gestos ou persistência nativa.
Nenhum breakpoint desktop foi alterado: a casca mobile é selecionada apenas
para o alvo Android/iOS. Os componentes desktop mantêm sua apresentação.

## Recomendação

Manter Tauri 2 + React + TypeScript, compartilhar os motores de notas, desenhos,
busca e tarefas, e criar uma casca de navegação própria para mobile. Começar com
Android, armazenamento local privado e importação/exportação manual do vault.
Preparar o mesmo caminho para iOS, cujo build e validação exigem macOS/Xcode.

Não basta reduzir a sidebar: armazenamento, navegação, teclado virtual e ciclo de
vida exigem adaptações. Não recomendo reescrever o produto em React Native agora.
O primeiro marco deve provar Tauri + CodeMirror + Excalidraw num aparelho real;
a recomendação é condicionada a esse resultado, não uma promessa de compatibilidade.

## Evidência do código atual

| Área | O que existe | Consequência para mobile |
| --- | --- | --- |
| Plataforma | Tauri 2; `src-tauri/src/lib.rs` já tem `mobile_entry_point` e inicialização de updater/process sob `cfg(desktop)` | Há ponto de partida, mas isso não prova que o app compila para mobile |
| Build | `tauri.conf.json` mira NSIS, janela mínima 900×600; sem projeto Android/iOS gerado neste checkout | Configuração e distribuição precisam de alvos próprios |
| Vault | `VaultAdapter` define leitura, escrita, arquivos e eventos | Contrato aproveitável |
| Acoplamento | `vaultStore` e boot de `App.tsx` usam o tipo concreto `TauriVaultAdapter` | Tornar os consumidores necessários dependentes do contrato, sem refatoração geral |
| Armazenamento | Adapter concatena caminhos absolutos; `walk_vault` usa `WalkDir`; seleção usa `directory: true`/`blocking_pick_folder` | Um URI de provedor Android não pode ser tratado como pasta POSIX |
| Escrita | `escritaAtomica.ts` faz temporário + rename, com fila de autosave nos documentos | Reaproveitar em diretório privado e validar falha, substituição e recuperação |
| Navegação | `Workspace.tsx`, `workspaceStore` e painéis dependem de Dockview | Separar abrir/ativar/fechar documento da API de docking nos pontos usados pelo mobile |
| Interface | Sidebar de 264px, painel por hover, linhas com menu de contexto, diálogos centrados | Criar navegação e ações por toque; não comprimir os controles desktop |
| Editores | CodeMirror com live preview; Excalidraw pinado em 0.18.1 | Reutilizar motores; teclado, seleção e gestos ainda precisam ser comprovados |
| Persistência | `useAutosave` faz flush ao fechar janela; retomada usa foco com limiar de 60s | Mobile precisa de salvamento contínuo, suspensão/retomada e recuperação de rascunhos |
| Recursos | Busca, backlinks, anexos, tarefas e lixeira já existem | Reutilizar regras e formatos, adaptar apresentações |
| Planos pagos | Não identifiquei implementação de conta, assinatura ou entitlement nos arquivos pesquisados | Confirmar a branch da nova versão antes de definir integração comercial |

`docs/02-modelo-de-dados.md` continua sendo o contrato: Markdown UTF-8,
`.draw.md`, anexos externos, `.excalisidian/vault.json` e `tarefas.json`.
Layout e cache continuam fora do conteúdo do vault. Não migrar formato de notas.

## Alternativas

| Caminho | Reaproveitamento e custo | Decisão proposta |
| --- | --- | --- |
| Tauri mobile | Mantém frontend, Rust e stack existentes; precisa adaptar APIs desktop e provar WebView | Preferido, sujeito ao marco técnico |
| Capacitor | Mantém frontend web; exige outra ponte de arquivos, preferências, eventos e comandos nativos | Plano B se Tauri tiver bloqueio comprovado; comparar por protótipo antes de migrar |
| React Native/Expo | Reaproveita parte das regras TS; UI, CodeMirror e Excalidraw exigiriam reescrita ou WebView | Custo alto para este lançamento |
| PWA | Facilita acesso pelo navegador; exige adapter web e estratégia de persistência/importação | Possível produto futuro; não resolve sozinho o vault local atual |

Capacitor também usa um runtime para conteúdo web: não presumir que trocar o shell
resolve um problema de teclado ou canvas que esteja no motor web.

## Escopo aprovado da primeira versão

Inclui criar e alternar vaults locais; importar/exportar vault completo; criar,
ler, editar, renomear, mover e excluir notas e desenhos; busca; links e backlinks;
anexar imagens por seleção de arquivo; tarefas e lixeira; tema e preferências
essenciais. Desenhos devem ser editáveis, não apenas imagens de visualização.

Ficam adiados sincronização online, compra de planos dentro do app, agente de IA,
multiwindow, docking/splits e acesso direto a pastas de provedores externos.
Esses adiamentos foram aprovados pelo usuário junto com o plano em 03/10/2026.
Não introduzir login obrigatório para uso offline.

## Interface e comportamento

Preservar identidade Papel/Cristal, tipografia e hierarquia do produto. Novos
componentes usam tokens semânticos conforme as instruções do usuário. O repo
atual tem tokens próprios e primitives em `src/ui`, não uma instalação shadcn:
mapear os tokens no escopo mobile, sem migração global silenciosa ou instalação
de biblioteca. Verificar componentes existentes antes de criar wrappers.

| Tela | Estrutura | Interação |
| --- | --- | --- |
| Entrada | Lista de vaults locais, criar e importar | Criar pede nome, não caminho de pasta; voltar abre o último vault válido |
| Início | Nome do vault, documentos recentes e criar | Seletor de vault abre sheet; sem coleção de mocks inventados |
| Arquivos | Pastas expansíveis e lista com ações visíveis | Toque abre; botão de ações abre sheet para renomear, mover, exportar ou excluir |
| Busca | Campo de pesquisa, resultados e contexto | Abre documento no trecho encontrado; voltar preserva consulta e rolagem |
| Nota | Barra superior com voltar, título, estado de gravação e ações; editor ocupa o restante | Modo de leitura e edição explícitos; formatação junto ao teclado |
| Desenho | Canvas ocupa a tela; voltar e ações compactas | Pinça para zoom, gesto de navegação, ferramentas por toque; abrir texto para recuperação de cena inválida |
| Tarefas | Lista por agrupamento já existente | Criar/editar em sheet; checkbox tocável; preserva formato atual |
| Mais | Preferências, lixeira e importação/exportação | Mostra apenas funções disponíveis no alvo mobile |

Navegação principal: **Início · Arquivos · Busca · Tarefas**. Preferências e
transferência ficam no menu do vault. Botão de criar abre sheet com nota, desenho
e pasta. Documento aberto ocupa uma tela própria, com seletor de documentos
abertos no menu, em vez de uma faixa de abas comprimida.

Fluxo principal: `Vaults → Início/Arquivos/Busca/Tarefas → Documento → Voltar`.
Ao voltar, preservar seleção e rolagem da tela de origem. Links internos abrem
destino e mantêm histórico. Voltar do Android fecha primeiro teclado/sheet e
depois navega; não encerra o app inadvertidamente. iOS tem voltar visível.

Ao editar uma nota, ocultar a navegação inferior e acomodar a barra de formatação
acima do teclado. Respeitar safe areas, orientação e altura útil do viewport;
não depender somente de `100vh`. Inputs com pelo menos 16px; alvos de toque com
48×48px sempre que possível, nunca abaixo de 44×44px. Long press é complementar:
nenhuma ação depende exclusivamente de hover, arrastar, clique direito ou atalho.
Mover arquivo usa escolha de destino, sem exigir drag-and-drop.

Tabelas de conteúdo largo têm rolagem local; não causam overflow da tela. Sheets
mantêm foco e acessibilidade e não ficam atrás do teclado. Erro de salvamento é
visível e mantém o conteúdo editado; não tratar toast de sucesso como prova de gravação.

### Breakpoints e limite do escopo

- Abaixo de `sm` (640px): telefone, uma tela e um documento visível.
- `sm` (640px) até antes de `md` (768px): mesma navegação, espaço maior.
- `md` (768px) em diante, no app mobile: tablet pode mostrar lista + documento;
  inicialmente sem docking ou múltiplos editores montados.
- `lg` (1024px) e `xl` (1280px), no app mobile: ampliar a mesma composição.
- No app desktop, manter comportamento em todos esses tamanhos. Seleção de
  plataforma é separada de largura: um desktop estreito não vira app mobile.

A execução registra os breakpoints afetados no PR/commit e verifica os demais.
Alterações em componentes, hooks ou tokens compartilhados dependem da decisão
do usuário sobre escopo global versus mobile. Proposta: comportamento visual
somente mobile; contratos internos compartilhados só onde necessários, com
regressão desktop. Não editar `src/components/ui/`.

## Vault local e transferência com PC

Guardar cada vault num diretório persistente privado do aplicativo, nunca no
cache. Descobrir a raiz pelas APIs da plataforma; não persistir um caminho iOS
como identidade definitiva. Registro local identifica os vaults e resolve suas
raízes no boot. Conteúdo e referências internas permanecem relativos e NFC.

Entrada manual proposta: ZIP da pasta do vault selecionado pelo picker de arquivo,
copiado para área temporária local e validado antes de criar um novo vault. Incluir
notas, desenhos, anexos e configuração/tarefas; excluir `.git`, cache, workspace
e temporários. Definir explicitamente lixeira como opção de backup, sem perder
conteúdo inesperadamente. Não fundir silenciosamente com vault existente.

Importação deve rejeitar traversal, caminhos absolutos, symlinks perigosos e
colisões de nomes/capitalização/normalização; impor limites de tamanho expandido
e quantidade de arquivos. Validar dependências referenciadas, relatar anexos
ausentes e preservar arquivos desconhecidos seguros. Falha ou cancelamento não
podem deixar um vault parcialmente publicado na lista.

Saída: gerar snapshot consistente após drenar gravações de notas, canvas e
tarefas; congelar alterações durante o snapshot ou usar cópia consistente.
Compartilhar/salvar o ZIP através da plataforma. Fluxo PC → mobile:
compactar vault → transferir arquivo → importar. Mobile → PC:
exportar → transferir → extrair em nova pasta → abrir como vault no desktop.
Não requer alterar interface desktop para o primeiro fluxo.

**Transferência manual cria cópias independentes.** Não é sincronização nem merge.
Editar a mesma cópia no PC e no celular exige conciliação manual nessa versão.
Vault privado pode ser removido ao desinstalar; informar esse comportamento na
gestão do vault e oferecer exportação. Não prometer backup automático da plataforma.

ZIP e compartilhamento nativo podem exigir dependências que não existem hoje.
Na execução, apresentar necessidade e opções antes de adicionar qualquer lib.
Seleção direta de pasta via Android SAF/iOS document provider fica para outra
fase: exige adapter próprio, permissões persistentes e análise da atomicidade.

## Persistência e preparação para sincronização

Salvar continuamente com fila, flush antes de trocar documento/vault e eventos
de pausa/retomada como reforço. Manter rascunho recuperável persistido fora do
cache, com revisão/base conhecida, antes de declarar uma edição protegida.
Um callback de suspensão isolado não garante gravação antes de o SO matar o app.
Documentar e medir a janela de risco de edições ainda não persistidas.

Recuperação compara rascunho com arquivo/base e oferece resolução quando há
divergência; nunca sobrescreve silenciosamente. Remover rascunho somente depois
de confirmar gravação da revisão correspondente. Canvas e anexos precisam de
ordenação para não salvar referências antes dos binários. Retomada reconcilia
arquivos/índices, sem depender de watcher desktop permanentemente ativo.

Preparar sincronização significa separar plataforma, conteúdo e estado de
interface; definir eventos confiáveis de mutação e estratégia futura para
identidade de vault, revisão, exclusões e conflitos. Não trocar formatos,
implementar serviço de sync ou fingir resolução com "última gravação vence".
Identidade compartilhada, manifestos e histórico devem receber especificação
própria antes de serem gravados no vault normativo.

Conta, entitlement e restrições dos planos devem ser alinhados com a branch
comercial. Expiração de plano não deve bloquear leitura/exportação de dados
locais. Essa política é proposta e precisa de validação do produto.

## Execução após aprovação

Usar agentes **gpt-6-luna**, variando effort conforme abaixo. Separar arquivos de
responsabilidade; tarefas paralelas só depois de fixar contratos. O agente
principal integra e revisa evidências. Nenhum agente inicia implementação antes
da aprovação deste plano.

| Marco | Entrega e gate | Agentes Luna / effort |
| --- | --- | --- |
| 0. Base e viabilidade | Confirmar branch comercial e escopo; executar checks baseline; configurar alvo Android e provar nota, canvas, arquivos privados e teclado num aparelho | Plataforma: high; inventário/checks: low |
| 1. Contratos e dados | Consumidores necessários usam `VaultAdapter`; navegação de documento independente de Dockview; persistência e recuperação com falhas testadas | Armazenamento e ciclo de vida: high; contratos/navegação: high |
| 2. Interface | Casca mobile, vaults, arquivo/busca, editor e canvas; protótipo funcional revisável em telefone/tablet | Navegação e componentes: medium; editores e teclado/gestos: high |
| 3. Recursos e transferência | Tarefas, backlinks, anexos, lixeira, preferências e ZIP com round-trip real no desktop | Telas: medium; importação/exportação e integridade: high |
| 4. Beta Android | Build assinado, instalação/upgrade, QA em aparelho, distribuição de teste e checklist de release | Integração/QA: high; documentação: low |
| 5. iOS | Build macOS/Xcode, testes de WebKit, safe areas, teclado e transferência; beta TestFlight | Plataforma/QA: high; ajustes de telas: medium |

Se marco 0 falhar, registrar causa e comparar o mesmo cenário em Capacitor antes
de mudar a arquitetura. Não usar uma troca de shell para encobrir falha do editor.
Não estimar data de lançamento antes desse marco e da confirmação de Android/iOS.

## Critérios para liberar

- `npm run build` (inclui TypeScript) e `npm test`; testes Rust pertinentes;
  build desktop e Android. Não há script `lint` no `package.json` inspecionado.
- Contrato de adapter cobre listar, ler/escrever, mover, remover, tarefas e
  eventos; erros de I/O não são convertidos em sucesso.
- Vault real vai PC → mobile → PC preservando conteúdo, links, anexos, desenhos,
  tarefas e configurações; abrir/fechar desenho sem editar não muda a semântica.
- Nota e desenho funcionam offline depois de reiniciar o aparelho; sem fontes
  remotas ou chamadas de rede necessárias para o fluxo local.
- Interromper durante digitação, gravação, canvas e importação; retomada/restart
  recuperam revisões persistidas, sem corromper arquivos. Testar falta de espaço.
- Testar teclado virtual, acentos/IME, seleção, tabelas, colagem, imagens, zoom,
  rotação, voltar e safe areas em aparelho; emulação de viewport não basta.
- Conferir 375, 414, 640, 768, 1024, 1280 e 1440px, incluindo tema escuro;
  desktop conserva fluxos e layout. Medir abertura/indexação e canvas com vaults
  e cenas reais, inclusive grandes, antes de fixar limites de desempenho.
- Atualizar/installar beta não perde vault; permissões mobile não carregam
  updater, reinício ou comandos exclusivamente desktop.

Na análise inicial, antes da execução aprovada, `node_modules` estava ausente
e `java`/`adb` não foram encontrados no PATH. Depois da aprovação, as
dependências e o toolchain foram preparados e o APK foi compilado. Os checks
executados estão registrados na seção de execução do marco de viabilidade.

## Decisões validadas pelo usuário em 03/10/2026

1. Android primeiro; iOS fica para uma fase posterior.
2. Tauri, vault privado, ZIP manual, escopo e adiamentos aprovados.
3. Adaptar somente a apresentação mobile; nenhuma mudança no desktop.
4. Usar a branch comercial `servicos-online` como base da execução.

O resultado do teste do APK no aparelho continua pendente. Retomar o objetivo
não substitui essa evidência nem libera automaticamente o próximo marco.

## Fontes externas consultadas

- [Tauri: pré-requisitos Android e iOS](https://v2.tauri.app/start/prerequisites/)
- [Tauri: Dialog — sem folder picker em Android/iOS](https://v2.tauri.app/plugin/dialog/)
- [Tauri: File System](https://v2.tauri.app/plugin/file-system/)
- [Capacitor: runtime e APIs nativas](https://capacitorjs.com/docs)
- [React Native: integração e componentes nativos](https://reactnative.dev/docs/integration-with-existing-apps)
- [MDN: File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)

Suporte exato de toque da integração Excalidraw 0.18.1 e desempenho de CodeMirror
neste app permanecem hipóteses a verificar. Não extrapolar documentação de versões
mais novas para a versão pinada do produto.
