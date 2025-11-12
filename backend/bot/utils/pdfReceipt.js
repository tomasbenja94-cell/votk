const PDFDocument = require('pdfkit');

function sanitizeForPDF(value, fallback = 'N/A') {
  if (value === null || value === undefined) return fallback;
  const cleaned = value
    .toString()
    .replace(/[^\w\sÁÉÍÓÚáéíóúÑñ0-9\.\,\-\/\$#:]/g, '')
    .trim();
  return cleaned || fallback;
}

function generatePaymentReceiptPDF({ transactionId, headerName, serviceName, codeLabel, codeValue, amountFormatted }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cleanHeader = sanitizeForPDF(headerName).toUpperCase();
      const cleanServiceName = sanitizeForPDF(serviceName, 'N/A');
      const cleanCodeLabel = sanitizeForPDF(codeLabel, 'Referencia');
      const cleanCodeValue = sanitizeForPDF(codeValue, 'N/A');
      const cleanAmount = sanitizeForPDF(amountFormatted, 'N/A');

      doc.fontSize(14).text(`Transacción #: ${transactionId}`, { align: 'left' });
      doc.moveDown();

      const borderLine = '==============================';
      doc.fontSize(18).text(borderLine, { align: 'center' });
      doc.fontSize(16).text(`PAGO - ${cleanHeader}`, { align: 'center' });
      doc.fontSize(18).text(borderLine, { align: 'center' });
      doc.moveDown();

      doc.fontSize(14).text(`Servicio: ${cleanServiceName}`);
      doc.text(`${cleanCodeLabel}: ${cleanCodeValue}`);
      doc.text(`Monto ARS: ${cleanAmount}`);
      doc.moveDown();
      doc.fontSize(14).text('COMPROBANTE DE PAGO.', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generatePaymentReceiptPDF
};

