#!/bin/bash

# Script para compilar el frontend
echo "🔨 Compilando frontend..."

cd /root/bot/frontend

# Verificar que las dependencias estén instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Compilar el frontend
echo "🏗️  Ejecutando build..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Frontend compilado exitosamente en /root/bot/frontend/build"
else
    echo "❌ Error al compilar el frontend"
    exit 1
fi

