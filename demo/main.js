import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { configurePdfjs, createPdfSigner } from '../src/index.js';
import '../src/ui/styles.css';

const assets = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : './pdfjs/';
configurePdfjs({
  workerSrc,
  wasmUrl: `${assets}wasm/`,
  standardFontDataUrl: `${assets}standard_fonts/`,
  cMapUrl: `${assets}cmaps/`,
  iccUrl: `${assets}iccs/`,
});

const signer = createPdfSigner(document.querySelector('#app'));
signer.addEventListener('open', (e) => { document.title = `${e.detail.name} – PDF Signer`; });
signer.addEventListener('error', (e) => console.error(e.detail.message, e.detail.error));
