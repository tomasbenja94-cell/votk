"""
API Flask para exponer el servicio de automatización GBA
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from gba_automation import GBAAutomation
import logging
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Endpoint de salud"""
    return jsonify({'status': 'ok', 'service': 'gba-automation'})

@app.route('/verificar-login', methods=['POST'])
def verificar_login():
    """
    Verifica el login en SSO GBA
    
    Body:
        {
            "username": "usuario",
            "password": "contraseña"
        }
    """
    try:
        data = request.get_json()
        username = data.get('username') or os.getenv('GBA_USERNAME')
        password = data.get('password') or os.getenv('GBA_PASSWORD')
        
        if not username or not password:
            return jsonify({
                'success': False,
                'message': 'Usuario y contraseña requeridos'
            }), 400
        
        automation = GBAAutomation(username=username, password=password)
        
        try:
            result = automation.login()
            return jsonify(result)
        finally:
            automation.close()
            
    except Exception as e:
        logger.error(f"Error en verificar-login: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/verificar-multas', methods=['POST'])
def verificar_multas():
    """
    Verifica multas para un DNI, trámite y sexo
    
    Body:
        {
            "dni": "12345678",
            "tramite": "tipo_tramite",
            "sexo": "M" o "F",
            "username": "usuario" (opcional),
            "password": "contraseña" (opcional)
        }
    """
    try:
        data = request.get_json()
        dni = data.get('dni')
        tramite = data.get('tramite')
        sexo = data.get('sexo')
        username = data.get('username') or os.getenv('GBA_USERNAME')
        password = data.get('password') or os.getenv('GBA_PASSWORD')
        
        if not dni or not tramite or not sexo:
            return jsonify({
                'success': False,
                'message': 'DNI, trámite y sexo son requeridos'
            }), 400
        
        if sexo.upper() not in ['M', 'F']:
            return jsonify({
                'success': False,
                'message': 'Sexo debe ser M o F'
            }), 400
        
        automation = GBAAutomation(username=username, password=password)
        
        try:
            result = automation.verificar_multas(dni, tramite, sexo)
            return jsonify(result)
        finally:
            automation.close()
            
    except Exception as e:
        logger.error(f"Error en verificar-multas: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PYTHON_SERVICE_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

