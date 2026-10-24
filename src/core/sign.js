import { PDFDocument, degrees } from 'pdf-lib';
import { toPdfPoint, normalizeRotation } from './geometry.js';
import { textMask, tint } from './masks.js';

/**
 * Something placed on a page. Positions and sizes are in PDF points from the top-left of the
 * page as displayed (see geometry.js). Placements are plain data, safe to serialize.
 *
 * @typedef {object} ImagePlacement  A signature (typed, drawn, or from a photo).
 * @property {'image'} type
 * @property {number} page    zero-based page index
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} mask    PNG data URL; its alpha channel is the ink
 * @property {string} color   CSS color for the ink
 *
 * @typedef {object} TextPlacement  A line of text; its size follows from the font size.
 * @property {'text'} type
 * @property {number} page
 * @property {number} x
 * @property {number} y
 * @property {string} text
 * @property {string} font      font family; must be loaded before rendering or signing
 * @property {number} fontSize  in points
 * @property {string} color
 *
 * @typedef {ImagePlacement | TextPlacement} Placement
 */

/** The size of a placement in points, and the mask that draws it. */
export function placementSize(placement) {
  if (placement.type === 'text') {
    const mask = textMask(placement.text, placement.font);
    const height = placement.fontSize * mask.ratio;
    return { width: height * mask.aspect, height, mask: mask.src };
  }
  return { width: placement.width, height: placement.height, mask: placement.mask };
}

/**
 * Draw placements onto a copy of a PDF and return the new file's bytes. The original pages
 * are kept as they are (text stays selectable); each placement is added as an image.
 * Runs in the browser, since text and colors are rendered with a canvas.
 * @param {Uint8Array} bytes
 * @param {Placement[]} placements
 */
export async function signPdf(bytes, placements) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const images = new Map();

  for (const placement of placements) {
    const page = pages[placement.page];
    if (!page) throw new Error(`Placement is on page ${placement.page + 1}, but the PDF has ${pages.length}`);

    const { width, height, mask } = placementSize(placement);
    const png = await tint(mask, placement.color);
    if (!images.has(png)) images.set(png, await doc.embedPng(png));

    const rotation = normalizeRotation(page.getRotation().angle);
    // The placement's bottom-left corner on screen is the image's anchor; rotating with the
    // page makes it appear upright.
    const [x, y] = toPdfPoint({ ...page.getCropBox(), rotation }, placement.x, placement.y + height);
    page.drawImage(images.get(png), { x, y, width, height, rotate: degrees(rotation) });
  }
  return doc.save();
}
