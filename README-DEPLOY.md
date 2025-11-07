# Guía de Despliegue - Frontend

## Problema: Frontend no funciona

Si el frontend muestra errores como:
```
ENOENT: no such file or directory, open '/root/bot/frontend/build/index.html'
```

Significa que el frontend no está compilado.

## Solución

### 1. Compilar el frontend

```bash
cd /root/bot/frontend
npm install  # Solo si no están instaladas las dependencias
npm run build
```

O usar el script:
```bash
cd /root/bot
chmod +x backend/scripts/build-frontend.sh
./backend/scripts/build-frontend.sh
```

### 2. Verificar que el build existe

```bash
ls -la /root/bot/frontend/build/
```

Deberías ver archivos como `index.html`, `static/`, etc.

### 3. Configurar PM2 para servir el frontend

```bash
# Detener el frontend actual si está corriendo
pm2 stop bot-frontend
pm2 delete bot-frontend

# Iniciar el frontend sirviendo el build
cd /root/bot
pm2 serve frontend/build 3000 --name "bot-frontend" --spa

# Guardar la configuración
pm2 save
```

### 4. Verificar que funciona

```bash
# Ver logs
pm2 logs bot-frontend

# Verificar que está corriendo
pm2 list

# Verificar que el puerto está abierto
netstat -tulpn | grep 3000
```

### 5. Si Nginx está configurado

Asegúrate de que Nginx esté apuntando al puerto 3000:

```nginx
server {
    listen 80;
    server_name 66.97.44.246;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Luego reiniciar Nginx:
```bash
sudo systemctl restart nginx
```

## Actualizar el frontend después de cambios

Si haces cambios en el código del frontend:

```bash
cd /root/bot
git pull origin main
cd frontend
npm run build
pm2 restart bot-frontend
```

## Troubleshooting

### Error: "Cannot find module"
```bash
cd /root/bot/frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Error: "Port 3000 already in use"
```bash
# Ver qué proceso está usando el puerto
lsof -i :3000
# O
netstat -tulpn | grep 3000

# Detener PM2
pm2 stop bot-frontend
pm2 delete bot-frontend

# Reiniciar
pm2 serve frontend/build 3000 --name "bot-frontend" --spa
```

### El frontend se ve mal o no carga estilos
- Verifica que el build se completó correctamente
- Verifica que PM2 está sirviendo desde `frontend/build` y no desde `frontend`
- Verifica los permisos: `chmod -R 755 /root/bot/frontend/build`

