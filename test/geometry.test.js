// Checks toPdfPoint against pdf.js's own page viewport on real PDFs, across every
// rotation and with a crop box that doesn't start at the origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { toPdfPoint, displaySize } from '../src/core/geometry.js';

const CROP = { x: 30, y: 50, width: 400, height: 600 };

for (const rotation of [0, 90, 180, 270, -90, 450]) {
  test(`matches pdf.js for a page rotated ${rotation}°`, async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.setCropBox(CROP.x, CROP.y, CROP.width, CROP.height);
    page.setRotation(degrees(rotation));

    const pdf = await getDocument({ data: await doc.save(), verbosity: 0 }).promise;
    const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const box = { ...doc.getPage(0).getCropBox(), rotation: doc.getPage(0).getRotation().angle };

    assert.deepEqual(displaySize(box), { width: viewport.width, height: viewport.height });
    for (const [x, y] of [[0, 0], [10, 20], [123.5, 45.25], [viewport.width, viewport.height]]) {
      const [ex, ey] = viewport.convertToPdfPoint(x, y);
      const [ax, ay] = toPdfPoint(box, x, y);
      assert.ok(Math.abs(ax - ex) < 1e-9 && Math.abs(ay - ey) < 1e-9, `(${x}, ${y}): got ${[ax, ay]}, pdf.js says ${[ex, ey]}`);
    }
    await pdf.loadingTask.destroy();
  });
}
