# Teste do protótipo Android

Este APK valida o marco técnico do plano aprovado. Use um vault com dados de
teste. O primeiro lançamento completo ainda depende das fases seguintes,
incluindo importação/exportação ZIP e recuperação durável de rascunhos.

## APK entregue em 03/10/2026

Arquivo: `.tools.local/entrega/excalisidian-android-viabilidade.apk`.
Tamanho: 171.545.177 bytes (aproximadamente 164 MiB).
SHA-256: `c3100b8831d158d73227e903fcc0302e773224a552c337207e945f7a589ee660`.

Assinatura debug v2 verificada; ABI única `arm64-v8a`; Android mínimo 7
(API 24), target API 36. O bundle seleciona Android e a biblioteca dentro do
APK tem o mesmo hash da biblioteca Rust compilada. O pacote foi refeito sem
resíduos de empacotamento incremental. A validação no aparelho ainda está
pendente.

## Roteiro no aparelho

1. Instale o APK, abra o app e crie um vault privado.
2. Crie uma nota, toque em **Editar** e escreva um texto com acentos, múltiplas
   linhas e seleção de palavras. Confira se o teclado deixa o cursor acessível.
3. Toque em **Salvar agora**, volte à lista e reabra a nota.
4. Crie um desenho, toque em **Editar**, desenhe algumas formas e adicione
   texto. Teste seleção, arraste, zoom com dois dedos e teclado do canvas.
5. Salve, volte e reabra o desenho. Confira se formas e texto permaneceram.
6. Ative o modo avião, feche o app e abra novamente. Escolha o mesmo vault e
   confirme que a nota e o desenho continuam disponíveis.
7. Faça uma edição, alterne para outro aplicativo e retorne; confira o
   conteúdo após reabrir. Relate qualquer perda, travamento ou aviso.

Informe o modelo do aparelho, a versão do Android e quais passos passaram.
A checagem no navegador não comprova teclado virtual, gestos ou persistência
Android. O avanço além do marco de viabilidade depende desse resultado.

## Reproduzir o build nesta máquina

Os scripts configuram variáveis somente no processo atual:

```powershell
./scripts/android.ps1 -Action check
./scripts/android.ps1 -Action init
./scripts/android.ps1 -Action apk
```

O padrão gera APK debug assinado para ARM64. O projeto gerado usa SDK 36 e
Android mínimo API 24. JDK e SDK/NDK estão em `.tools.local`; o Rust usa o
toolchain existente com o alvo `aarch64-linux-android` instalado.

Execute o build Android sem outro `npm run build` em paralelo neste checkout:
ambos escrevem em `dist`, e um build web pode substituir a interface mobile
durante o empacotamento nativo.

O script `preparar-toolchain-mobile.ps1 -AceitarLicencaAndroid` reproduz a
preparação autorizada do SDK. O parâmetro registra o aceite explícito necessário
para executar a instalação e aceitar as licenças da Google.
