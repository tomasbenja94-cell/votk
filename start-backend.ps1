# Stop existing Node processes on port 3001
Write-Host "Deteniendo procesos Node.js existentes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Start backend
Write-Host "Iniciando backend..." -ForegroundColor Green
cd $PSScriptRoot
node backend/src/index.js
