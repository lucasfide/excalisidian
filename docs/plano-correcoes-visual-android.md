# Correcoes visuais Android — plano e distribuicao

## Objetivo e estado

Corrigir os sete problemas confirmados em `docs/qa-mobile-visual.md`, mantendo
a aparencia e o comportamento desktop. Entregar novo APK com evidencias visuais
comparaveis, teclado funcional e persistencia offline preservada.

Execucao autorizada pelo usuario na conversa principal em 09/10/2026.
Foram iniciados os agentes **Luna 6 (`gpt-6-luna`)**:
`visual_a_header` (medium), `visual_b_canvas` (xhigh) e
`visual_c_android` (high), com donos de arquivos separados conforme a tabela.
QA D (high) esta em execucao; revisao E (low) aguarda o aceite de D.
O coordenador preservou a referencia anterior e capturou o App desktop em
1024, 1440 e 600 px, temas claro/escuro, nota e desenho com forma selecionada.
Esse harness usa adapter em memoria e IPC simulado; o QA Android usa APK real.
As capturas ficam em `.tools.local/desktop-visual/before/`.

A, B e C foram integrados. O typecheck passou e a suite existente passou
com **136 arquivos / 1641 testes**. As 12 capturas desktop de depois sao
identicas byte a byte as de antes; hashes em
`.tools.local/desktop-visual/comparison-final.json`. Nenhum breakpoint global foi
alterado. A etapa web e o build Android passaram. O APK fresco tem
171654149 bytes e SHA-256
`33b80b808a164926040df156782859afc955dab60dbe93090101e61f53e75fa3`;
assinatura v2, ARM64, minSdk 24 e targetSdk 36 verificados. A biblioteca
nativa no APK corresponde ao build Rust. D executa o QA nesse artefato;
E aguarda os resultados. Esses checks nao constituem aceite visual Android.

A inspecao da captura nativa em paisagem exigiu compactar o cabecalho e
dispor biblioteca/trava/mao horizontalmente. A regra afeta exclusivamente
o shell mobile em orientacao paisagem, largura >=640 px e altura <=500 px.
A comparacao desktop foi repetida depois desses ajustes: 12/12 PNGs iguais.
O par final usa `before-confirmation/` (EditorDesenho anterior congelado) e
`after-final/`, sob as mesmas configuracoes do Chrome. Capturas feitas em processos
diferentes apresentaram variacao de rasterizacao; o par sob as mesmas condicoes
confirmou 12/12 imagens identicas. As capturas originais foram preservadas.
Cinco testes de regressao do parser de QA tambem passaram; uma tentativa
interrompida por dialogo ANR e uma rodada com coordenadas incorretas nao
foram aprovadas nem usadas como aceite.

A rodada de 17:00 executou os treze cenarios, com 135 verificacoes aprovadas
e cinco falhas registradas. Duas vieram do seletor incorreto do gatilho Edit
das propriedades; duas, da leitura de flags omitidas no dump Android escuro.
Os seis testes do parser corrigido passaram. A falha real restante foi a barra
de formatacao da nota fora do viewport apos retornar ao app com teclado.
A corrigiu essa apresentacao somente no shell mobile. A inspecao adicional
do painel de propriedades confirmou alvos de 21.6/26/32 px; B ampliou os
alvos e acrescentou rolagem. Essas correcoes exigem novo APK e novo QA;
a rodada anterior permanece preservada, sem conversao retroativa em aceite.
O diagnostico seguinte mostrou a barra ampliada sobre Read/Save. O editor
recebeu a prop opt-in `mobileShell`, com padrao false, que limita `tooltipSpace`
ao retangulo do editor. A chamada mobile ativa essa prop. No navegador real,
em 414 x 896 e 414 x 564, a barra passou para baixo da linha vazia, com todos
os botoes em 44 x 44 e os tres botoes do cabecalho acessiveis. Evidencias em
`.tools.local/note-tooltip-896.*` e `note-tooltip-564.*`; sao diagnosticos com
wrapper de QA e IPC simulado, nao substituem o teste do APK. A comparacao
desktop foi repetida apos a prop: 12/12 imagens identicas no par final.
O build com esse confinamento passou pelo TypeScript, Vite e Android. Os
cinco testes existentes de `barraFlutuante.test.ts` tambem passaram apos a
integracao; nenhum teste novo que replique o JSX foi criado.
A rodada de 17:33 desse APK parou em oito capturas e nao foi aprovada. O
painel principal de propriedades confirmou alvos de 44 px e rolagem; a
paleta aberta pelo Stroke usa um portal fora desse painel e ainda apresentou
swatches de 30 px. B corrige o portal. D corrige a identificacao dos dialogs
ativos e a limpeza entre os testes, que deixou o painel sobre o gatilho Link.
O APK dessa rodada foi `15aad33863f66b49a9ee124082ceadb31ba3e8c3bcd7ea0c4721b0ba16ab9726`.
O portal foi corrigido e o APK `33b80b` identificado acima foi produzido em
09/10/2026 as 17:53 UTC; typecheck, web, Android e assinatura passaram. D
inicia a rodada completa nesse artefato, sem CSS de diagnostico injetado.

