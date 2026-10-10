param([switch]$Iniciar)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$qaRoot = Join-Path $projectRoot '.tools.local/visual-qa'
$sdkRoot = Join-Path $qaRoot 'sdk'
$sourceSdk = Join-Path $projectRoot '.tools.local/android-sdk'
$javaRoot = Get-ChildItem (Join-Path $projectRoot '.tools.local/java') -Directory -Filter 'jdk-21*' | Select-Object -First 1
if (-not $javaRoot) { throw 'JDK 21 local nao encontrado.' }
$env:JAVA_HOME = $javaRoot.FullName
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = Join-Path $qaRoot 'avd'
$env:ANDROID_USER_HOME = Join-Path $qaRoot 'android-user'
$env:ANDROID_ADB_SERVER_PORT = '5047'
$env:ADB_SERVER_SOCKET = 'tcp:127.0.0.1:5047'
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
New-Item -ItemType Directory -Force -Path $sdkRoot,$env:ANDROID_AVD_HOME,$env:ANDROID_USER_HOME | Out-Null
if (-not (Test-Path (Join-Path $sdkRoot 'licenses'))) {
    Copy-Item -LiteralPath (Join-Path $sourceSdk 'licenses') -Destination $sdkRoot -Recurse
}
$sdkManager = Join-Path $sourceSdk 'cmdline-tools/latest/bin/sdkmanager.bat'
$image = 'system-images;android-35;google_apis;x86_64'
$ready = (Test-Path (Join-Path $sdkRoot 'emulator/emulator.exe')) -and
    (Test-Path (Join-Path $sdkRoot 'platform-tools/adb.exe')) -and
    (Test-Path (Join-Path $sdkRoot 'system-images/android-35/google_apis/x86_64/package.xml'))
if (-not $ready) {
    & $sdkManager "--sdk_root=$sdkRoot" 'emulator' 'platform-tools' $image
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao do emulador falhou.' }
}
$avdPath = Join-Path $env:ANDROID_AVD_HOME 'excalisidian-qa-api35.avd'
if (-not (Test-Path -LiteralPath $avdPath)) {
    # avdmanager identifica as imagens pelo SDK que contem o executavel.
    $cliTarget = Join-Path $sdkRoot 'cmdline-tools/latest'
    New-Item -ItemType Directory -Force -Path $cliTarget | Out-Null
    Copy-Item -Path (Join-Path $sourceSdk 'cmdline-tools/latest/*') -Destination $cliTarget -Recurse -Force
    'no' | & (Join-Path $cliTarget 'bin/avdmanager.bat') create avd --name 'excalisidian-qa-api35' --package $image --device 'pixel_5' --path $avdPath
    if ($LASTEXITCODE -ne 0) { throw 'Criacao do AVD falhou.' }
}
$emulator = [System.IO.Path]::GetFullPath((Join-Path $sdkRoot 'emulator/emulator.exe'))
& $emulator -accel-check
if ($LASTEXITCODE -ne 0) { throw 'Aceleracao indisponivel. Nenhuma configuracao global foi alterada.' }
if ($Iniciar) {
    $pidPath = Join-Path $qaRoot 'emulator.pid'
    if (Test-Path -LiteralPath $pidPath) {
        $previousPid = [int](Get-Content -LiteralPath $pidPath)
        $existingProcess = Get-Process -Id $previousPid -ErrorAction SilentlyContinue
        if ($existingProcess -and $existingProcess.Path -eq $emulator) {
            Write-Output "Emulador QA ja ativo, PID $previousPid."
            return
        }
    }
    $logOut = Join-Path $qaRoot 'emulator.stdout.log'
    $logErr = Join-Path $qaRoot 'emulator.stderr.log'
    $process = Start-Process -FilePath $emulator -ArgumentList '-avd','excalisidian-qa-api35','-port','5580','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','host','-feature','-Vulkan','-memory','3072','-cores','4' -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
    $process.Id | Set-Content -LiteralPath $pidPath
    Write-Output "Emulador QA PID $($process.Id), ADB separado na porta 5047."
}
