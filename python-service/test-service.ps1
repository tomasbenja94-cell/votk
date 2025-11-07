# Script de prueba rápida del servicio Python
Write-Host "=== PRUEBA DEL SERVICIO PYTHON GBA ===" -ForegroundColor Cyan
Write-Host ""

# Verificar Python
Write-Host "1. Verificando Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Python encontrado: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Python no encontrado. Instala Python desde python.org" -ForegroundColor Red
    exit 1
}

# Verificar si las dependencias están instaladas
Write-Host ""
Write-Host "2. Verificando dependencias..." -ForegroundColor Yellow
$testImport = python -c "import selenium; import flask; import pytesseract; print('OK')" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Dependencias faltantes. Ejecuta: pip install -r requirements.txt" -ForegroundColor Yellow
}

# Verificar archivo .env
Write-Host ""
Write-Host "3. Verificando configuración..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ Archivo .env encontrado" -ForegroundColor Green
    $envContent = Get-Content .env
    $hasUsername = $envContent | Select-String -Pattern "GBA_USERNAME" -Quiet
    $hasPassword = $envContent | Select-String -Pattern "GBA_PASSWORD" -Quiet
    if ($hasUsername -and $hasPassword) {
        Write-Host "   ✅ Credenciales GBA configuradas" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Credenciales GBA no configuradas en .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Archivo .env no encontrado. Crea uno desde .env.example" -ForegroundColor Yellow
}

# Verificar Tesseract (opcional)
Write-Host ""
Write-Host "4. Verificando Tesseract OCR..." -ForegroundColor Yellow
$tesseractVersion = tesseract --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Tesseract encontrado" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Tesseract no encontrado. Instala desde: https://github.com/UB-Mannheim/tesseract/wiki" -ForegroundColor Yellow
    Write-Host "      (Opcional, pero necesario para resolver CAPTCHAs)" -ForegroundColor Gray
}

# Verificar Chrome
Write-Host ""
Write-Host "5. Verificando Google Chrome..." -ForegroundColor Yellow
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)
$chromeFound = $false
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        Write-Host "   ✅ Chrome encontrado: $path" -ForegroundColor Green
        $chromeFound = $true
        break
    }
}
if (-not $chromeFound) {
    Write-Host "   ⚠️  Chrome no encontrado. Instala desde: https://www.google.com/chrome/" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar el servicio, ejecuta:" -ForegroundColor White
Write-Host "  python api_server.py" -ForegroundColor Yellow
Write-Host ""
Write-Host "O simplemente:" -ForegroundColor White
Write-Host "  .\start.bat" -ForegroundColor Yellow
Write-Host ""

