const Jimp = require('jimp');

/**
 * Genera una imagen de comprobante con el texto de éxito y el nombre de la empresa
 * @param {Object} options - Opciones para generar la imagen
 * @param {string} options.empresa - Nombre de la empresa/servicio
 * @returns {Promise<Buffer>} - Buffer de la imagen generada
 */
async function generateReceiptImage({ empresa }) {
  try {
    // Dimensiones de la imagen - más grande y profesional
    const width = 1200;
    const height = 600;
    const backgroundColor = 0xFFFFFFFF; // Blanco
    const primaryColor = 0x00C853FF; // Verde (color de éxito)
    const darkGray = 0x212121FF; // Gris oscuro para texto
    const lightGray = 0xF5F5F5FF; // Gris claro para fondo de sección

    // Crear imagen base
    const image = new Jimp(width, height, backgroundColor);

    // Cargar fuentes
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_24_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Dibujar borde superior verde más grueso
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < 15; y++) {
        image.setPixelColor(primaryColor, x, y);
      }
    }

    // Fondo gris claro para la sección principal
    for (let x = 0; x < width; x++) {
      for (let y = 15; y < 200; y++) {
        image.setPixelColor(lightGray, x, y);
      }
    }

    // Texto principal: "✅ La operación se ha realizado con éxito"
    const successText = '✅ La operación se ha realizado con éxito';
    const successTextY = 80;
    
    // Calcular posición centrada para el texto principal
    const successTextWidth = Jimp.measureText(fontTitle, successText);
    const successTextX = Math.max(0, (width - successTextWidth) / 2);
    
    image.print(fontTitle, successTextX, successTextY, successText);

    // Línea separadora
    for (let x = 100; x < width - 100; x++) {
      for (let y = 220; y < 225; y++) {
        image.setPixelColor(primaryColor, x, y);
      }
    }

    // Sección de información de empresa
    const empresaText = empresa || 'Servicio';
    const empresaLabel = 'Empresa:';
    const empresaLabelY = 280;
    const empresaValueY = 320;
    
    // Calcular posiciones centradas
    const empresaLabelWidth = Jimp.measureText(fontSubtitle, empresaLabel);
    const empresaLabelX = Math.max(0, (width - empresaLabelWidth) / 2);
    
    const empresaValueWidth = Jimp.measureText(fontSubtitle, empresaText);
    const empresaValueX = Math.max(0, (width - empresaValueWidth) / 2);
    
    // Dibujar fondo para la sección de empresa
    for (let x = width / 4; x < (width * 3) / 4; x++) {
      for (let y = 250; y < 380; y++) {
        if (x === width / 4 || x === (width * 3) / 4 - 1 || y === 250 || y === 379) {
          image.setPixelColor(primaryColor, x, y);
        } else {
          image.setPixelColor(lightGray, x, y);
        }
      }
    }
    
    image.print(fontSubtitle, empresaLabelX, empresaLabelY, empresaLabel);
    image.print(fontSubtitle, empresaValueX, empresaValueY, empresaText);

    // Logo o marca de agua en la parte inferior
    const footerText = 'Binopolis Pay';
    const footerY = height - 80;
    const footerWidth = Jimp.measureText(fontMedium, footerText);
    const footerX = Math.max(0, (width - footerWidth) / 2);
    
    image.print(fontMedium, footerX, footerY, footerText);

    // Dibujar borde inferior verde
    for (let x = 0; x < width; x++) {
      for (let y = height - 15; y < height; y++) {
        image.setPixelColor(primaryColor, x, y);
      }
    }

    // Convertir a buffer
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    return buffer;
  } catch (error) {
    console.error('Error generating receipt image:', error);
    // Si falla, crear una imagen simple con texto básico
    try {
      const simpleImage = new Jimp(800, 400, 0xFFFFFFFF);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      const text = `✅ La operación se ha realizado con éxito\n\nEmpresa: ${empresa || 'Servicio'}`;
      simpleImage.print(font, 50, 150, text);
      return await simpleImage.getBufferAsync(Jimp.MIME_PNG);
    } catch (fallbackError) {
      console.error('Error in fallback image generation:', fallbackError);
      throw new Error('No se pudo generar la imagen del comprobante');
    }
  }
}

module.exports = {
  generateReceiptImage
};

