param(
    [ValidateSet('check', 'init', 'dev', 'apk')]
    [string]$Action = 'check',
    [switch]$Release,
    [ValidateSet('aarch64', 'armv7', 'i686', 'x86_64')]
    [string]$Target = 'aarch64'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localTools = Join-Path $projectRoot '.tools.local'

function Find-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
        return $env:JAVA_HOME
    }

    $javaRoot = Join-Path $localTools 'java'
    if (Test-Path -LiteralPath $javaRoot) {
        $install = Get-ChildItem -LiteralPath $javaRoot -Directory |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } |
            Select-Object -First 1
        if ($install) { return $install.FullName }
    }

    throw 'JDK nao encontrado. Defina JAVA_HOME ou prepare .tools.local/java.'
}

function Find-AndroidHome {
    foreach ($candidate in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $localTools 'android-sdk'))) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'platform-tools/adb.exe'))) {
            return $candidate
        }
    }

    throw 'Android SDK nao encontrado. Defina ANDROID_HOME/ANDROID_SDK_ROOT ou prepare .tools.local/android-sdk.'
}

function Find-NdkHome([string]$sdkHome) {
    if ($env:NDK_HOME -and (Test-Path -LiteralPath (Join-Path $env:NDK_HOME 'toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'))) {
        return $env:NDK_HOME
    }

    $ndkRoot = Join-Path $sdkHome 'ndk'
    if (Test-Path -LiteralPath $ndkRoot) {
        $install = Get-ChildItem -LiteralPath $ndkRoot -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } |
            Select-Object -Last 1
        if ($install -and (Test-Path -LiteralPath (Join-Path $install.FullName 'toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'))) {
            return $install.FullName
        }
    }

    throw 'Android NDK nao encontrado. Defina NDK_HOME ou instale um NDK side-by-side no SDK.'
}

function Find-Node24 {
    $candidates = @()
    if ($env:EXCALISIDIAN_NODE24) { $candidates += $env:EXCALISIDIAN_NODE24 }
    if ($env:LOCALAPPDATA) {
        $nvmRoot = Join-Path $env:LOCALAPPDATA 'Author Software/nvm/installs'
        if (Test-Path -LiteralPath $nvmRoot) {
            $candidates += Get-ChildItem -LiteralPath $nvmRoot -Directory -Filter 'v24*' |
                ForEach-Object { Join-Path $_.FullName 'node.exe' }
        }
    }

    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        $nodeVersion = & $candidate -p 'process.versions.node'
        $major = $nodeVersion.Trim().Split('.')[0]
        if ($LASTEXITCODE -eq 0 -and $major -eq '24') { return $candidate }
    }

    throw 'Node.js 24 nao encontrado. Defina EXCALISIDIAN_NODE24 ou instale-o pelo gerenciador local.'
}

$javaHome = Find-JavaHome
$androidHome = Find-AndroidHome
$ndkHome = Find-NdkHome $androidHome
$nodeExe = Find-Node24
$npmCli = Join-Path (Split-Path -Parent $nodeExe) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) {
    throw "npm CLI nao encontrado ao lado do Node 24: $npmCli"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:NDK_HOME = $ndkHome
$env:Path = @(
    (Split-Path -Parent $nodeExe),
    (Join-Path $javaHome 'bin'),
    (Join-Path $androidHome 'platform-tools'),
    (Join-Path $androidHome 'cmdline-tools/latest/bin'),
    $env:Path
) -join ';'

Write-Output "Node: $(& $nodeExe -v)"
Write-Output "Java: $javaHome"
Write-Output "SDK: $androidHome"
Write-Output "NDK: $ndkHome"

if ($Action -eq 'check') { return }

if ($Action -eq 'init' -and (Test-Path -LiteralPath (Join-Path $projectRoot 'src-tauri/gen/android'))) {
    Write-Output 'Projeto Android ja inicializado em src-tauri/gen/android.'
    return
}

$tauriArgs = @('run', 'tauri', '--', 'android', $Action)
if ($Action -eq 'apk') {
    $tauriArgs = @('run', 'tauri', '--', 'android', 'build', '--apk', '--target', $Target)
    if (-not $Release) { $tauriArgs += '--debug' }
    else { Write-Output 'Build release selecionado; requer configurar assinatura Android antes de distribuir.' }
}

Push-Location $projectRoot
try {
    & $nodeExe $npmCli @tauriArgs
    if ($LASTEXITCODE -ne 0) { throw "Comando Tauri Android falhou com codigo $LASTEXITCODE." }
}
finally {
    Pop-Location
}
