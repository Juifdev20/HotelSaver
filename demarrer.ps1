param(
    [switch]$Reset  # passe -Reset pour vider le cache Metro (apres ajout d'un paquet natif)
)

$env:PATH = 'C:\Program Files\nodejs;C:\Users\JUIF\AppData\Roaming\npm;C:\Users\JUIF\AppData\Local\Android\Sdk\platform-tools;C:\Program Files\Java\jdk-21.0.12\bin;' + $env:PATH
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12'
$env:ANDROID_HOME = 'C:\Users\JUIF\AppData\Local\Android\Sdk'

# Liberer le port 3000 si une ancienne API tourne encore
$ancien = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($ancien) {
    Write-Host "Port 3000 occupe, arret de l'ancienne API..." -ForegroundColor Yellow
    $ancien | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

Write-Host "Tunnel USB (adb reverse)..." -ForegroundColor Yellow
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:3000 tcp:3000 | Out-Null

$pathVar = 'C:\Program Files\nodejs;C:\Users\JUIF\AppData\Roaming\npm;'
$root = $PSScriptRoot
$metroCmd = if ($Reset) { "pnpm dev:reset" } else { "pnpm dev" }

Write-Host "Demarrage API (SWC)..." -ForegroundColor Cyan
Start-Process powershell -WindowStyle Hidden -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `$env:PATH='$pathVar'+`$env:PATH; Set-Location '$root\apps\api'; pnpm start:dev"

Write-Host "Demarrage Metro (mobile)..." -ForegroundColor Cyan
Start-Process powershell -WindowStyle Hidden -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `$env:PATH='$pathVar'+`$env:PATH; Set-Location '$root\apps\mobile'; $metroCmd"

Write-Host "Demarrage Desktop..." -ForegroundColor Cyan
Start-Process powershell -WindowStyle Hidden -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `$env:PATH='$pathVar'+`$env:PATH; Set-Location '$root\apps\desktop'; pnpm dev"

Write-Host "Tout est lance !" -ForegroundColor Green
Write-Host "  - API     : http://localhost:3000" -ForegroundColor White
Write-Host "  - Desktop : fenetre Electron" -ForegroundColor White
Write-Host "  - Mobile  : ouvre l'application sur ton telephone" -ForegroundColor White
if ($Reset) { Write-Host "  (cache Metro efface)" -ForegroundColor Yellow }
