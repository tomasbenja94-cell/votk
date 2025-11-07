#!/bin/bash

echo "🚀 Instalando dependencias del sistema..."

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18.x
echo "📦 Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
echo "🗄️ Instalando PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Instalar Git
echo "📥 Instalando Git..."
sudo apt install git -y

# Instalar PM2
echo "⚙️ Instalando PM2..."
sudo npm install -g pm2

echo "✅ Instalación completada!"
echo ""
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "PM2 version: $(pm2 --version)"
echo ""
echo "📝 Próximos pasos:"
echo "1. Configura la base de datos: sudo -u postgres psql"
echo "2. Crea el archivo .env en backend/"
echo "3. Ejecuta: npm install en backend/ y frontend/"
echo "4. Inicia con PM2: pm2 start src/index.js --name bot-backend"

