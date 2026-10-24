import { DEFAULT_FONTS, loadFont } from '../core/fonts.js';
import { toPdfBytes } from '../core/document.js';
import { loadPdf, renderPage, renderToPngs } from '../core/render.js';
import { placementSize, signPdf } from '../core/sign.js';
import { tint } from '../core/masks.js';
import { localStore } from '../core/storage.js';
import { SignatureDialog } from './signature-dialog.js';
import { openTextInput } from './text-input.js';
import { clamp, h, px, trackPointer } from './dom.js';

const SIGNATURE_WIDTH = 150;        // points, about 2 inches
const SIGNATURE_MAX_HEIGHT = 45;    // points; keeps tall signatures inside a form line
const MAX_PAGE_WIDTH = 1000;        // CSS pixels
const DRAG_THRESHOLD = 3;           // CSS pixels before a press counts as a drag

/** Default `onSave`: download the file. */
export function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The signing editor: a toolbar, the document's pages, and the signature dialog.
 *
 * Events: `open` ({ name, pages }), `change` (placements edited), `error` ({ message, error }).
 *
 * @example
 *   const signer = createPdfSigner(document.querySelector('#app'));
 *   await signer.open(file);
 *   signer.addEventListener('change', () => save(signer.placements));
 */
export class PdfSigner extends EventTarget {
  #options;
  #root;
  #viewer;
  #hint;
  #controls;
  #dialog;
  #fontsReady;

  #doc = null;          // { bytes, name }
  #pdf = null;          // pdf.js document, kept to free it on the next open
  #pages = [];          // { el, scale, width, height }; width/height in points as displayed
  #placements = [];
  #views = new Map();   // placement → { el, img, paintId }
  #selected = null;
  #armed = null;        // what the next click on a page places
  #input = null;        // open text box
  #editing = null;      // promise for the text edit in progress

