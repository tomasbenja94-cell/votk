const fs = require('fs');
const path = require('path');

/**
 * Obtiene la imagen estática de comprobante de pago exitoso
 * @returns {Promise<Buffer>} - Buffer de la imagen estática
 */
async function getReceiptImage() {
  try {
    // Ruta a la imagen estática
    const imagePath = path.join(__dirname, '../../assets/receipt-success.png');
    
    // Verificar si la imagen existe
    if (fs.existsSync(imagePath)) {
      // Leer la imagen estática
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer;
    } else {
      // Si no existe, crear una imagen simple de fallback
      console.warn(`⚠️ Imagen estática no encontrada en ${imagePath}. Usando fallback.`);
      const Jimp = require('jimp');
      const fallbackImage = new Jimp(800, 400, 0xFFFFFFFF);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const text = '✅ Pago Exitoso!\nLA OPERACIÓN FUE PROCESADA';
      fallbackImage.print(font, 50, 150, text);
      return await fallbackImage.getBufferAsync(Jimp.MIME_PNG);
    }
  } catch (error) {
    console.error('Error loading receipt image:', error);
    throw new Error('No se pudo cargar la imagen del comprobante');
  }
}

module.exports = {
  getReceiptImage
};

