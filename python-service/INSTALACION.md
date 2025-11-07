# Instalación del Servicio de Automatización GBA

## Requisitos Previos

1. **Python 3.8 o superior**
   - Verificar: `python --version` o `python3 --version`

2. **Tesseract OCR** (para resolver CAPTCHAs)
   - **Windows**: Descargar desde https://github.com/UB-Mannheim/tesseract/wiki
   - **Linux**: `sudo apt-get install tesseract-ocr`
   - **macOS**: `brew install tesseract`

3. **Google Chrome** (instalado en el sistema)

## Instalación

1. **Navegar a la carpeta del servicio:**
   ```bash
   cd python-service
   ```

2. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

   O si usas Python 3:
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Configurar variables de entorno:**
   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env
   
   # Linux/macOS
   cp .env.example .env
   ```

4. **Editar `.env` con tus credenciales:**
   ```env
   GBA_USERNAME=tu_usuario_gba
   GBA_PASSWORD=tu_contraseña_gba
   PYTHON_SERVICE_PORT=5000
   ```

## Configuración de Tesseract (Opcional)

Si Tesseract está instalado en una ruta personalizada, descomentar en `.env`:
```env
TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe
```

## Iniciar el Servicio

### Windows:
```bash
start.bat
```

### Linux/macOS:
```bash
chmod +x start.sh
./start.sh
```

### Manualmente:
```bash
python api_server.py
```

El servicio estará disponible en `http://localhost:5000`

## Verificar que Funciona

1. El servicio debería mostrar:
   ```
   * Running on http://0.0.0.0:5000
   ```

2. Probar el endpoint de salud:
   ```bash
   curl http://localhost:5000/health
   ```

3. Desde el bot de Telegram, usar el comando `/verificarlogin` en el grupo de admin

## Solución de Problemas

### Error: "ChromeDriver not found"
- El servicio usa `undetected-chromedriver` que descarga ChromeDriver automáticamente
- Asegúrate de tener Chrome instalado

### Error: "Tesseract not found"
- Verifica que Tesseract esté instalado: `tesseract --version`
- Si está en una ruta personalizada, configura `TESSERACT_CMD` en `.env`

### Error: "CAPTCHA no se resuelve"
- Los CAPTCHAs de texto deformado pueden ser difíciles
- El servicio intentará resolverlo automáticamente
- Si falla, puede requerir reintento manual

### Error: "Connection refused" desde Node.js
- Verifica que el servicio Python esté corriendo
- Verifica el puerto en `PYTHON_SERVICE_PORT` (default: 5000)
- Configura `PYTHON_SERVICE_URL` en el `.env` del backend si es necesario

## Notas Importantes

- El servicio mantiene sesiones de Chrome abiertas para mejor rendimiento
- Los CAPTCHAs se resuelven automáticamente usando OCR
- El servicio limpia datos entre intentos para evitar detección
- Usa `undetected-chromedriver` para evitar detección de automatización

