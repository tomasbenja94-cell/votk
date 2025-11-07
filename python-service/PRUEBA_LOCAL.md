# 🧪 Cómo Probar el Servicio Python en tu PC (Windows)

## Paso 1: Verificar/Instalar Python

1. **Abrir PowerShell o CMD** (como Administrador)

2. **Verificar si Python está instalado:**
   ```powershell
   python --version
   ```
   
   Si dice algo como `Python 3.8.x` o superior, ¡ya está! ✅
   
   Si dice "no se reconoce", instalar desde: https://www.python.org/downloads/
   - ⚠️ **IMPORTANTE**: Al instalar, marcar la opción "Add Python to PATH"

## Paso 2: Instalar Google Chrome

- Si no tienes Chrome instalado, descargarlo desde: https://www.google.com/chrome/
- El servicio lo necesita para automatizar el navegador

## Paso 3: Instalar Tesseract OCR (para CAPTCHAs)

1. **Descargar Tesseract:**
   - Ir a: https://github.com/UB-Mannheim/tesseract/wiki
   - Descargar el instalador de Windows (ejemplo: `tesseract-ocr-w64-setup-5.x.x.exe`)

2. **Instalar:**
   - Ejecutar el instalador
   - Durante la instalación, **copiar la ruta de instalación** (ejemplo: `C:\Program Files\Tesseract-OCR`)
   - ⚠️ **IMPORTANTE**: Marcar la opción "Add to PATH" si está disponible

3. **Verificar instalación:**
   ```powershell
   tesseract --version
   ```
   
   Si muestra la versión, está bien ✅

## Paso 4: Navegar a la Carpeta del Servicio

```powershell
cd C:\Users\kiosc\OneDrive\Desktop\BOT\python-service
```

## Paso 5: Instalar Dependencias de Python

```powershell
pip install -r requirements.txt
```

Si tienes problemas, intentar:
```powershell
python -m pip install -r requirements.txt
```

Esto instalará:
- selenium
- undetected-chromedriver
- flask
- pytesseract
- opencv-python
- etc.

## Paso 6: Configurar Credenciales

1. **Crear archivo `.env`:**

   En PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```

   O crearlo manualmente con el Bloc de notas.

2. **Editar `.env`** y agregar tus credenciales GBA:

   ```env
   GBA_USERNAME=tu_usuario_gba
   GBA_PASSWORD=tu_contraseña_gba
   PYTHON_SERVICE_PORT=5000
   ```

   ⚠️ **IMPORTANTE**: Estas son las credenciales del sistema para hacer login en SSO GBA, NO son los datos del cliente.

## Paso 7: Configurar Tesseract (si está en ruta personalizada)

Si Tesseract NO está en el PATH, editar `.env` y agregar:

```env
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

(Ajustar la ruta según donde lo instalaste)

## Paso 8: Iniciar el Servicio

```powershell
python api_server.py
```

Deberías ver algo como:
```
 * Running on http://0.0.0.0:5000
```

✅ **¡El servicio está corriendo!**

## Paso 9: Probar que Funciona

### Opción A: Probar desde PowerShell (misma ventana)

Abrir otra ventana de PowerShell y ejecutar:

```powershell
# Probar salud del servicio
curl http://localhost:5000/health
```

Debería responder:
```json
{"status":"ok","service":"gba-automation"}
```

### Opción B: Probar desde el Bot de Telegram

1. **Asegurarte de que el backend Node.js esté corriendo**

2. **Configurar la URL del servicio Python en el backend:**

   Crear/editar `.env` en la raíz del proyecto (donde está `package.json`):
   ```env
   PYTHON_SERVICE_URL=http://localhost:5000
   ```

3. **En el grupo de admin de Telegram, ejecutar:**
   ```
   /verificarlogin
   ```

   Debería responder:
   ```
   ✅ Login verificado exitosamente
   Usuario: tu_usuario_gba
   Estado: Conectado
   CAPTCHA requerido: No
   ```

## Paso 10: Probar el Flujo Completo de Multas

1. **Iniciar el servicio Python** (si no está corriendo)
2. **Iniciar el backend Node.js** (`npm start`)
3. **En el bot de Telegram:**
   - Usar `/start`
   - Seleccionar "💸 PAGAR MULTAS"
   - Ingresar DNI
   - Ingresar trámite
   - Ingresar sexo (M o F)
   - **El bot debería verificar automáticamente en GBA**
   - Si es exitoso, continuar con patente y monto

## Solución de Problemas

### Error: "Python no se reconoce"
- Reinstalar Python marcando "Add to PATH"
- O usar: `py -m pip install -r requirements.txt`

### Error: "Tesseract no encontrado"
- Verificar que Tesseract esté instalado
- Agregar `TESSERACT_CMD` en `.env` con la ruta completa
- O agregar Tesseract al PATH del sistema

### Error: "ChromeDriver not found"
- El servicio usa `undetected-chromedriver` que lo descarga automáticamente
- Asegurarse de tener Chrome instalado
- Verificar conexión a internet

### Error: "Connection refused" desde el bot
- Verificar que el servicio Python esté corriendo en el puerto 5000
- Verificar que `PYTHON_SERVICE_URL=http://localhost:5000` esté en el `.env` del backend
- Verificar firewall (debe permitir conexiones en localhost:5000)

### El servicio se cierra inmediatamente
- Verificar errores en la consola
- Verificar que todas las dependencias estén instaladas
- Verificar que las credenciales GBA estén correctas en `.env`

## Mantener el Servicio Corriendo

Para mantener el servicio corriendo en segundo plano:

1. **Opción 1: PowerShell en segundo plano**
   - Ejecutar: `Start-Process python -ArgumentList "api_server.py" -WindowStyle Hidden`

2. **Opción 2: Usar un servicio de Windows**
   - Usar herramientas como NSSM (Non-Sucking Service Manager)

3. **Opción 3: Mantener la ventana abierta**
   - Simplemente dejar la ventana de PowerShell abierta

## Ver Logs

Los logs aparecen en la misma ventana donde ejecutaste `python api_server.py`.

Si ves errores, revisar:
- Credenciales GBA incorrectas
- Tesseract no configurado
- Chrome no instalado
- Problemas de conexión a internet

