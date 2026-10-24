// Fonts are described as `{ family, url? }`. Without a url the family is assumed to be
// installed (e.g. Helvetica). Text fonts also carry a `label` for menus and a default
// `size` in points, tuned so different fonts look about the same size on a form.

const font = (file) => new URL(`../../fonts/${file}`, import.meta.url).href;

export const DEFAULT_FONTS = {
  signature: [
    { family: 'Homemade Apple', url: font('HomemadeApple.ttf') },
    { family: 'Mrs Saint Delafield', url: font('MrsSaintDelafield.ttf') },
    { family: 'Great Vibes', url: font('GreatVibes.ttf') },
  ],
  text: [
    { family: 'Helvetica', label: 'Print', size: 11 },
    { family: 'Caveat', label: 'Handwriting', size: 17, url: font('Caveat.ttf') },
    { family: 'Homemade Apple', label: 'Handwriting (loopy)', size: 12, url: font('HomemadeApple.ttf') },
  ],
};

export const fontCss = (family) => `"${family}", Helvetica, Arial, sans-serif`;

const loading = new Map();

/** Load a font once and add it to the document. Resolves when it is ready to draw with. */
export function loadFont({ family, url }) {
  if (!url) return Promise.resolve();
  if (!loading.has(family)) {
    loading.set(family, new FontFace(family, `url(${JSON.stringify(url)})`).load().then((face) => {
      document.fonts.add(face);
    }));
  }
  return loading.get(family);
}
