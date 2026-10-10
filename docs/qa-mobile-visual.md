# QA visual do APK Android

Em 09/10/2026, o usuario informou que instalou o APK e que parece funcionar,
mas relatou que a apresentacao esta quebrada. Esse teste no aparelho e
evidencia funcional fornecida pelo usuario; nao significa aprovacao visual.
Esta rodada acrescenta inspecao visual independente, sem exigir que ele
enumere cada defeito.

Os testes operam o APK instalado no Android Emulator. Nao usam mocks de Tauri,
Vite nem um build web. O APK e copiado para a pasta da execucao antes do teste,
com SHA-256 registrado; builds do checkout principal nao alteram a amostra.

## Preparacao e execucao

Requer Node 24, o JDK local ja existente e as ferramentas Android locais.

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preparar-emulador-qa.ps1 -Iniciar
rtk proxy node scripts/qa-mobile-visual.mjs
```

Se o Node do PATH for antigo, execute o segundo comando com o caminho absoluto
do Node 24. Um argumento opcional permite informar outro APK de teste.

O emulador e a imagem Android 15 ficam em `.tools.local/visual-qa/sdk`;
AVD e dados tambem ficam nessa pasta de QA. O emulador usa porta 5580 e um
servidor ADB separado na porta 5047. Nenhuma configuracao global de Windows,
PATH, app desktop ou fonte da interface e alterada. A instalacao reutiliza
as licencas Android ja aceitas no SDK local.

O primeiro boot pode demorar: ha limite de dez minutos, com erro explicito
se o Android nao ficar pronto. Um timeout de boot nao aprova nem reprova a UI;
significa que os cenarios nao foram executados. Nao iniciar outro emulador
enquanto o processo existente ainda estiver ativo.

## Cobertura

- Criacao real de vault, nota e desenho no armazenamento privado.
- Leitura e edicao com titulo longo em 375 px; fonte dos inputs registrada.
- Teclado Android real, reducao da area visivel e controles do cabecalho.
- Canvas em leitura e edicao, desenho de uma forma e gravacao do arquivo.
- Rotacao para paisagem, largura de 414 px e tema escuro.
- Reinicio do processo com Wi-Fi e dados desligados no emulador, seguido
  de reabertura da nota com acentos e do desenho.
- Overflow, controles proprios e botoes do editor/canvas com alvo minimo
  de 44 x 44 px, botoes recortados mesmo sem overflow do documento,
  cabecalho acessivel e titulo com espaco legivel.
- Intersecoes reais entre controles acionaveis e hit-test no centro dos
  alvos; controles fora da viewport continuam reprovados mesmo quando o
  documento nao possui overflow horizontal.
- Menu em canvas sem selecao e com forma selecionada, controles de
  propriedades da forma e painel de link. Os pontos sao tocados pelo Android;
  o runner registra bounds, hit-test, rolagem e estado de abertura.
- Insets e contraste das barras nativas em captura completa, com `dumpsys
  window`, frames das barras e flags de icones comparados ao tema efetivo.
- Excecoes JavaScript e logcat, sem transformar falhas de teste em sucesso.

Cada execucao cria um vault com nome exclusivo. Nenhum vault e apagado.
Os comandos que alteram configuracao Android recusam aparelhos fisicos;
usam exclusivamente `emulator-5580` no servidor ADB de QA.

## Evidencias e criterio visual

Resultados em `.tools.local/visual-qa/results/<data-hora>/`:

- `index.html`: galeria das capturas Android completas, incluindo barras
  do sistema e teclado.
- `*-webview.png`: imagem do conteudo da WebView para comparar recortes.
- `*.json`: geometria, controles e estado observado de cada tela.
- `*-presentation.json` e `*-window.txt`: frames de insets, flags de icones
  e dump nativo para as capturas claro, paisagem e escuro.
- `canvas-controls-*.json`, `canvas-menu-*.json`,
  `canvas-properties-selected.json`, `canvas-properties-open.json` e
  `canvas-link-selected.json`:
  cobertura adicional dos controles de desenho e respectivos hit-tests.
- `report.json`: verificacoes, falhas, identidade do APK e cobertura.
- `keyboard-dumpsys.txt`, `native-window-*.xml`, `logcat.txt` e arquivo do
  desenho salvo: evidencias nativas de teclado, janela e persistencia.

A galeria deve ser inspecionada visualmente. Geometria aprovada nao comprova
hierarquia, legibilidade, teclado confortavel nem qualidade do canvas.
Capturas do app quebrado nao se tornam baselines aprovadas automaticamente.
Uma execucao parcial ou uma falha de infraestrutura nao equivale a QA aprovado.
O script termina com codigo 1 quando uma verificacao falha.

Os checks adicionais preservam os treze cenarios e as treze capturas
originais. Os inventarios de menus, propriedades e link sao evidencias
complementares dentro dos cenarios 07 e 08; nao substituem nem renomeiam as
capturas existentes. A disponibilidade de `dumpsys` e dos frames de barras
e obrigatoria para classificar insets/contraste; ausencia de evidencias nativas
gera falha, nao aprovacao por ausencia de defeito.

O emulador usa traducao de ARM64 e um ambiente virtual: os tempos
observados nele nao servem como benchmark do aparelho do usuario.

## Defeitos confirmados por inspecao das capturas

Execucao completa em 09/10/2026: **13 cenarios, 71 verificacoes aprovadas
e 13 reprovadas**. As reprovacoes repetem problemas entre cenarios; nao
significam treze defeitos distintos. O processo terminou com codigo 1,
como esperado para uma apresentacao reprovada, sem falha da automacao.

[Galeria desta execucao](../.tools.local/visual-qa/results/2026-10-09T12-01-03.457Z/index.html)
e [relatorio estruturado](../.tools.local/visual-qa/results/2026-10-09T12-01-03.457Z/report.json).
Os artefatos sao locais e ignorados pelo Git. SHA-256 do APK testado:
`c3100b8831d158d73227e903fcc0302e773224a552c337207e945f7a589ee660`.

A nota com acentos e o retangulo criado por toque foram salvos e reabertos
apos reiniciar o processo offline. O arquivo nativo do desenho desta
execucao foi conferido pelo ID do vault, sem aproveitar arquivos de
rodadas anteriores. Nao houve excecoes JavaScript observadas.

Validacoes adicionais: sintaxe do runner Node e do preparador PowerShell
aprovada; `git diff --check` aprovado; 17 testes existentes de vault mobile,
flush e plataforma passaram em tres arquivos Vitest. Nao foi necessario
regerar o APK nem executar um build web.

| Defeito | Evidencia | Consequencia |
| --- | --- | --- |
| Titulo comprimido no cabecalho durante edicao | 04, 05 e 08; titulo aparece como `No...` / `De...` em 375 px | Quase nao se identifica o arquivo aberto |
| Ferramentas pequenas no canvas | 07; varias ferramentas medem 24 x 48 px | Abaixo do minimo solicitado de 44 x 44 px |
| Barra do canvas e campo de link recortados ao selecionar uma forma | 08, 10 e 11; ferramentas saem pela esquerda, campo de link pela direita | Controles ficam inacessiveis apesar de nao haver overflow no documento |
| Barra lateral sobreposta as ferramentas e ao campo de link | 07, 08, 10 e 11 | Area de biblioteca/mao encobre controles |
| Cabecalho invade a barra de status em paisagem | 09, captura Android completa | Hora e indicadores se sobrepoem a Voltar/Salvar |
| Icones nativos escuros sobre fundo escuro ao trocar tema | 11; apos reiniciar em 12 os icones voltam claros | Status e navegacao ficam quase invisiveis na troca em tempo de execucao |
| Instrucoes de teclado desktop no canvas de toque | 08, 09, 10 e 11; `Press Enter`, `Hold Ctrl and Arrow key` | Orientacao pouco util para uso apenas por toque |

Esses defeitos reprovam a apresentacao. A persistencia funcional de uma
nota ou desenho nao compensa essas falhas visuais. O teclado Android foi
inspecionado na captura 05: apareceu de fato, reduziu a area disponivel e
manteve os controles superiores acessiveis no cenario executado.

Nenhum breakpoint, estilo ou componente do aplicativo foi alterado por
esta tarefa. Os testes exercitam 375 px, 414 px e paisagem no APK mobile;
nao representam validacao de tablet/desktop. Esta rodada nao cobre gestos
multitoque nem todas as ferramentas do canvas.

Referencias: [Android Emulator por linha de comando](https://developer.android.com/studio/run/emulator-commandline),
[AVD Manager](https://developer.android.com/tools/avdmanager) e
[suporte a apps ARM nas imagens x86](https://android-developers.googleblog.com/2020/03/run-arm-apps-on-android-emulator.html).

## Rodada parcial apos as correcoes visuais

Em 09/10/2026, o APK SHA-256 `6480ee0d6d63c6feef2955ef703bd3d9594435021bc39c4b282ced2ff647c8bd`
produziu capturas parciais 01 a 09 em
`.tools.local/visual-qa/results/2026-10-09T16-41-02.062Z/`. A automacao foi
interrompida no cenario 09 quando a revisao encontrou erro de indexacao nos
limites da WebView; coordenadas de toque apos o cenario 08 nao sao validas.
Esta rodada nao completou os treze cenarios e nao representa aceite.

A captura nativa [09 em paisagem](../.tools.local/visual-qa/results/2026-10-09T16-41-02.062Z/09-canvas-paisagem-android.png)
foi inspecionada: o cabecalho ocupa uma faixa vertical excessiva e a barra
inferior do canvas cobre parte da dica e dos controles laterais. Essa evidencia
visual identifica os defeitos de paisagem que voltaram para A e B; nao aprova
o cenario nem torna validas as interacoes com coordenadas deslocadas.

O primeiro APK dessa cadeia encontrou o dialogo de ANR `System UI isn't
responding` no AVD e executou 0/13 cenarios. A hierarquia nativa desse bloqueio
esta em `.tools.local/visual-qa/results/2026-10-09T16-32-40.190Z/`.
Os parsers corrigidos foram validados localmente com a hierarquia WebView e
uma fixture `dumpsys window -a`; o resultado e
`.tools.local/visual-qa/verify-qa-parsers.mjs`. Os casos de regressao puros
estao em `scripts/qa-mobile-visual-parsers.test.mjs` e cobrem bounds reais,
ANR sem WebView, flags da Activity focada e controles de inset associados a
essa janela. A rodada integral sera repetida apos o novo APK de A e B.
