import { fontCss, loadFont } from '../core/fonts.js';
import { photoMask, suggestCutoff, textMask, tint } from '../core/masks.js';
import { imageToCanvas } from '../core/canvas.js';
import { InkPad } from './ink-pad.js';
import { h } from './dom.js';

const MAX_SAVED = 6;
const PHOTO_MAX_PIXELS = 1600;

/**
 * The "adopt a signature" dialog: type it in a script font, draw it, or lift it from a photo.
 * `choose()` resolves with a mask `{ src, aspect }`, or null if cancelled.
 */
export class SignatureDialog {
  #fonts;
  #store;
  #ink;
  #el;
  #tab = 'type';
  #resolve = null;
  #parts = {};
  #pad;

  // Type tab
  #typedFont;
  // Photo tab
  #photo = null;   // ImageData of the chosen photo
  #photoMask = null;

  /**
   * @param {object} options
   * @param {{ family: string, url?: string }[]} options.fonts  script fonts offered on the Type tab
   * @param {{ load(): object, save(state: object): void }} options.store  see `localStore`
   * @param {() => string} options.ink  the current ink color, for previews
   */
  constructor({ fonts, store, ink }) {
    this.#fonts = fonts;
    this.#store = store;
    this.#ink = ink;
    this.#typedFont = fonts[0].family;
    this.#pad = new InkPad({ penSize: () => Number(this.#parts.penSize.value), color: ink });
    this.#el = this.#build();
    this.#el.addEventListener('close', () => this.#finish(null));
  }

