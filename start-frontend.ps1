# Script para iniciar el frontend correctamente
Write-Host "🔄 Iniciando frontend..." -ForegroundColor Cyan

# Verificar que estamos en el directorio correcto
if (!(Test-Path "frontend")) {
    Write-Host "❌ No se encuentra el directorio frontend" -ForegroundColor Red
    Write-Host "💡 Ejecuta este script desde la raíz del proyecto" -ForegroundColor Yellow
    exit 1
}

# Verificar que las dependencias estén instaladas
if (!(Test-Path "frontend\node_modules")) {
    Write-Host "⚠️  Dependencias no instaladas. Instalando..." -ForegroundColor Yellow
    cd frontend
    npm install
    cd ..
}

# Verificar que el backend esté corriendo
Write-Host "Verificando backend..." -ForegroundColor Cyan
$backendRunning = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
if (!$backendRunning) {
    Write-Host "⚠️  El backend no está corriendo en el puerto 3001" -ForegroundColor Yellow
    Write-Host "💡 Inicia el backend primero con: npm start" -ForegroundColor Yellow
    Write-Host "   Continuando de todos modos..." -ForegroundColor Yellow
}

# Verificar que el puerto 3000 esté libre
Write-Host "Verificando puerto 3000..." -ForegroundColor Cyan
$portInUse = netstat -ano | findstr :3000
if ($portInUse) {
    Write-Host "⚠️  El puerto 3000 está en uso" -ForegroundColor Yellow
    Write-Host "💡 Deteniendo procesos anteriores..." -ForegroundColor Yellow
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        $processId = $_.Id
        $portCheck = netstat -ano | findstr ":3000" | findstr $processId
        return $portCheck
    } | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Iniciar frontend
Write-Host "🚀 Iniciando frontend..." -ForegroundColor Cyan
cd frontend
npm start
