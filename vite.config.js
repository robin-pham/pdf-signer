import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// pdf.js loads decoders, fonts and character maps by URL at runtime. In dev they are served
// straight from node_modules; for the build they are copied next to the app.
const PDFJS_ASSET_DIRS = ['wasm', 'standard_fonts', 'cmaps', 'iccs'];

function copyPdfjsAssets() {
  let outDir;
  return {
    name: 'copy-pdfjs-assets',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const from = fileURLToPath(new URL('node_modules/pdfjs-dist/', import.meta.url));
      for (const dir of PDFJS_ASSET_DIRS) cpSync(`${from}${dir}`, `${outDir}/pdfjs/${dir}`, { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyPdfjsAssets()],
});
