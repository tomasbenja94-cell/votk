# Servicio de Automatización GBA

Bot de automatización web con Selenium para SSO GBA (Gobierno de Buenos Aires).

## Instalación

1. Instalar Python 3.8+
2. Instalar dependencias:
```bash
pip install -r requirements.txt
```

3. Instalar Tesseract OCR:
- Windows: Descargar desde https://github.com/UB-Mannheim/tesseract/wiki
- Linux: `sudo apt-get install tesseract-ocr`
- macOS: `brew install tesseract`

4. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

## Uso

### Iniciar el servidor API:
```bash
python api_server.py
```

### Endpoints disponibles:

#### POST /verificar-login
Verifica el login en SSO GBA

```json
{
  "username": "usuario",
  "password": "contraseña"
}
```

#### POST /verificar-multas
Verifica multas para un DNI

```json
{
  "dni": "12345678",
  "tramite": "tipo_tramite",
  "sexo": "M",
  "username": "usuario" (opcional),
  "password": "contraseña" (opcional)
}
```

## Características

- ✅ Login automático
- ✅ Resolución de CAPTCHAs de texto
- ✅ Limpieza de datos entre intentos
- ✅ Comportamiento humano realista
- ✅ Manejo de errores y reintentos
- ✅ Anti-detección con undetected-chromedriver