  get element() { return this.#el; }
  get isOpen() { return this.#el.open; }

  /** @returns {Promise<{ src: string, aspect: number } | null>} */
  choose() {
    const chosen = new Promise((resolve) => { this.#resolve = resolve; });
    this.#el.showModal();
    this.#renderSaved();
    this.#showTab(this.#tab);
    Promise.all(this.#fonts.map(loadFont)).then(() => this.#renderFontChoices());
    return chosen;
  }

  #finish(signature) {
    const resolve = this.#resolve;
    this.#resolve = null;
    if (this.#el.open) this.#el.close();
    resolve?.(signature);
  }

  #build() {
    const p = this.#parts;
    p.tabs = ['type', 'draw', 'photo'].map((tab) =>
      h('button', { class: 'ps-tab', type: 'button', onclick: () => this.#showTab(tab), 'data-tab': tab },
        { type: 'Type', draw: 'Draw', photo: 'From a photo' }[tab]));

    p.savedLabel = h('div', { class: 'ps-label' }, 'Saved signatures (click to use)');
    p.saved = h('div', { class: 'ps-saved' });

    p.name = h('input', {
      class: 'ps-name', placeholder: 'Your name', autocomplete: 'name',
      value: this.#store.load().name,
      oninput: () => {
        this.#store.save({ ...this.#store.load(), name: p.name.value });
        this.#renderFontChoices();
      },
    });
    p.fontChoices = h('div', { class: 'ps-font-choices' });

    p.penSize = h('input', { type: 'range', min: 1.5, max: 8, step: 0.5, value: 4 });
    p.cutoff = h('input', { type: 'range', min: 60, max: 250, value: 170, oninput: () => this.#processPhoto() });
    p.photoPreview = h('div', { class: 'ps-photo-preview' }, 'No photo yet');
    p.message = h('span', { class: 'ps-message', role: 'status' });

    p.panels = {
      type: h('section', {}, p.name, p.fontChoices),
      draw: h('section', {},
        h('div', { class: 'ps-label' }, "Draw big. It's shrunk to fit the line, which hides the wobble."),
        h('div', { class: 'ps-pad-wrap' }, this.#pad.element),
        h('div', { class: 'ps-controls' },
          h('label', {}, 'Pen ', p.penSize),
          h('span', { class: 'ps-spacer' }),
          h('button', { class: 'ps-btn', type: 'button', onclick: () => this.#pad.undo() }, 'Undo'),
          h('button', { class: 'ps-btn', type: 'button', onclick: () => this.#pad.clear() }, 'Clear'))),
      photo: h('section', {},
        h('div', { class: 'ps-label' },
          'Sign white paper with a dark pen and take a photo (or screenshot). The paper is removed and the ink takes the Ink color.'),
        h('input', { type: 'file', accept: 'image/*', onchange: (e) => this.#choosePhoto(e.target.files[0]) }),
        p.photoPreview,
        h('div', { class: 'ps-controls' }, h('label', {}, 'Background cutoff ', p.cutoff))),
    };

    return h('dialog', { class: 'ps-dialog' },
      h('div', { class: 'ps-dialog-head' }, h('div', { class: 'ps-tabs' }, p.tabs)),
      h('div', { class: 'ps-dialog-body' }, p.savedLabel, p.saved, Object.values(p.panels)),
      h('div', { class: 'ps-dialog-foot' },
        p.message,
        h('button', { class: 'ps-btn', type: 'button', onclick: () => this.#finish(null) }, 'Cancel'),
        h('button', { class: 'ps-btn ps-primary', type: 'button', onclick: () => this.#use() }, 'Use signature')));
  }

  #showTab(tab) {
    this.#tab = tab;
    this.#parts.message.textContent = '';
    for (const button of this.#parts.tabs) button.classList.toggle('ps-on', button.dataset.tab === tab);
    for (const [name, panel] of Object.entries(this.#parts.panels)) panel.hidden = name !== tab;
    if (tab === 'draw') this.#pad.resize();
    if (tab === 'type') this.#parts.name.focus();
  }

  #use() {
    const signature = {
      type: () => this.#typedMask(),
      draw: () => this.#pad.toMask(),
      photo: () => this.#photoMask,
    }[this.#tab]();
    if (!signature) {
      this.#parts.message.textContent = { type: 'Type your name first.', draw: 'Draw your signature first.', photo: 'Pick a photo first.' }[this.#tab];
      return;
    }
    this.#remember(signature);
    this.#pad.clear();
    this.#finish(signature);
  }

  #typedMask() {
    const name = this.#parts.name.value.trim();
    if (!name) return null;
    const { src, aspect } = textMask(name, this.#typedFont, 160);
    return { src, aspect };
  }

  #renderFontChoices() {
    const name = this.#parts.name.value.trim() || 'Your Name';
    this.#parts.fontChoices.replaceChildren(...this.#fonts.map(({ family }) =>
      h('button', {
        class: `ps-font-choice${family === this.#typedFont ? ' ps-on' : ''}`,
        type: 'button',
        style: { fontFamily: fontCss(family), color: this.#ink() },
        onclick: () => { this.#typedFont = family; this.#renderFontChoices(); },
      }, name)));
  }

  // ---- Saved signatures ----

  #remember(signature) {
    const state = this.#store.load();
    const signatures = [signature, ...state.signatures.filter((s) => s.src !== signature.src)].slice(0, MAX_SAVED);
    this.#store.save({ ...state, signatures });
  }

  #forget(signature) {
    const state = this.#store.load();
    this.#store.save({ ...state, signatures: state.signatures.filter((s) => s.src !== signature.src) });
    this.#renderSaved();
  }

  async #renderSaved() {
    const { signatures } = this.#store.load();
    this.#parts.savedLabel.hidden = !signatures.length;
    const items = await Promise.all(signatures.map(async (signature) =>
      h('div', { class: 'ps-saved-sig', title: 'Use this signature', onclick: () => this.#finish(signature) },
        h('img', { src: await tint(signature.src, this.#ink()), alt: 'Saved signature' }),
        h('button', {
          class: 'ps-forget', type: 'button', title: 'Forget this signature',
          onclick: (e) => { e.stopPropagation(); this.#forget(signature); },
        }, '×'))));
    this.#parts.saved.replaceChildren(...items);
  }

  // ---- Photo ----

  async #choosePhoto(file) {
    if (!file) return;
    try {
      const canvas = await imageToCanvas(file, PHOTO_MAX_PIXELS);
      this.#photo = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      this.#parts.photoPreview.textContent = "Couldn't read that image. Try a JPG or PNG.";
      return;
    }
    this.#parts.cutoff.value = suggestCutoff(this.#photo);
    this.#processPhoto();
  }

  async #processPhoto() {
    if (!this.#photo) return;
    const mask = photoMask(this.#photo, Number(this.#parts.cutoff.value));
    this.#photoMask = mask;
    if (!mask) {
      this.#parts.photoPreview.textContent = 'No ink found. Try raising the cutoff.';
      return;
    }
    const src = await tint(mask.src, this.#ink());
    if (this.#photoMask === mask) this.#parts.photoPreview.replaceChildren(h('img', { src, alt: 'Signature preview' }));
  }
}
