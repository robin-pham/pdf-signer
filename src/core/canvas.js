export function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), type, quality);
  });
}

/**
 * Decode an image file onto a canvas, honoring the photo's EXIF rotation and
 * shrinking it so its longest side is at most `maxSize` pixels.
 */
export async function imageToCanvas(blob, maxSize) {
  const bitmap = await createImageBitmap(blob);
  const k = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = newCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
