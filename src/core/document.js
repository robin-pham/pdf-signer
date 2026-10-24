import { PDFDocument } from 'pdf-lib';
import { canvasToBlob, imageToCanvas, newCanvas } from './canvas.js';

const US_LETTER_WIDTH = 612;

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');

/**
 * Normalize what someone wants to sign into PDF bytes. PDFs pass through; images (a photo or
 * screenshot of a form) are wrapped in a one-page PDF so the rest works the same way.
 * @param {File | Blob | ArrayBuffer | Uint8Array} input
 * @param {string} [name]  used for the saved file name; defaults to the file's name
 * @returns {Promise<{ bytes: Uint8Array, name: string }>}
 */
export async function toPdfBytes(input, name) {
  const baseName = (name ?? input.name ?? 'document').replace(/\.[^.]+$/, '');
  if (input instanceof Uint8Array) return { bytes: input, name: baseName };
  if (input instanceof ArrayBuffer) return { bytes: new Uint8Array(input), name: baseName };
  const bytes = isPdf(input) ? new Uint8Array(await input.arrayBuffer()) : await imageToPdf(input);
  return { bytes, name: baseName };
}

/**
 * Put an image on a single page, US Letter width, keeping its aspect ratio.
 * Very large photos are scaled to at most `maxPixels` on their longest side.
 */
export async function imageToPdf(image, { pageWidth = US_LETTER_WIDTH, maxPixels = 3000 } = {}) {
  const photo = await imageToCanvas(image, maxPixels);
  // Flatten onto white so transparent screenshots don't turn black as JPEG.
  const canvas = newCanvas(photo.width, photo.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0);
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92);

  const doc = await PDFDocument.create();
  const embedded = await doc.embedJpg(await jpeg.arrayBuffer());
  const height = (pageWidth * canvas.height) / canvas.width;
  doc.addPage([pageWidth, height]).drawImage(embedded, { x: 0, y: 0, width: pageWidth, height });
  return doc.save();
}