O teste pontual no APK `15aad` confirmou a correcao da barra de nota apos
Home/retorno com teclado nativo: botoes de formatacao de 44 px, nenhuma
intersecao com o cabecalho e Read/Save acessiveis. Evidencia em
`.tools.local/visual-qa/point-diagnostics/home-ime-15aad/`. Isso nao substitui
a rodada completa. A ultima comparacao desktop, apos o CSS do portal de
cores, esta em `comparison-palette.json` e `pixel-comparison-palette.json`:
11/12 PNGs identicos byte a byte; o restante difere em um unico pixel com
delta 1 de canal no sidebar (22,110). Nao houve diferenca de geometria ou
conteudo. Pares `before-confirmation/` e `after-palette/`; desktop 600,
1024 e 1440 px, ambos os temas, nota e canvas.

A rodada `2026-10-09T17-55-09.010Z` do APK `33b80b` completou os treze
cenarios: 147 verificacoes passaram, 11 falharam, sem excecoes JS. Nota e
retangulo da rodada reabriram offline. Nove falhas adicionais dependem da
medicao/limpeza de propriedades (o filtro excluiu controles ja presentes
no baseline); duas envolvem Create vault parcialmente visivel numa lista
rolavel com sete vaults. D verifica alcance por rolagem e corrige a medicao
do painel ativo antes de outra rodada. A rodada com falhas fica preservada
e nao representa aceite.

A rodada `2026-10-09T18-03-25.959Z`, no mesmo APK, completou os treze
cenarios com 155 verificacoes aprovadas e quatro falhas de automacao. O
painel ativo confirmou alvos >=44 px, hit-test, rolagem e ultimo controle
alcancavel; range/Bold e Link receberam toque real. Create vault ficou
inteiramente visivel apos swipe nativo, com altura 48 px e centerHit true.
O runner passou a medir cada acao rolavel dentro do scrollport e da safe
area, mantendo evidencias antes/depois. O gatilho Stroke precisa ser
rolado ate a primeira secao antes do toque; D repete a rodada com esse
posicionamento explicito. Nenhuma mudanca no produto ocorreu entre essas
rodadas, e seus relatorios com falhas permanecem preservados.

A ferramenta recusou criar um novo `/goal` por existir um objetivo inacabado
na thread. Isso nao cancelou a execucao autorizada nem concluiu o objetivo
anterior. Distribuicao, implementacao e aceite sao estados distintos.

## Evidencia e limites

- APK original: SHA-256 `c3100b8831d158d73227e903fcc0302e773224a552c337207e945f7a589ee660`.
- Rodada completa: `.tools.local/visual-qa/results/2026-10-09T12-01-03.457Z/`.
- Treze cenarios executados: 71 verificacoes passaram e 13 falharam.
- Nota, retangulo por toque, teclado e reabertura offline funcionaram nos cenarios executados.
- Problemas: titulo comprimido; alvos pequenos; ferramentas/link recortados;
  sobreposicao lateral; status sobre o cabecalho em paisagem; icones nativos
  com contraste incorreto ao trocar tema; instrucoes desktop no canvas mobile.
