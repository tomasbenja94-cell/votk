# 🚀 Inicio Rápido - Prueba en tu PC

## ✅ Ya tienes Python instalado (3.14.0)

Ahora sigue estos pasos:

## Paso 1: Instalar Dependencias

Abre PowerShell en la carpeta `python-service` y ejecuta:

```powershell
pip install -r requirements.txt
```

Esto puede tardar unos minutos la primera vez.

## Paso 2: Configurar Credenciales

1. **Crear archivo `.env`:**
   ```powershell
   Copy-Item .env.example .env
   ```

2. **Editar `.env`** con el Bloc de notas o cualquier editor:
   ```env
   GBA_USERNAME=tu_usuario_gba_aqui
   GBA_PASSWORD=tu_contraseña_gba_aqui
   PYTHON_SERVICE_PORT=5000
   ```

   ⚠️ **IMPORTANTE**: Estas son las credenciales del sistema para hacer login en SSO GBA.

## Paso 3: (Opcional) Instalar Tesseract OCR

Para resolver CAPTCHAs automáticamente:

1. Descargar desde: https://github.com/UB-Mannheim/tesseract/wiki
2. Instalar
3. Si no está en PATH, agregar en `.env`:
   ```env
   TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
   ```

## Paso 4: Verificar Instalación

Ejecuta el script de prueba:

```powershell
.\test-service.ps1
```

Esto te dirá qué falta configurar.

## Paso 5: Iniciar el Servicio

```powershell
python api_server.py
```

Deberías ver:
```
 * Running on http://0.0.0.0:5000
```

✅ **¡El servicio está corriendo!**

## Paso 6: Probar desde el Bot

1. **Asegúrate de que el backend Node.js esté corriendo** (`npm start`)

2. **Configurar URL del servicio Python:**

   En la raíz del proyecto (donde está `package.json`), crear/editar `.env`:
   ```env
   PYTHON_SERVICE_URL=http://localhost:5000
   ```

3. **En el grupo de admin de Telegram, ejecutar:**
   ```
   /verificarlogin
   ```

   Si funciona, verás:
   ```
   ✅ Login verificado exitosamente
   ```

## Paso 7: Probar Flujo Completo

1. En el bot de Telegram, usar `/start`
2. Seleccionar "💸 PAGAR MULTAS"
3. Ingresar DNI, trámite, sexo
4. **El bot debería verificar automáticamente en GBA**
5. Continuar con patente y monto

## 🆘 Problemas Comunes

### "pip no se reconoce"
```powershell
python -m pip install -r requirements.txt
```

### "Tesseract no encontrado"
- Instalar Tesseract desde el link de arriba
- O comentar la línea de Tesseract en el código (pero no podrá resolver CAPTCHAs)

### "Connection refused"
- Verificar que el servicio Python esté corriendo
- Verificar que `PYTHON_SERVICE_URL=http://localhost:5000` esté en `.env` del backend

### El servicio se cierra
- Verificar errores en la consola
- Verificar que las credenciales GBA estén correctas

## 📝 Notas

- El servicio debe estar corriendo mientras uses el bot
- Puedes dejarlo corriendo en una ventana de PowerShell
- Los logs aparecen en la misma ventana

