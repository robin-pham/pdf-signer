// The headless part of pdf-signer: everything needed to sign a PDF without the editor UI.

export { toPdfBytes, imageToPdf, isPdf } from './document.js';
export { configurePdfjs, loadPdf, renderPage, renderToPngs } from './render.js';
export { signPdf, placementSize } from './sign.js';
export { textMask, strokesMask, photoMask, suggestCutoff, tint } from './masks.js';
export { drawSegment, drawStrokeEnd, drawStrokes } from './strokes.js';
export { DEFAULT_FONTS, loadFont, fontCss } from './fonts.js';
export { toPdfPoint, displaySize } from './geometry.js';
export { localStore } from './storage.js';