- Nenhuma mudanca em arquitetura de vault, planos pagos, sincronizacao, ZIP ou iOS.
- Sem bibliotecas novas, alteracoes em `src/components/ui/` ou cores hardcoded.
- As causas abaixo sao hipoteses apoiadas pelo codigo; confirmar durante a implementacao.

## Distribuicao

| Tarefa | Modelo | Effort | Dependencia | Dono dos arquivos |
| --- | --- | --- | --- | --- |
| A — Cabecalho mobile | Luna 6 | medium | Nenhuma | `src/components/features/mobile/mobile-app.tsx`, `src/mobile/mobile.css` |
| B — Canvas por toque | Luna 6 | xhigh | Nenhuma | `src/canvas/EditorDesenho.tsx`, novo CSS exclusivamente mobile se necessario |
| C — Insets e tema Android | Luna 6 | high | Nenhuma; integrar com A depois | `MainActivity.kt`, recursos Android pertinentes, novo helper mobile se necessario |
| D — QA e regressao desktop | Luna 6 | high | A+B+C integrados e APK novo | `scripts/qa-mobile-visual.mjs`, evidencias locais, `docs/qa-mobile-visual.md` |
| E — Revisao de escopo e entrega | Luna 6 | low | D concluida | Revisao sem editar codigo; sumario final |

Executar A, B e C em paralelo: tres agentes mais o coordenador. Reutilizar
os slots para D e depois E. A integracao e o build pertencem ao coordenador.
Nenhum agente deve iniciar emulador, build Android ou build web por conta propria.
Se D encontrar regressao, devolver ao dono correspondente e repetir os cenarios
afetados; nao enfraquecer as verificacoes para obter aprovacao.

### A — Prompt de execucao: cabecalho

Corrija apenas o cabecalho do shell mobile. Hoje titulo, status, Voltar,
Ler/Editar e Salvar disputam uma linha flex com quebra automatica; o titulo
fica reduzido a poucas letras. Organize titulo e acoes em areas previsiveis,
sem esconder salvamento, status ou navegacao. Preserve o titulo identificavel
em 375 e 414 px, inclusive com alteracoes pendentes e teclado aberto. Use os
tokens semanticos existentes, inputs de 16 px e alvos de pelo menos 44 x 44 px.
Nao altere a logica de flush, bloqueios de documento ou persistencia.

Restrinja CSS a `.mobile-app`. Nao edite canvas, tema nativo ou estilos globais.
Informe quais classes foram alteradas e como titulo longo/status longo se
comportam. O coordenador integra eventual helper de C e prop mobile de B no
componente apos sua entrega, evitando edicoes concorrentes.

### B — Prompt de execucao: canvas

Corrija os controles do canvas apenas dentro do shell mobile. Inspecione a
UI responsiva existente do Excalidraw antes de alterar seletores. O callback
`renderTopRightUI` recebe `_isMobile`, atualmente ignorado; verifique sua
relacao com o campo LINK e com a barra cortada ao selecionar uma forma.
O CSS `.mobile-app button, .mobile-app input` tambem alcanca controles internos;
verifique sua contribuicao para dimensoes inconsistentes antes de compensar
com mais regras. Se uma alteracao nessa regra for necessaria, entregue o
ajuste ao coordenador, pois `mobile.css` pertence a A.

Mantenha ferramentas, link, biblioteca, mao, propriedades e acoes acessiveis
por toque. Use a apresentacao mobile existente ou paineis compactos, sem
simplesmente ocultar funcionalidades. Impedir recortes e sobreposicoes tem
prioridade sobre aumentar controles indiscriminadamente. Corrija as dicas de
teclado desktop apenas no contexto mobile, mantendo a descoberta das acoes.
Nao crie uma toolbar completa alternativa sem necessidade demonstrada.

Se precisar de prop de apresentacao, tipar na interface existente, manter
o valor padrao desktop e entregar ao coordenador a chamada a partir de
MobileApp. CSS novo deve ter escopo `.mobile-app`; nao mudar o reskin global
`excalidraw-excalisidian.css` para resolver problemas exclusivamente mobile.
Nao alterar serializacao, autosave, links, exportacao ou cores dos desenhos.

