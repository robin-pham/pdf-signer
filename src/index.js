// pdf-signer: the editor UI plus the headless core it is built on.
//
//   import { createPdfSigner, configurePdfjs } from 'pdf-signer';
//   import 'pdf-signer/styles.css';

export { PdfSigner, createPdfSigner, download } from './ui/pdf-signer.js';
export { SignatureDialog } from './ui/signature-dialog.js';
export { InkPad } from './ui/ink-pad.js';
export * from './core/index.js';
