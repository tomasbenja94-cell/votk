const Jimp = require('jimp');

/**
 * Genera una imagen de comprobante con el texto de éxito y el nombre de la empresa
 * @param {Object} options - Opciones para generar la imagen
 * @param {string} options.empresa - Nombre de la empresa/servicio
 * @returns {Promise<Buffer>} - Buffer de la imagen generada
 */
async function generateReceiptImage({ empresa }) {
  try {
    // Dimensiones de la imagen
    const width = 800;
    const height = 400;
    const backgroundColor = 0xFFFFFFFF; // Blanco
    const primaryColor = 0x00C853FF; // Verde (color de éxito)

    // Crear imagen base
    const image = new Jimp(width, height, backgroundColor);

    // Cargar fuentes
    const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

    // Dibujar borde superior verde
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < 10; y++) {
        image.setPixelColor(primaryColor, x, y);
      }
    }

    // Texto principal: "✅ La operación se ha realizado con éxito"
    const successText = '✅ La operación se ha realizado con éxito';
    const successTextY = 100;
    
    // Calcular posición centrada para el texto principal
    const successTextWidth = Jimp.measureText(fontLarge, successText);
    const successTextX = Math.max(0, (width - successTextWidth) / 2);
    
    image.print(fontLarge, successTextX, successTextY, successText);

    // Texto de empresa
    const empresaText = empresa || 'Servicio';
    const empresaLabel = 'Empresa:';
    const empresaLabelY = 220;
    const empresaValueY = 260;
    
    // Calcular posiciones centradas para empresa
    const empresaLabelWidth = Jimp.measureText(fontMedium, empresaLabel);
    const empresaLabelX = Math.max(0, (width - empresaLabelWidth) / 2);
    
    const empresaValueWidth = Jimp.measureText(fontMedium, empresaText);
    const empresaValueX = Math.max(0, (width - empresaValueWidth) / 2);
    
    image.print(fontMedium, empresaLabelX, empresaLabelY, empresaLabel);
    image.print(fontMedium, empresaValueX, empresaValueY, empresaText);

    // Dibujar borde inferior verde
    for (let x = 0; x < width; x++) {
      for (let y = height - 10; y < height; y++) {
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

