$env:PATH = 'C:\Program Files\nodejs;C:\Users\JUIF\AppData\Roaming\npm;' + $env:PATH
Set-Location "$PSScriptRoot\apps\mobile"
pnpm dev
