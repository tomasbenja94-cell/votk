# Script de verificación de Docker para Windows
Write-Host "🔍 Verificando Docker..." -ForegroundColor Cyan

# Verificar Docker
$dockerPath = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerPath) {
    Write-Host "✅ Docker encontrado: $($dockerPath.Source)" -ForegroundColor Green
    docker --version
} else {
    Write-Host "❌ Docker no encontrado en el PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Soluciones:" -ForegroundColor Yellow
    Write-Host "   1. Instala Docker Desktop completo desde: https://www.docker.com/products/docker-desktop/"
    Write-Host "   2. Reinicia tu computadora después de la instalación"
    Write-Host "   3. Abre una nueva terminal PowerShell"
    Write-Host "   4. Verifica que Docker Desktop esté corriendo (ícono en la bandeja del sistema)"
    exit 1
}

# Verificar Docker Compose
$dockerComposePath = Get-Command docker-compose -ErrorAction SilentlyContinue
if ($dockerComposePath) {
    Write-Host "✅ Docker Compose encontrado: $($dockerComposePath.Source)" -ForegroundColor Green
    docker-compose --version
} else {
    Write-Host "⚠️  Docker Compose no encontrado (puede estar integrado en Docker)" -ForegroundColor Yellow
    docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker Compose está integrado en Docker CLI" -ForegroundColor Green
    }
}

# Verificar si Docker Desktop está corriendo
Write-Host ""
Write-Host "🔍 Verificando si Docker Desktop está corriendo..." -ForegroundColor Cyan
try {
    docker ps 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker Desktop está corriendo" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Contenedores activos:" -ForegroundColor Cyan
        docker ps
    } else {
        Write-Host "❌ Docker Desktop no está corriendo" -ForegroundColor Red
        Write-Host "💡 Inicia Docker Desktop desde el menú de inicio" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ No se puede conectar a Docker" -ForegroundColor Red
    Write-Host "💡 Asegúrate de que Docker Desktop esté corriendo" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Verificación completada" -ForegroundColor Green

