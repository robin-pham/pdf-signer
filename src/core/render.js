import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { canvasToBlob, newCanvas } from './canvas.js';

let documentOptions = {};

/**
 * Tell pdf.js where its files are. `workerSrc` is required unless the worker module has been
 * imported on the page. The asset folders are optional but needed for some PDFs: `wasmUrl`
 * for scanned (JBIG2/JPEG 2000) images, `standardFontDataUrl` for unembedded fonts,
 * `cMapUrl` for CJK text and `iccUrl` for color profiles.
 */
export function configurePdfjs({ workerSrc, ...options } = {}) {
  if (workerSrc) GlobalWorkerOptions.workerSrc = workerSrc;
  documentOptions = options;
}

/** Open PDF bytes with pdf.js. The bytes are copied because pdf.js takes ownership of its input. */
export function loadPdf(bytes) {
  return getDocument({ ...documentOptions, data: bytes.slice() }).promise;
}

/** Render a pdf.js page into `canvas` at `scale` CSS pixels per point and `pixelRatio` device pixels per CSS pixel. */
export async function renderPage(page, canvas, scale, pixelRatio = 1) {
  const viewport = page.getViewport({ scale: scale * pixelRatio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
}

/** Rasterize every page of a PDF to a PNG `width` pixels wide. */
export async function renderToPngs(bytes, { width = 2400 } = {}) {
  const pdf = await loadPdf(bytes);
  try {
    const blobs = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const canvas = newCanvas(1, 1);
      await renderPage(page, canvas, width / page.getViewport({ scale: 1 }).width);
      blobs.push(await canvasToBlob(canvas, 'image/png'));
    }
    return blobs;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
