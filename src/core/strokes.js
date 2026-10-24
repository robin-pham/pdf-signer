// A stroke is an array of points `{ x, y, w }`, where `w` is the line width at that point.
// Strokes are drawn as quadratic curves through the midpoints between points, which keeps
// hand-drawn lines smooth, and each segment takes the average width of its ends.

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function setPen(ctx, color) {
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineCap = ctx.lineJoin = 'round';
}

/** Draw the part of `stroke` that point `i` adds. Call for each new point while drawing live. */
export function drawSegment(ctx, stroke, i, { scale = 1, color = '#000' } = {}) {
  setPen(ctx, color);
  const p = stroke[i];
  if (i === 0) {
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, (p.w / 2) * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const prev = stroke[i - 1];
  const from = i > 1 ? mid(stroke[i - 2], prev) : stroke[0];
  const to = i > 1 ? mid(prev, p) : p;
  ctx.beginPath();
  ctx.moveTo(from.x * scale, from.y * scale);
  ctx.quadraticCurveTo(prev.x * scale, prev.y * scale, to.x * scale, to.y * scale);
  ctx.lineWidth = ((prev.w + p.w) / 2) * scale;
  ctx.stroke();
}

/** Close the gap between the last midpoint and the last point. Call once a stroke is finished. */
export function drawStrokeEnd(ctx, stroke, { scale = 1, color = '#000' } = {}) {
  const n = stroke.length;
  if (n < 3) return;
  setPen(ctx, color);
  const from = mid(stroke[n - 2], stroke[n - 1]);
  const to = stroke[n - 1];
  ctx.beginPath();
  ctx.moveTo(from.x * scale, from.y * scale);
  ctx.lineTo(to.x * scale, to.y * scale);
  ctx.lineWidth = to.w * scale;
  ctx.stroke();
}

export function drawStrokes(ctx, strokes, options) {
  for (const stroke of strokes) {
    stroke.forEach((_, i) => drawSegment(ctx, stroke, i, options));
    drawStrokeEnd(ctx, stroke, options);
  }
}

/** Bounding box of the ink, including line width, or null if there is none. */
export function strokesBounds(strokes) {
  const points = strokes.flat();
  if (!points.length) return null;
  return {
    left: Math.min(...points.map((p) => p.x - p.w)),
    top: Math.min(...points.map((p) => p.y - p.w)),
    right: Math.max(...points.map((p) => p.x + p.w)),
    bottom: Math.max(...points.map((p) => p.y + p.w)),
  };
}
