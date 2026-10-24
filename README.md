# pdf-signer

Sign PDFs, or photos and screenshots of paper forms, in the browser. Add a typed, drawn, or
photographed signature, plus text and dates, then save a new PDF or PNG. Nothing is uploaded.

## Run it

```sh
nvm use          # Node 22
npm install
npm run dev      # http://localhost:5173
```

`npm run build` writes a static site to `dist/` (serve it with `npm run preview` or any static
host). `npm test` checks the page-coordinate math against pdf.js.

## Getting a signature that looks real

- **Type** (what DocuSign and Adobe default to): your name in a script font. It is the
  cleanest option and looks good at any size.
- **Draw**: input is smoothed to remove trackpad jitter, line width follows pen speed or
  pressure, and the drawing is shrunk to fit the line. Drawing large and letting it shrink
  hides most of the wobble.
- **From a photo**: sign white paper with a dark pen and take a photo. The paper is removed,
  the ink is recolored with the **Ink** control, and the photo is cropped to the signature.
  This gives you your real signature.

To match ink that's already on a form, use **Match** (Chrome and Edge) and click the existing
handwriting. Choose **Handwriting** in the Font menu so text and dates look filled in by hand.

## Use it as a library

```js
import { createPdfSigner, configurePdfjs } from 'pdf-signer';
import 'pdf-signer/styles.css';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'; // Vite; use your bundler's equivalent

configurePdfjs({ workerSrc });

const signer = createPdfSigner(document.querySelector('#app'), {
  ink: '#1f3a93',
  onSave: (blob, fileName) => upload(blob, fileName), // default: download
});

await signer.open(file);                      // File, Blob, ArrayBuffer, or Uint8Array (PDF or image)
signer.addEventListener('change', () => console.log(signer.placements));
const bytes = await signer.exportPdf();       // Uint8Array
```

`configurePdfjs` also takes `wasmUrl`, `standardFontDataUrl`, `cMapUrl` and `iccUrl`. These
point at the folders of the same names in `pdfjs-dist`, and some PDFs need them: scanned
images, unembedded fonts, and CJK text. `demo/main.js` shows them wired up.

### Placements

What's on the page is plain, serializable data, measured in PDF points from the top-left of
the page as displayed:

```js
{ type: 'image', page: 0, x, y, width, height, mask, color }   // mask: PNG data URL (alpha = ink)
{ type: 'text',  page: 0, x, y, text, font, fontSize, color }
```

`signer.setPlacements(list)` restores or prefills them.

### Headless

`pdf-signer/core` has the pieces without the editor UI:

| Export | What it does |
| --- | --- |
| `toPdfBytes(input)` / `imageToPdf(image)` | Normalize a PDF or image into PDF bytes |
| `signPdf(bytes, placements)` | Draw placements onto a copy of the PDF |
| `renderToPngs(bytes, { width })` | Rasterize each page |
| `textMask`, `strokesMask`, `photoMask`, `tint` | Build and color signature images |
| `loadFont`, `DEFAULT_FONTS` | Handwriting fonts |
| `localStore(key)` | Saved signatures in localStorage (or bring your own `{ load, save }`) |

The UI parts are also exported separately: `PdfSigner`, `SignatureDialog` and `InkPad`.

### Theming

Override the CSS custom properties on `.ps-root` (`--ps-accent`, `--ps-bg`, `--ps-panel`, …).
All classes are prefixed `ps-`.

## Layout

```
src/core/   headless: documents, geometry, masks, strokes, fonts, signing, rendering
src/ui/     editor (pdf-signer.js), signature dialog, ink pad, text box, styles
demo/       the app at index.html
fonts/      bundled handwriting fonts; licenses in fonts/licenses/
test/       node:test checks
```

## Notes

- The saved PDF keeps the original pages as they are, so their text stays selectable.
  Signatures and text are added as images.
- This is a visual signature, like signing a printout. It is not a cryptographic digital
  signature.
- Fonts: Homemade Apple (Apache 2.0); Mrs Saint Delafield, Great Vibes, Caveat (SIL OFL 1.1).
