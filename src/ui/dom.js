/**
 * Create an element. Props named `on<event>` become listeners, `class` and `style` are set
 * directly, known properties are assigned, and anything else becomes an attribute.
 * Children may be nodes, strings, arrays, or null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

/** Follow a pointer from `pointerdown` until it is released. */
export function trackPointer(down, onMove, onEnd) {
  const target = down.currentTarget;
  target.setPointerCapture(down.pointerId);
  const end = () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    onEnd?.();
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const px = (n) => `${n}px`;
