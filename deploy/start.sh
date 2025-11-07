#!/bin/bash

echo "🚀 Iniciando bot..."

# Ir a la carpeta del proyecto
cd "$(dirname "$0")/.."

# Verificar que existe .env
if [ ! -f "backend/.env" ]; then
    echo "❌ Error: No se encontró backend/.env"
    echo "📝 Crea el archivo .env con las variables necesarias"
    exit 1
fi

# Instalar dependencias si no existen
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Instalando dependencias del backend..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Instalando dependencias del frontend..."
    cd frontend
    npm install
    cd ..
fi

# Iniciar backend con PM2
echo "🔄 Iniciando backend..."
cd backend
pm2 start src/index.js --name "bot-backend" || pm2 restart bot-backend
cd ..

# Iniciar frontend con PM2
echo "🔄 Iniciando frontend..."
cd frontend
pm2 start npm --name "bot-frontend" -- start || pm2 restart bot-frontend
cd ..

# Guardar configuración PM2
pm2 save

echo "✅ Bot iniciado!"
echo ""
echo "📊 Ver estado: pm2 list"
echo "📋 Ver logs: pm2 logs"
echo "🔄 Reiniciar: pm2 restart all"