  /**
   * @param {HTMLElement} container
   * @param {object} [options]
   * @param {typeof DEFAULT_FONTS} [options.fonts]  script fonts for signatures and fonts for text
   * @param {string} [options.ink]  starting ink color
   * @param {{ load(): object, save(state: object): void }} [options.store]  where saved signatures live
   * @param {(blob: Blob, fileName: string) => void} [options.onSave]  what the Save buttons do; downloads by default
   */
  constructor(container, options = {}) {
    super();
    this.#options = { fonts: DEFAULT_FONTS, ink: '#1f3a93', store: localStore(), onSave: download, ...options };
    this.#fontsReady = Promise.all(this.#options.fonts.text.map(loadFont));
    this.#build(container);
    document.addEventListener('keydown', this.#onKeyDown);
  }

  /** The current placements, as plain data (see `Placement` in core/sign.js). */
  get placements() { return structuredClone(this.#placements); }

  /** The ink color for the selected item and new ones. */
  get ink() { return this.#controls.ink.value; }

  /** Open a PDF, or a photo or screenshot of a form. Replaces the current document. */
  async open(input, name) {
    let doc, pdf;
    try {
      [doc] = await Promise.all([toPdfBytes(input, name), this.#fontsReady]);
      pdf = await loadPdf(doc.bytes);
    } catch (error) {
      this.#fail("Couldn't open that file. Use a PDF, JPG, or PNG (iPhone HEIC photos only open in Safari).", error);
      return;
    }

    this.#pdf?.loadingTask.destroy();
    this.#doc = doc;
    this.#pdf = pdf;
    this.#placements = [];
    this.#views.clear();
    this.#selected = null;
    this.#disarm();
    await this.#renderPages(pdf);

    for (const key of ['signature', 'text', 'date', 'savePdf', 'savePng']) this.#controls[key].disabled = false;
    this.#setHint('Add a signature, text, or date, then click where it goes.');
    this.dispatchEvent(new CustomEvent('open', { detail: { name: doc.name, pages: pdf.numPages } }));
  }

  /** Replace all placements, e.g. to restore a saved session or prefill a form. */
  async setPlacements(placements) {
    await this.#fontsReady;
    for (const view of this.#views.values()) view.el.remove();
    this.#views.clear();
    this.#selected = null;
    this.#placements = structuredClone(placements).filter((p) => this.#pages[p.page]);
    this.#placements.forEach((p) => this.#createView(p));
    this.#changed();
  }

  /** The signed PDF's bytes. */
  async exportPdf() {
    await this.#finishEditing();
    if (!this.#doc) throw new Error('No document is open');
    return signPdf(this.#doc.bytes, this.#placements);
  }

  /** One PNG per page of the signed document. */
  async exportPngs(options) {
    return renderToPngs(await this.exportPdf(), options);
  }

  /** Remove the editor and its listeners. */
  destroy() {
    document.removeEventListener('keydown', this.#onKeyDown);
    this.#pdf?.loadingTask.destroy();
    this.#root.remove();
  }

  // ---------- Building ----------

  #build(container) {
    const button = (label, onclick, props = {}) =>
      h('button', { class: 'ps-btn', type: 'button', disabled: true, onclick, ...props }, label);

    const c = this.#controls = {
      open: h('label', { class: 'ps-btn' }, 'Open PDF or photo',
        h('input', {
          type: 'file', accept: 'application/pdf,.pdf,image/*', hidden: true,
          onchange: (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) this.open(file); },
        })),
      signature: button('Signature', () => this.#chooseSignature()),
      text: button('Text', () => this.#arm({ type: 'text' }, c.text)),
      date: button('Date', () => this.#arm({ type: 'text', text: new Date().toLocaleDateString() }, c.date)),
      ink: h('input', { type: 'color', class: 'ps-color', value: this.#options.ink, oninput: () => this.#applyInk() }),
      match: 'EyeDropper' in window
        ? h('button', { class: 'ps-btn', type: 'button', title: 'Pick a color from the screen, like ink already on the form', onclick: () => this.#matchInk() }, 'Match')
        : null,
      font: h('select', { class: 'ps-select', onchange: () => this.#applyFont() },
        this.#options.fonts.text.map((f) => h('option', { value: f.family }, f.label))),
      savePng: button('Save as image', () => this.#save('png')),
      savePdf: button('Save PDF', () => this.#save('pdf'), { class: 'ps-btn ps-primary' }),
    };

    this.#hint = h('div', { class: 'ps-hint', role: 'status' });
    this.#viewer = h('div', { class: 'ps-viewer' },
      h('div', { class: 'ps-empty' },
        h('p', {}, h('strong', {}, 'Drop a PDF or a photo of the form here'), ', or use Open.'),
        h('p', {}, 'Everything stays on this device. Nothing is uploaded.')));
    this.#dialog = new SignatureDialog({ fonts: this.#options.fonts.signature, store: this.#options.store, ink: () => this.ink });

    const sep = () => h('span', { class: 'ps-sep' });
    this.#root = h('div', { class: 'ps-root' },
      h('div', { class: 'ps-toolbar' },
        c.open, sep(), c.signature, c.text, c.date, sep(),
        h('label', { class: 'ps-field', title: 'Ink color for the selected item and new ones' }, 'Ink', c.ink),
        c.match,
        h('label', { class: 'ps-field' }, 'Font', c.font),
        h('span', { class: 'ps-spacer' }),
        c.savePng, c.savePdf,
        this.#hint),
      this.#viewer,
      this.#dialog.element);

    this.#root.addEventListener('dragover', (e) => { e.preventDefault(); this.#root.classList.add('ps-dragging'); });
    this.#root.addEventListener('dragleave', (e) => {
      if (!this.#root.contains(e.relatedTarget)) this.#root.classList.remove('ps-dragging');
    });
    this.#root.addEventListener('drop', (e) => {
      e.preventDefault();
      this.#root.classList.remove('ps-dragging');
      const file = e.dataTransfer.files[0];
      if (file) this.open(file);
    });

    container.append(this.#root);
  }

  async #renderPages(pdf) {
    this.#viewer.replaceChildren();
    this.#pages = [];
    const available = clamp(this.#viewer.clientWidth - 32, 320, MAX_PAGE_WIDTH);
    const pixelRatio = window.devicePixelRatio || 1;

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const scale = available / width;
      const canvas = h('canvas');
      const index = this.#pages.length;
      const el = h('div', {
        class: 'ps-page',
        style: { width: px(width * scale), height: px(height * scale) },
        onpointerdown: (e) => this.#onPagePointerDown(e, index),
      }, canvas);
      this.#viewer.append(el);
      this.#pages.push({ el, scale, width, height });
      await renderPage(page, canvas, scale, pixelRatio);
    }
  }

  // ---------- Placing ----------

  async #chooseSignature() {
    const signature = await this.#dialog.choose();
    if (signature) this.#arm({ type: 'image', ...signature }, this.#controls.signature);
  }

  #arm(what, button) {
    this.#armed = what;
    this.#root.classList.add('ps-armed');
    this.#root.querySelectorAll('.ps-active').forEach((b) => b.classList.remove('ps-active'));
    button.classList.add('ps-active');
    this.#setHint('Click on the page to place it. Esc to cancel.');
  }

  #disarm() {
    this.#armed = null;
    this.#root.classList.remove('ps-armed');
    this.#root.querySelectorAll('.ps-active').forEach((b) => b.classList.remove('ps-active'));
    if (this.#doc) {
      this.#setHint('Drag to move · corner dot to resize · click text to edit · Ink and Font change the selected item · Delete removes it.');
    }
  }

  #onPagePointerDown(e, page) {
    if (e.target.closest('.ps-item, .ps-text-input')) return;
    this.#input?.commit();
    const armed = this.#armed;
    if (!armed) { this.#select(null); return; }
    e.preventDefault();
    this.#disarm();

    const { el, scale } = this.#pages[page];
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (armed.type === 'image') {
      let width = SIGNATURE_WIDTH;
      let height = width / armed.aspect;
      if (height > SIGNATURE_MAX_HEIGHT) { height = SIGNATURE_MAX_HEIGHT; width = height * armed.aspect; }
      this.#add({ type: 'image', page, x: x - width / 2, y: y - height / 2, width, height, mask: armed.src, color: this.ink });
      return;
    }

    const font = this.#textFont();
    const placement = { type: 'text', page, x, y: y - font.size * 0.7, text: armed.text ?? '', font: font.family, fontSize: font.size, color: this.ink };
    if (placement.text) this.#add(placement);
    else this.#editText(placement, { isNew: true });
  }

  #add(placement) {
    this.#placements.push(placement);
    this.#createView(placement);
    this.#select(placement);
    this.#changed();
  }

  #remove(placement) {
    this.#views.get(placement)?.el.remove();
    this.#views.delete(placement);
    this.#placements = this.#placements.filter((p) => p !== placement);
    if (this.#selected === placement) this.#selected = null;
    this.#changed();
  }

  #createView(placement) {
    const img = h('img', { alt: '' });
    const el = h('div', { class: 'ps-item', onpointerdown: (e) => this.#startMove(e, placement) },
      img,
      h('div', { class: 'ps-handle ps-resize', title: 'Resize', onpointerdown: (e) => this.#startResize(e, placement) }),
      h('div', {
        class: 'ps-handle ps-remove', title: 'Remove',
        onpointerdown: (e) => { e.stopPropagation(); this.#remove(placement); },
      }, '×'));
    this.#views.set(placement, { el, img, paintId: 0 });
    this.#pages[placement.page].el.append(el);
    this.#layout(placement);
    this.#paint(placement);
  }

  #layout(placement) {
    const { scale } = this.#pages[placement.page];
    const { width, height } = placementSize(placement);
    Object.assign(this.#views.get(placement).el.style, {
      left: px(placement.x * scale), top: px(placement.y * scale),
      width: px(width * scale), height: px(height * scale),
    });
  }

  async #paint(placement) {
    const view = this.#views.get(placement);
    const paintId = ++view.paintId;
    const src = await tint(placementSize(placement).mask, placement.color);
    // A newer paint may have started while this one was tinting.
    if (view.paintId === paintId) view.img.src = src;
  }

  #select(placement) {
    this.#views.get(this.#selected)?.el.classList.remove('ps-selected');
    this.#selected = placement;
    if (!placement) return;
    this.#views.get(placement).el.classList.add('ps-selected');
    this.#controls.ink.value = placement.color;
    if (placement.type === 'text') this.#controls.font.value = placement.font;
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }

  // ---------- Editing ----------

  #editText(placement, { isNew = false } = {}) {
    const view = this.#views.get(placement);
    const { el, scale } = this.#pages[placement.page];
    if (view) view.el.style.visibility = 'hidden';
    this.#input = openTextInput({
      parent: el,
      x: placement.x * scale,
      y: placement.y * scale,
      fontSize: placement.fontSize * scale,
      family: placement.font,
      color: placement.color,
      value: placement.text,
    });

    this.#editing = this.#input.done.then((text) => {
      this.#input = null;
      if (view) view.el.style.visibility = '';
      if (text === null) return;                      // cancelled
      if (!text) { if (!isNew) this.#remove(placement); return; }
      placement.text = text;
      if (isNew) { this.#add(placement); return; }
      this.#layout(placement);
      this.#paint(placement);
      this.#changed();
    });
  }

  async #finishEditing() {
    this.#input?.commit();
    await this.#editing;
  }

  // A press without movement on text opens it for editing.
  #startMove(e, placement) {
    e.preventDefault();
    e.stopPropagation();
    this.#input?.commit();
    this.#select(placement);

    const { scale, width: pageWidth, height: pageHeight } = this.#pages[placement.page];
    const { width, height } = placementSize(placement);
    const start = { x: e.clientX, y: e.clientY, left: placement.x, top: placement.y };
    let moved = false;

    trackPointer(e, (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      // Allow hanging half off the page, but never losing it entirely.
      placement.x = clamp(start.left + dx / scale, -width / 2, pageWidth - width / 2);
      placement.y = clamp(start.top + dy / scale, -height / 2, pageHeight - height / 2);
      this.#layout(placement);
    }, () => {
      if (moved) this.#changed();
      else if (placement.type === 'text') this.#editText(placement);
    });
  }

  #startResize(e, placement) {
    e.preventDefault();
    e.stopPropagation();
    const { scale } = this.#pages[placement.page];
    const start = { ...placementSize(placement), fontSize: placement.fontSize, clientX: e.clientX };

    trackPointer(e, (ev) => {
      const k = Math.max(8, start.width + (ev.clientX - start.clientX) / scale) / start.width;
      if (placement.type === 'text') {
        placement.fontSize = start.fontSize * k;
      } else {
        placement.width = start.width * k;
        placement.height = start.height * k;
      }
      this.#layout(placement);
    }, () => this.#changed());
  }

  #onKeyDown = (e) => {
    if (!this.#doc || this.#dialog.isOpen || e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape') {
      this.#disarm();
      this.#select(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.#selected) {
      e.preventDefault();
      this.#remove(this.#selected);
    }
  };

  // ---------- Ink & font ----------

  #textFont() {
    const { text } = this.#options.fonts;
    return text.find((f) => f.family === this.#controls.font.value) ?? text[0];
  }

  #applyInk() {
    const placement = this.#selected;
    if (!placement) return;
    placement.color = this.ink;
    this.#paint(placement);
    this.#changed();
  }

  async #matchInk() {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      this.#controls.ink.value = sRGBHex;
      this.#applyInk();
    } catch {
      // Picking was cancelled.
    }
  }

  #applyFont() {
    const placement = this.#selected;
    if (placement?.type !== 'text') return;
    const next = this.#textFont();
    const previous = this.#options.fonts.text.find((f) => f.family === placement.font) ?? next;
    // Keep the same apparent size when switching between print and handwriting.
    placement.fontSize *= next.size / previous.size;
    placement.font = next.family;
    this.#layout(placement);
    this.#paint(placement);
    this.#changed();
  }

  // ---------- Saving ----------

  async #save(kind) {
    const button = kind === 'pdf' ? this.#controls.savePdf : this.#controls.savePng;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const name = `${this.#doc.name}-signed`;
      if (kind === 'pdf') {
        this.#options.onSave(new Blob([await this.exportPdf()], { type: 'application/pdf' }), `${name}.pdf`);
      } else {
        const pngs = await this.exportPngs();
        pngs.forEach((png, i) => this.#options.onSave(png, pngs.length > 1 ? `${name}-page${i + 1}.png` : `${name}.png`));
      }
    } catch (error) {
      this.#fail("Couldn't save.", error);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  // ---------- Status ----------

  #setHint(message) {
    this.#hint.textContent = message;
    this.#hint.classList.remove('ps-error');
  }

  #fail(message, error) {
    this.#hint.textContent = `${message} ${error?.message ?? ''}`.trim();
    this.#hint.classList.add('ps-error');
    this.dispatchEvent(new CustomEvent('error', { detail: { message, error } }));
  }
}

/** Create a signing editor inside `container`. See `PdfSigner` for options. */
export function createPdfSigner(container, options) {
  return new PdfSigner(container, options);
}
