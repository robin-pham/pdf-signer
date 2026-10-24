// A mask is a PNG data URL whose alpha channel is the ink. Signatures and text are kept as
// masks so their color can change at any time; `tint` produces the colored image.
//
// Each builder returns `{ src, aspect }` (aspect = width / height), or null if there is no ink.

import { newCanvas, loadImage } from './canvas.js';
import { drawStrokes, strokesBounds } from './strokes.js';
import { fontCss } from './fonts.js';

/** Color a mask. Returns a PNG data URL. */
export async function tint(mask, color) {
  const img = await loadImage(mask);
  const canvas = newCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

const textCache = new Map();

/**
 * Render a line of text, cropped to its ink. The font must already be loaded (see `loadFont`).
 * `ratio` is the mask's height relative to the font size, so a placement at font size `s`
 * is `s * ratio` tall.
 * @returns {{ src: string, aspect: number, ratio: number }}
 */
export function textMask(text, family, size = 120) {
  const font = `${size}px ${fontCss(family)}`;
  const key = `${font}\n${text}`;
  if (textCache.has(key)) return textCache.get(key);

  const measure = newCanvas(1, 1).getContext('2d');
  measure.font = font;
  const m = measure.measureText(text);
  const pad = Math.ceil(size * 0.12);
  const left = Math.max(0, m.actualBoundingBoxLeft);
  const width = left + Math.max(m.width, m.actualBoundingBoxRight);
  const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const canvas = newCanvas(Math.ceil(width) + pad * 2, Math.ceil(height) + pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillText(text, pad + left, pad + m.actualBoundingBoxAscent);

  const mask = { src: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height, ratio: canvas.height / size };
  // Don't remember a rendering made with a fallback font while the real one is still loading.
  if (document.fonts.check(font, text)) textCache.set(key, mask);
  return mask;
}

/** Render hand-drawn strokes at `resolution`× their drawn size, cropped to the ink. */
export function strokesMask(strokes, { resolution = 3, margin = 4 } = {}) {
  const bounds = strokesBounds(strokes);
  if (!bounds) return null;
  const left = bounds.left - margin;
  const top = bounds.top - margin;
  const canvas = newCanvas(
    Math.ceil((bounds.right + margin - left) * resolution),
    Math.ceil((bounds.bottom + margin - top) * resolution),
  );
  const ctx = canvas.getContext('2d');
  ctx.translate(-left * resolution, -top * resolution);
  drawStrokes(ctx, strokes, { scale: resolution });
  return { src: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
}

const luminance = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * A starting cutoff for `photoMask`. Paper is most of a signature photo, so aim a little
 * below its typical brightness.
 */
export function suggestCutoff(imageData) {
  const samples = [];
  for (let i = 0; i < imageData.data.length; i += 4 * 16) samples.push(luminance(imageData.data, i));
  samples.sort((a, b) => a - b);
  return Math.round(Math.min(250, Math.max(60, samples[Math.floor(samples.length * 0.6)] - 45)));
}

/**
 * Lift ink off a photo of paper. Pixels brighter than `cutoff` (0–255) become transparent,
 * those darker than `cutoff - softness` become solid ink, and the band between fades,
 * which keeps pen edges soft. The result is cropped to the ink.
 */
export function photoMask(imageData, cutoff, { softness = 50, margin = 6 } = {}) {
  const { width, height, data } = imageData;
  const solid = cutoff - softness;
  const out = new ImageData(width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = luminance(data, i);
      const alpha = l <= solid ? 255 : l >= cutoff ? 0 : Math.round((255 * (cutoff - l)) / softness);
      out.data[i + 3] = alpha;
      if (alpha > 40) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;

  minX = Math.max(0, minX - margin); minY = Math.max(0, minY - margin);
  maxX = Math.min(width - 1, maxX + margin); maxY = Math.min(height - 1, maxY + margin);
  const canvas = newCanvas(maxX - minX + 1, maxY - minY + 1);
  canvas.getContext('2d').putImageData(out, -minX, -minY);
  return { src: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
}
