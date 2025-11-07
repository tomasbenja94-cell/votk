"""
Bot de automatización web con Selenium para SSO GBA
Maneja login automático, CAPTCHAs y navegación
"""

import os
import time
import random
import logging
import undetected_chromedriver as uc
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import base64
import io
from PIL import Image
import pytesseract
import cv2
import numpy as np

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GBAAutomation:
    def __init__(self, username=None, password=None, headless=False):
        """
        Inicializa el bot de automatización
        
        Args:
            username: Usuario para login (opcional, se puede configurar en .env)
            password: Contraseña para login (opcional, se puede configurar en .env)
            headless: Si es True, ejecuta Chrome en modo headless
        """
        self.username = username or os.getenv('GBA_USERNAME', '')
        self.password = password or os.getenv('GBA_PASSWORD', '')
        self.headless = headless
        self.driver = None
        self.wait = None
        
    def create_driver(self):
        """Crea un driver de Chrome con configuración anti-detección"""
        try:
            options = uc.ChromeOptions()
            
            # Configuración anti-detección
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-gpu')
            options.add_argument('--window-size=1920,1080')
            options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            
            if self.headless:
                options.add_argument('--headless=new')
            
            # Usar undetected-chromedriver para evitar detección
            self.driver = uc.Chrome(options=options, version_main=None)
            
            # Ejecutar script para ocultar webdriver
            self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': '''
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    })
                '''
            })
            
            self.wait = WebDriverWait(self.driver, 20)
            logger.info("✅ Driver creado exitosamente")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error al crear driver: {e}")
            return False
    
    def human_like_delay(self, min_seconds=0.5, max_seconds=2.0):
        """Simula retrasos humanos aleatorios"""
        delay = random.uniform(min_seconds, max_seconds)
        time.sleep(delay)
    
    def human_like_type(self, element, text):
        """Escribe texto de forma humana, carácter por carácter"""
        element.clear()
        for char in text:
            element.send_keys(char)
            self.human_like_delay(0.05, 0.15)
    
    def clean_browser_data(self):
        """Limpia todos los datos del navegador entre intentos"""
        try:
            if self.driver:
                self.driver.delete_all_cookies()
                self.driver.execute_script("window.localStorage.clear();")
                self.driver.execute_script("window.sessionStorage.clear();")
                logger.info("✅ Datos del navegador limpiados")
        except Exception as e:
            logger.warning(f"⚠️ Error al limpiar datos: {e}")
    
    def solve_text_captcha(self, captcha_element):
        """
        Resuelve CAPTCHA de texto usando OCR
        
        Args:
            captcha_element: Elemento Selenium que contiene el CAPTCHA
            
        Returns:
            str: Texto del CAPTCHA resuelto o None si falla
        """
        try:
            # Obtener screenshot del CAPTCHA
            captcha_screenshot = captcha_element.screenshot_as_png
            captcha_image = Image.open(io.BytesIO(captcha_screenshot))
            
            # Convertir a numpy array para procesamiento
            img_array = np.array(captcha_image)
            
            # Preprocesamiento de imagen para mejorar OCR
            # Convertir a escala de grises
            if len(img_array.shape) == 3:
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            else:
                gray = img_array
            
            # Aplicar threshold para mejor contraste
            _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
            
            # Aplicar operaciones morfológicas para limpiar ruido
            kernel = np.ones((2, 2), np.uint8)
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            
            # Convertir de vuelta a PIL Image para tesseract
            cleaned_image = Image.fromarray(cleaned)
            
            # Configurar tesseract para solo letras y números
            custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            
            # Intentar OCR
            captcha_text = pytesseract.image_to_string(cleaned_image, config=custom_config).strip()
            
            # Limpiar el texto (remover espacios y caracteres especiales)
            captcha_text = ''.join(c for c in captcha_text if c.isalnum())
            
            logger.info(f"📝 CAPTCHA detectado: {captcha_text}")
            
            if len(captcha_text) >= 3:  # Los CAPTCHAs suelen tener al menos 3 caracteres
                return captcha_text
            else:
                logger.warning("⚠️ CAPTCHA muy corto o inválido")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error al resolver CAPTCHA: {e}")
            return None
    
    def login(self):
        """
        Realiza el login en SSO GBA
        
        Returns:
            dict: {'success': bool, 'message': str, 'requires_captcha': bool}
        """
        try:
            if not self.driver:
                if not self.create_driver():
                    return {'success': False, 'message': 'Error al crear driver', 'requires_captcha': False}
            
            # Limpiar datos antes de intentar login
            self.clean_browser_data()
            
            # Navegar a la página de login
            logger.info("🌐 Navegando a SSO GBA...")
            self.driver.get("https://sso.gba.gob.ar/web/login/W3B1")
            self.human_like_delay(2, 3)
            
            # Buscar campos de usuario y contraseña
            try:
                username_field = self.wait.until(
                    EC.presence_of_element_located((By.ID, "username"))
                )
                password_field = self.driver.find_element(By.ID, "password")
                
                logger.info("✅ Campos de login encontrados")
                
            except TimeoutException:
                logger.error("❌ No se encontraron los campos de login")
                return {'success': False, 'message': 'Campos de login no encontrados', 'requires_captcha': False}
            
            # Verificar si hay CAPTCHA
            captcha_present = False
            captcha_input = None
            
            try:
                # Buscar campo de CAPTCHA (puede tener diferentes IDs/names)
                captcha_input = self.driver.find_element(By.NAME, "captcha")
                captcha_present = True
                logger.info("🔐 CAPTCHA detectado")
            except NoSuchElementException:
                try:
                    captcha_input = self.driver.find_element(By.ID, "captcha")
                    captcha_present = True
                    logger.info("🔐 CAPTCHA detectado")
                except NoSuchElementException:
                    logger.info("✅ No hay CAPTCHA en esta sesión")
            
            # Ingresar usuario
            self.human_like_type(username_field, self.username)
            self.human_like_delay(0.5, 1.0)
            
            # Ingresar contraseña
            self.human_like_type(password_field, self.password)
            self.human_like_delay(0.5, 1.0)
            
            # Si hay CAPTCHA, resolverlo
            if captcha_present and captcha_input:
                try:
                    # Buscar imagen del CAPTCHA
                    captcha_image = self.driver.find_element(By.CSS_SELECTOR, "img[src*='captcha'], img[alt*='captcha'], .captcha img")
                    
                    # Resolver CAPTCHA
                    captcha_text = self.solve_text_captcha(captcha_image)
                    
                    if captcha_text:
                        self.human_like_type(captcha_input, captcha_text)
                        logger.info(f"✅ CAPTCHA ingresado: {captcha_text}")
                    else:
                        logger.warning("⚠️ No se pudo resolver el CAPTCHA")
                        return {'success': False, 'message': 'No se pudo resolver el CAPTCHA', 'requires_captcha': True}
                        
                except NoSuchElementException:
                    logger.warning("⚠️ Campo de CAPTCHA encontrado pero no la imagen")
                    return {'success': False, 'message': 'CAPTCHA presente pero imagen no encontrada', 'requires_captcha': True}
            
            # Buscar y hacer clic en el botón de login
            try:
                login_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit'], .btn-login, button:contains('Ingresar')")
                self.human_like_delay(0.5, 1.0)
                login_button.click()
                logger.info("✅ Botón de login clickeado")
            except NoSuchElementException:
                # Intentar con Enter
                password_field.send_keys(Keys.RETURN)
                logger.info("✅ Enter presionado en campo de contraseña")
            
            # Esperar a que se complete el login
            self.human_like_delay(3, 5)
            
            # Verificar si el login fue exitoso
            # Buscar elementos que indiquen que estamos logueados
            try:
                # Intentar navegar al elemento objetivo
                target_element = self.wait.until(
                    EC.presence_of_element_located((By.XPATH, '//*[@id="ssocol3"]/div/div[1]/div[3]'))
                )
                logger.info("✅ Login exitoso - Elemento objetivo encontrado")
                return {'success': True, 'message': 'Login exitoso', 'requires_captcha': captcha_present}
                
            except TimeoutException:
                # Verificar si hay mensaje de error
                try:
                    error_message = self.driver.find_element(By.CSS_SELECTOR, ".error, .alert-danger, .alert-error")
                    error_text = error_message.text
                    logger.error(f"❌ Error en login: {error_text}")
                    
                    # Si el error menciona CAPTCHA, puede necesitar reintento
                    if 'captcha' in error_text.lower() or 'código' in error_text.lower():
                        return {'success': False, 'message': f'Error: {error_text}', 'requires_captcha': True}
                    else:
                        return {'success': False, 'message': f'Error: {error_text}', 'requires_captcha': False}
                        
                except NoSuchElementException:
                    logger.warning("⚠️ No se pudo determinar el estado del login")
                    return {'success': False, 'message': 'Estado del login incierto', 'requires_captcha': False}
                    
        except Exception as e:
            logger.error(f"❌ Error en login: {e}")
            return {'success': False, 'message': str(e), 'requires_captcha': False}
    
    def verificar_multas(self, dni, tramite, sexo):
        """
        Verifica multas después de hacer login
        
        Args:
            dni: DNI del usuario
            tramite: Tipo de trámite
            sexo: Sexo (M o F)
            
        Returns:
            dict: {'success': bool, 'message': str, 'data': dict}
        """
        try:
            # Primero hacer login
            login_result = self.login()
            if not login_result['success']:
                return login_result
            
            # Navegar al elemento objetivo (ya estamos logueados)
            target_element = self.wait.until(
                EC.presence_of_element_located((By.XPATH, '//*[@id="ssocol3"]/div/div[1]/div[3]'))
            )
            
            # Hacer clic en el elemento
            self.human_like_delay(1, 2)
            target_element.click()
            logger.info("✅ Click en elemento objetivo")
            
            # Esperar a que cargue la página de multas
            self.human_like_delay(2, 3)
            
            # Buscar formulario de consulta de multas
            # Campo DNI
            dni_field = self.wait.until(
                EC.presence_of_element_located((By.NAME, "dni"))
            )
            self.human_like_type(dni_field, dni)
            self.human_like_delay(0.5, 1.0)
            
            # Campo trámite
            tramite_field = self.driver.find_element(By.NAME, "tramite")
            self.human_like_type(tramite_field, tramite)
            self.human_like_delay(0.5, 1.0)
            
            # Campo sexo - botones según el XPath proporcionado
            if sexo.upper() == 'M':
                sexo_button = self.driver.find_element(By.XPATH, '//*[@id="app"]/div/div/div/div/div/div[2]/div/div[1]/form/div[3]/div/button[2]')
            else:  # F
                sexo_button = self.driver.find_element(By.XPATH, '//*[@id="app"]/div/div/div/div/div/div[2]/div/div[1]/form/div[3]/div/button[1]')
            
            self.human_like_delay(0.5, 1.0)
            sexo_button.click()
            logger.info(f"✅ Sexo seleccionado: {sexo}")
            
            # Buscar y hacer clic en botón de consultar/buscar
            try:
                consultar_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], .btn-search, button:contains('Consultar'), button:contains('Buscar')")
                self.human_like_delay(0.5, 1.0)
                consultar_button.click()
            except NoSuchElementException:
                # Intentar con Enter
                sexo_button.send_keys(Keys.RETURN)
            
            # Esperar resultado
            self.human_like_delay(3, 5)
            
            # Verificar si hay resultados o errores
            try:
                # Buscar mensaje de éxito o resultados
                resultado = self.driver.find_element(By.CSS_SELECTOR, ".resultado, .multas, .success, .alert-success")
                resultado_text = resultado.text
                
                logger.info(f"✅ Resultado encontrado: {resultado_text[:100]}")
                
                return {
                    'success': True,
                    'message': 'Consulta exitosa',
                    'data': {
                        'resultado': resultado_text,
                        'dni': dni,
                        'tramite': tramite,
                        'sexo': sexo
                    }
                }
                
            except NoSuchElementException:
                # Buscar mensaje de error
                try:
                    error = self.driver.find_element(By.CSS_SELECTOR, ".error, .alert-danger, .no-results")
                    error_text = error.text
                    logger.warning(f"⚠️ Error o sin resultados: {error_text}")
                    
                    return {
                        'success': False,
                        'message': error_text,
                        'data': None
                    }
                except NoSuchElementException:
                    # Si no hay mensaje claro, asumir éxito pero con datos no claros
                    page_source_snippet = self.driver.page_source[:500]
                    logger.info(f"📄 Estado de página: {page_source_snippet}")
                    
                    return {
                        'success': True,
                        'message': 'Consulta procesada (verificar resultado)',
                        'data': {
                            'dni': dni,
                            'tramite': tramite,
                            'sexo': sexo,
                            'page_loaded': True
                        }
                    }
                    
        except Exception as e:
            logger.error(f"❌ Error al verificar multas: {e}")
            return {'success': False, 'message': str(e), 'data': None}
    
    def close(self):
        """Cierra el driver y limpia recursos"""
        try:
            if self.driver:
                self.driver.quit()
                logger.info("✅ Driver cerrado")
        except Exception as e:
            logger.error(f"❌ Error al cerrar driver: {e}")
    
    def __enter__(self):
        """Context manager entry"""
        self.create_driver()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


if __name__ == "__main__":
    # Ejemplo de uso
    automation = GBAAutomation()
    try:
        result = automation.login()
        print(f"Resultado: {result}")
    finally:
        automation.close()

