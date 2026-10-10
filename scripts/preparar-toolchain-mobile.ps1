param([switch]$AceitarLicencaAndroid)

$ErrorActionPreference = 'Stop'
if (-not $AceitarLicencaAndroid) {
    throw 'O SDK exige aceite da licenca Android. Leia https://developer.android.com/studio#terms e execute com -AceitarLicencaAndroid somente depois de autorizar o aceite.'
}

# Ferramentas locais: nenhuma alteracao persistente no PATH ou no registro do Windows.
$projetoMobile = Split-Path -Parent $PSScriptRoot
$pastaFerramentas = Join-Path $projetoMobile '.tools.local'
$pastaDownloads = Join-Path $pastaFerramentas 'downloads'
$pastaJava = Join-Path $pastaFerramentas 'java'
$pastaSdk = Join-Path $pastaFerramentas 'android-sdk'
New-Item -ItemType Directory -Force -Path $pastaDownloads, $pastaJava, $pastaSdk | Out-Null

function ReceberArquivoVerificado([string]$Endereco, [string]$Destino, [string]$Sha256) {
    if (-not (Test-Path -LiteralPath $Destino)) {
        & curl.exe --fail --location --silent --show-error --output $Destino $Endereco
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar $Endereco" }
    }
    $hashRecebido = (Get-FileHash -LiteralPath $Destino -Algorithm SHA256).Hash
    if ($hashRecebido -ne $Sha256) {
        throw "Checksum incorreto em $Destino. O arquivo nao sera executado nem extraido."
    }
}

$manifestoJava = Join-Path $pastaDownloads 'temurin-21.json'
if (-not (Test-Path -LiteralPath $manifestoJava)) {
    $binariosJava = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $binarioJava = @($binariosJava)[0]
    if (-not $binarioJava.binary.package.link -or -not $binarioJava.binary.package.checksum) {
        throw 'A API oficial do Adoptium nao retornou um JDK verificavel.'
    }
    $binarioJava | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestoJava -Encoding UTF8
}
$binarioJava = Get-Content -LiteralPath $manifestoJava -Raw | ConvertFrom-Json
$arquivoJava = Join-Path $pastaDownloads $binarioJava.binary.package.name
ReceberArquivoVerificado $binarioJava.binary.package.link $arquivoJava $binarioJava.binary.package.checksum
$instalacaoJava = Get-ChildItem -LiteralPath $pastaJava -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1
if (-not $instalacaoJava) {
    Expand-Archive -LiteralPath $arquivoJava -DestinationPath $pastaJava
    $instalacaoJava = Get-ChildItem -LiteralPath $pastaJava -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1
}
if (-not $instalacaoJava) { throw 'JDK extraido sem bin/java.exe.' }

$arquivoSdk = Join-Path $pastaDownloads 'commandlinetools-win-15859902_latest.zip'
ReceberArquivoVerificado 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $arquivoSdk '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
$pastaCmdline = Join-Path $pastaSdk 'cmdline-tools/latest'
$gerenciadorSdk = Join-Path $pastaCmdline 'bin/sdkmanager.bat'
if (-not (Test-Path -LiteralPath $gerenciadorSdk)) {
    $pastaSdkExtraido = Join-Path $pastaFerramentas 'sdk-extraido'
    if (-not (Test-Path -LiteralPath (Join-Path $pastaSdkExtraido 'cmdline-tools/bin/sdkmanager.bat'))) {
        Expand-Archive -LiteralPath $arquivoSdk -DestinationPath $pastaSdkExtraido
    }
    New-Item -ItemType Directory -Force -Path $pastaCmdline | Out-Null
    Copy-Item -Path (Join-Path $pastaSdkExtraido 'cmdline-tools/*') -Destination $pastaCmdline -Recurse -Force
}
if (-not (Test-Path -LiteralPath $gerenciadorSdk)) { throw 'SDK extraido sem sdkmanager.bat.' }

$env:JAVA_HOME = $instalacaoJava.FullName
$env:ANDROID_HOME = $pastaSdk
$env:ANDROID_SDK_ROOT = $pastaSdk
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
1..100 | ForEach-Object { 'y' } | & $gerenciadorSdk "--sdk_root=$pastaSdk" --licenses
if ($LASTEXITCODE -ne 0) { throw 'Falha ao aceitar as licencas explicitamente autorizadas do SDK.' }
& $gerenciadorSdk "--sdk_root=$pastaSdk" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.2.12479018'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar componentes do Android SDK.' }
& rustup target add aarch64-linux-android
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o alvo Rust Android ARM64.' }

Write-Output "Toolchain local preparado em $pastaFerramentas"
Write-Output "JDK: $($binarioJava.release_name); SDK API 36; NDK 27.2.12479018; alvo ARM64."
