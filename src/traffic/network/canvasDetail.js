// Presentation only: projected spacing matters because linear roads use unequal axes.
export function projectedLaneSpace(heading, sx, sy, laneWidth = 12) {
  const radians = heading * Math.PI / 180;
  return laneWidth * Math.hypot(Math.sin(radians) * sx, Math.cos(radians) * sy);
}

export function roadDetail(heading, sx, sy, selected = false) {
  const space = projectedLaneSpace(heading, sx, sy);
  const vertical = Math.abs(Math.sin(heading * Math.PI / 180)) > .7;
  return {
    laneLabels: space >= (vertical ? 48 : 18),
    compactLabels: selected && space >= (vertical ? 16 : 12),
    boothLabels: space >= (vertical ? 34 : 16),
    texture: Math.min(sx, sy) >= .55,
  };
}

// Stable ordering keeps labels from flickering as vehicles move. Selected objects win.
export function visibleLabels(candidates, sx, sy, padding = 4) {
  const accepted = [];
  for (const label of [...candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    const width = label.width ?? Array.from(label.text).reduce((sum, c) => sum + (/[^\x00-\x7f]/.test(c) ? 12 : 7), 0);
    const x = label.x * sx, y = label.y * sy + (label.offsetY || 0);
    const box = { left: x - width / 2 - padding, right: x + width / 2 + padding, top: y - 12 - padding, bottom: y + 3 + padding };
    if (accepted.some(other => box.left < other.box.right && box.right > other.box.left && box.top < other.box.bottom && box.bottom > other.box.top)) continue;
    accepted.push({ ...label, box });
  }
  return accepted;
}

// Non-overlapping screen hit circles prevent a later SVG port capturing its neighbour.
export function portHitRadius(point, others, sx, sy) {
  const nearest = others.reduce((distance, other) => {
    if (other === point) return distance;
    return Math.min(distance, Math.hypot((point.x - other.x) * sx, (point.y - other.y) * sy));
  }, Infinity);
  return Math.min(12, nearest * .45);
}

export function canvasActionAnchor(point, viewBox, sx, sy, bounds) {
  const [left, top, width, height] = viewBox.split(' ').map(Number);
  const x = (point.x - left) * sx, y = (point.y - top) * sy;
  const screenWidth = width * sx, screenHeight = height * sy;
  // Do not pin unrelated offscreen objects to the viewport edge.
  if (x < -20 || x > screenWidth + 20 || y < -40 || y > screenHeight + 40) return null;
  const nextX = Math.max(8 - bounds.left, Math.min(screenWidth - 8 - bounds.right, x));
  const nextY = Math.max(8 - bounds.top, Math.min(screenHeight - 62 - bounds.bottom, y));
  return { x: left + nextX / sx, y: top + nextY / sy };
}
