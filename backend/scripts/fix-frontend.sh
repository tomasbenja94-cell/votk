#!/bin/bash

# Script completo para arreglar el frontend
echo "🔧 Arreglando frontend..."

# Ir al directorio del proyecto
cd /root/bot

# Verificar que existe el directorio frontend
if [ ! -d "frontend" ]; then
    echo "❌ No se encuentra el directorio frontend"
    exit 1
fi

# Ir al directorio del frontend
cd frontend

# Verificar que existe package.json
if [ ! -f "package.json" ]; then
    echo "❌ No se encuentra package.json en frontend/"
    exit 1
fi

echo "📦 Verificando dependencias..."

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error al instalar dependencias"
        exit 1
    fi
else
    echo "✅ Dependencias ya instaladas"
fi

# Verificar que react-scripts está instalado
if [ ! -d "node_modules/react-scripts" ]; then
    echo "📦 Instalando react-scripts..."
    npm install react-scripts --save-dev
fi

# Verificar que el script build existe en package.json
if ! grep -q '"build"' package.json; then
    echo "❌ El script 'build' no existe en package.json"
    echo "📝 Agregando script build..."
    # Esto no debería ser necesario, pero por si acaso
    exit 1
fi

echo "🏗️  Compilando frontend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Frontend compilado exitosamente"
    echo "📁 Build creado en: /root/bot/frontend/build"
    
    # Verificar que el build existe
    if [ -f "build/index.html" ]; then
        echo "✅ index.html encontrado en build/"
    else
        echo "⚠️  Advertencia: index.html no encontrado en build/"
    fi
else
    echo "❌ Error al compilar el frontend"
    echo "💡 Revisa los errores arriba"
    exit 1
fi

echo ""
echo "🎉 Frontend arreglado exitosamente!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Detener el frontend actual: pm2 stop bot-frontend"
echo "2. Eliminar el proceso: pm2 delete bot-frontend"
echo "3. Iniciar el frontend: pm2 serve /root/bot/frontend/build 3000 --name bot-frontend --spa"
echo "4. Guardar: pm2 save"

