import { fontCss } from '../core/fonts.js';
import { h, px } from './dom.js';

/**
 * Show a one-line text box at (x, y) in `parent`, styled like the text it edits.
 * `done` resolves with the trimmed text when the box is committed (Enter, blur, or `commit()`),
 * or null if it was cancelled with Escape.
 * @returns {{ done: Promise<string | null>, commit(): void }}
 */
export function openTextInput({ parent, x, y, fontSize, family, color, value = '' }) {
  const font = `${fontSize}px ${fontCss(family)}`;
  const input = h('input', {
    class: 'ps-text-input',
    value,
    style: { left: px(x), top: px(y), font, color },
  });
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const fit = () => { input.style.width = px(Math.max(80, measure.measureText(input.value).width + fontSize)); };

  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    input.remove();
    settle(result);
  };

  input.addEventListener('input', fit);
  input.addEventListener('blur', () => finish(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim()); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
  });

  fit();
  parent.append(input);
  // Focus after the pointer event that opened the box has finished, or it steals focus back.
  requestAnimationFrame(() => { input.focus(); input.select(); });

  return { done, commit: () => finish(input.value.trim()) };
}
