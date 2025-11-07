# 🚀 Guía de Deployment

## Pasos para desplegar el bot en un servidor cloud

### 1. Crear servidor cloud
- Elige un proveedor (DigitalOcean, Vultr, Contabo)
- Crea un VPS con **Ubuntu 22.04 LTS**
- Mínimo: 1GB RAM, 1 CPU

### 2. Conectarte al servidor
```bash
ssh root@TU_IP_DEL_SERVIDOR
```

### 3. Ejecutar script de instalación
```bash
# Subir el archivo install.sh al servidor
chmod +x install.sh
./install.sh
```

### 4. Configurar base de datos
```bash
chmod +x setup-database.sh
./setup-database.sh
```

### 5. Subir tu código
```bash
# Opción A: Desde GitHub
git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git bot
cd bot

# Opción B: Subir archivos manualmente con WinSCP/FileZilla
```

### 6. Configurar variables de entorno
```bash
cd backend
nano .env
```

Pega esto (ajusta los valores):
```env
BOT_TOKEN=tu_token_de_telegram
DB_HOST=localhost
DB_PORT=5432
DB_NAME=binopolis
DB_USER=botuser
DB_PASSWORD=tu_password
PORT=3001
NODE_ENV=production
JWT_SECRET=tu_jwt_secret_muy_seguro
```

### 7. Iniciar el bot
```bash
chmod +x start.sh
./start.sh
```

### 8. Configurar auto-inicio
```bash
pm2 startup
# Ejecuta el comando que te muestre
pm2 save
```

## Comandos útiles

```bash
# Ver procesos
pm2 list

# Ver logs
pm2 logs

# Reiniciar
pm2 restart all

# Detener
pm2 stop all
```

## Solución de problemas

### El bot no inicia
```bash
pm2 logs bot-backend
```

### Error de base de datos
```bash
sudo systemctl status postgresql
```

### Ver puertos en uso
```bash
sudo lsof -i :3001
```

