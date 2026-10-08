$env:PATH = 'C:\Program Files\nodejs;C:\Users\JUIF\AppData\Roaming\npm;C:\Users\JUIF\AppData\Local\Android\Sdk\platform-tools;C:\Program Files\Java\jdk-21.0.12\bin;' + $env:PATH
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12'
$env:ANDROID_HOME = 'C:\Users\JUIF\AppData\Local\Android\Sdk'
$root = $PSScriptRoot

# Tuer tous les processus node en cours
Write-Host "Arret de tous les processus node..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Tunnel USB
Write-Host "Tunnel USB (adb reverse)..." -ForegroundColor Yellow
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:3000 tcp:3000
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:8081 tcp:8081

# Relancer API en arriere-plan
Write-Host "Demarrage API..." -ForegroundColor Cyan
$pathVar = 'C:\Program Files\nodejs;C:\Users\JUIF\AppData\Roaming\npm;'
Start-Process powershell -WindowStyle Hidden -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `$env:PATH='$pathVar'+`$env:PATH; Set-Location '$root\apps\api'; pnpm start:dev"
Start-Sleep -Seconds 1

# Relancer Metro ICI dans ce terminal (visible, interactif)
Write-Host "Demarrage Metro (visible ici)..." -ForegroundColor Cyan
Write-Host "  Appuie sur 'r' pour recharger l'app sur le telephone" -ForegroundColor Green
Write-Host "  Appuie sur 'a' pour ouvrir sur emulateur Android" -ForegroundColor Green
Set-Location "$root\apps\mobile"
pnpm dev:reset
