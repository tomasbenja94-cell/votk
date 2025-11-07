#!/bin/bash

echo "🗄️ Configurando base de datos..."

read -p "Ingresa el nombre de la base de datos (default: binopolis): " DB_NAME
DB_NAME=${DB_NAME:-binopolis}

read -p "Ingresa el usuario de la base de datos (default: botuser): " DB_USER
DB_USER=${DB_USER:-botuser}

read -sp "Ingresa la contraseña para el usuario: " DB_PASSWORD
echo ""

# Crear base de datos y usuario
sudo -u postgres psql <<EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\q
EOF

echo "✅ Base de datos '$DB_NAME' y usuario '$DB_USER' creados exitosamente!"
echo ""
echo "📝 Asegúrate de agregar estas credenciales a tu archivo .env:"
echo "DB_NAME=$DB_NAME"
echo "DB_USER=$DB_USER"
echo "DB_PASSWORD=$DB_PASSWORD"