### C — Prompt de execucao: sistema Android

Investigue insets e contraste das barras em Android 15. `MainActivity`
chama `enableEdgeToEdge()` apenas em `onCreate`; o manifest trata `uiMode`
e orientacao sem recriar a Activity. O shell usa `env(safe-area-inset-*)`.
Esses fatos sao pistas para a sobreposicao em paisagem e para o contraste
incorreto durante troca de tema; nao provam sozinhos a causa.

Adote um unico responsavel por consumir cada inset, evitando padding nativo
e CSS duplicados. Corrija atualizacao das barras na rotacao, mudanca de tema
e retorno ao app; considerar o tema efetivo do app, inclusive preferencia
explicita, e nao apenas o tema do sistema. Preserve ajuste ao teclado.
Use APIs e dependencias Android ja disponiveis. Se precisar integrar um
helper ao MobileApp, entregue o helper e o trecho de integracao ao coordenador;
nao edite o arquivo de A. Nao alterar configuracoes globais do Windows.

Os arquivos Android estao sob `src-tauri/gen/android`: verificar se a mudanca
permanece apos o fluxo normal de geracao/build e registrar como reproduzi-la.
Evitar correcoes que desaparecem ao reconstruir o projeto.

### D — Prompt de execucao: validacao

Com A+B+C integrados, execute o runner no novo APK real. Verifique o SHA-256
e use a copia imutavel criada pelo runner. Compare com as capturas originais;
nao aprove baselines automaticamente. Mantenha evidencias de antes/depois.

Reexecutar os treze cenarios; acrescentar verificacoes de sobreposicao real
e de insets/contraste onde forem confiaveis, sem confundir DOM sem overflow
com controles visiveis. Confirmar teclado na captura nativa e conferir a nota
e o desenho da execucao atual apos restart offline. Exercitar tambem menus,
propriedades e campo de link, com uma forma selecionada e outra nao selecionada.
Nao registrar testes como passados se o emulador, CDP ou automacao falharem.

Fazer comparacao visual desktop antes/depois em 1024 e 1440 px, nos mesmos
documentos e temas; verificar tambem desktop estreito para comprovar que o
isolamento depende do shell mobile, nao apenas da largura da janela. Obter
baseline desktop antes da integracao. Executar build web e Android em momentos
separados: nunca disputar `dist`. O coordenador reserva a etapa de build e
entrega o APK para D. Incluir typecheck, testes pertinentes e `git diff --check`.

### E — Prompt de revisao

Revise o diff e as evidencias de D. Confirme ausencia de alteracoes globais
de aparencia desktop, cores hardcoded, bibliotecas novas, primitives editados
e mudancas de persistencia fora do escopo. Confira os sete defeitos, testes
executados e APK correspondente. Reporte bloqueios reais sem declarar pronto
apenas porque compilou. Nao iniciar refatoracoes ou novas funcionalidades.

## Integracao e criterios de aceite

1. Coordenador captura baseline desktop e inicia A+B+C com donos de arquivos
   separados. Incorpora os pequenos pontos de ligacao em MobileApp apos as entregas.
2. Roda checks e produz um unico APK novo, sem build web simultaneo. D valida;
   se houver falhas, o coordenador devolve ao agente responsavel.
3. E revisa; coordenador entrega APK, hash, galeria e resultado dos checks.

Aceite exige titulo identificavel, controles >=44 x 44 px, nenhum controle
recortado ou sobreposto, barras nativas legiveis e separadas do conteudo em
retrato/paisagem, tema atualizado sem restart, teclado e salvamento preservados,
nota/desenho reabertos offline e nenhuma mudanca visual desktop confirmada
pela comparacao. Registrar larguras testadas: mobile 375/414 px e paisagem;
desktop 1024/1440 px e janela estreita. Nenhum breakpoint global sera alterado.

Os testes funcionais ja aprovados sao evidencias existentes. Repeti-los no novo
APK serve para detectar regressao das correcoes; nao apresentá-los como defeitos
originais nem exigir que o usuario enumere novamente os problemas visuais.
