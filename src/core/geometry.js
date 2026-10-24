// Placements are measured in PDF points from the top-left corner of the page *as displayed*
// (after its /Rotate is applied), with y pointing down — the way people look at a page.
// These helpers convert that to PDF user space, where y points up from the page's own origin.

/** @typedef {{ x: number, y: number, width: number, height: number, rotation: number }} PageBox */

export const normalizeRotation = (degrees) => ((degrees % 360) + 360) % 360;

/** Size of a page as displayed, in points. */
export function displaySize({ width, height, rotation }) {
  return normalizeRotation(rotation) % 180 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * Convert a point on the displayed page to PDF user space.
 * @param {PageBox} box  the page's crop box and rotation
 * @returns {[number, number]}
 */
export function toPdfPoint(box, x, y) {
  const { x: left, y: bottom, width, height } = box;
  switch (normalizeRotation(box.rotation)) {
    case 90: return [left + y, bottom + x];
    case 180: return [left + width - x, bottom + y];
    case 270: return [left + width - y, bottom + height - x];
    default: return [left + x, bottom + height - y];
  }
}
