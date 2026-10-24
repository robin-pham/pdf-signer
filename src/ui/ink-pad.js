import { drawSegment, drawStrokeEnd, drawStrokes } from '../core/strokes.js';
import { strokesMask } from '../core/masks.js';
import { clamp, h } from './dom.js';

// How much of each new pointer position to move toward. Lower is smoother but lags more;
// this takes out most trackpad and mouse jitter.
const SMOOTHING = 0.45;

/**
 * A canvas to sign on. Input is smoothed, and the line thins as the pen speeds up, like real
 * ink. Pen pressure is used when the device reports it.
 */
export class InkPad {
  #canvas = h('canvas', { class: 'ps-pad' });
  #ctx = this.#canvas.getContext('2d');
  #strokes = [];
  #current = null;
  #lastWidth = 0;
  #penSize;
  #color;

  /** @param {{ penSize: () => number, color: () => string }} options */
  constructor({ penSize, color }) {
    this.#penSize = penSize;
    this.#color = color;
    this.#canvas.addEventListener('pointerdown', (e) => this.#start(e));
    this.#canvas.addEventListener('pointermove', (e) => this.#move(e));
    this.#canvas.addEventListener('pointerup', (e) => this.#end(e));
    this.#canvas.addEventListener('pointercancel', (e) => this.#end(e));
  }

  get element() { return this.#canvas; }
  get isEmpty() { return !this.#strokes.length; }

  /** Match the canvas to its displayed size. Call after it becomes visible. */
  resize() {
    const rect = this.#canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.#canvas.width = rect.width * dpr;
    this.#canvas.height = rect.height * dpr;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  redraw() {
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    drawStrokes(this.#ctx, this.#strokes, { color: this.#color() });
  }

  undo() { this.#strokes.pop(); this.redraw(); }
  clear() { this.#strokes = []; this.redraw(); }

  /** The drawing as a mask, or null if nothing has been drawn. */
  toMask() { return strokesMask(this.#strokes); }

  #start(e) {
    this.#canvas.setPointerCapture(e.pointerId);
    this.#current = [];
    this.#strokes.push(this.#current);
    this.#add(e);
  }

  #move(e) {
    if (!this.#current) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.#add(ev);
  }

  #end(e) {
    if (!this.#current) return;
    this.#add(e, true);
    drawStrokeEnd(this.#ctx, this.#current, { color: this.#color() });
    this.#current = null;
  }

  #add(e, final = false) {
    const rect = this.#canvas.getBoundingClientRect();
    const raw = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp };
    const stroke = this.#current;
    const prev = stroke.at(-1);
    // The final point is taken as-is so the stroke ends where the pen lifted.
    const point = prev && !final
      ? { x: prev.x + (raw.x - prev.x) * SMOOTHING, y: prev.y + (raw.y - prev.y) * SMOOTHING, t: raw.t }
      : raw;
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < 1) return;

    point.w = this.#width(point, prev, e);
    this.#lastWidth = point.w;
    stroke.push(point);
    drawSegment(this.#ctx, stroke, stroke.length - 1, { color: this.#color() });
  }

  #width(point, prev, e) {
    const base = this.#penSize();
    if (e.pointerType === 'pen' && e.pressure > 0) return base * (0.35 + e.pressure * 1.1);
    if (!prev) return base;
    const speed = Math.hypot(point.x - prev.x, point.y - prev.y) / Math.max(1, point.t - prev.t);
    const target = clamp((base * 1.3) / (1 + speed * 0.6), base * 0.45, base * 1.3);
    return this.#lastWidth * 0.7 + target * 0.3;
  }
}
