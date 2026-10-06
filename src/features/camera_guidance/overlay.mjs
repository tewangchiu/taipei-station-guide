// Coordinates stay in the image plane; no world pose or user location is inferred.
export function coverLayout(imageWidth, imageHeight, width, height, focusX = .5, focusY = .5) {
  if (![imageWidth, imageHeight, width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const overflowX = imageWidth * scale - width, overflowY = imageHeight * scale - height;
  const offsetX = -Math.max(0, Math.min(overflowX, focusX * imageWidth * scale - width / 2));
  const offsetY = -Math.max(0, Math.min(overflowY, focusY * imageHeight * scale - height / 2));
  return { scale, offsetX, offsetY, width, height, imageWidth, imageHeight,
    positionX: overflowX ? -offsetX / overflowX * 100 : 50,
    positionY: overflowY ? -offsetY / overflowY * 100 : 50 };
}
export function projectAnchor(anchor, layout) {
  if (!anchor || anchor.coordinateSpace !== 'normalized-image' || !layout || anchor.polygon?.length !== 4) return null;
  const points = [...anchor.polygon, anchor.center];
  if (!points.every(point => point && [point.x, point.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1))) return null;
  const project = point => ({ x: point.x * layout.imageWidth * layout.scale + layout.offsetX, y: point.y * layout.imageHeight * layout.scale + layout.offsetY });
  const polygon = anchor.polygon.map(project), center = project(anchor.center);
  const visible = polygon.every(point => point.x >= 0 && point.x <= layout.width && point.y >= 0 && point.y <= layout.height);
  return { polygon, center, visible };
}

// A sign outside the displayed cover crop cannot advance the user's route.
export function visibleObservation(result, layout) {
  if (!result.accepted || projectAnchor(result.anchor, layout)?.visible) return result;
  return { ...result, accepted: false, nodeId: null, reason: 'marker_out_of_view', anchor: null };
}

export function overlayLifetime(capturedAtMs, nowMs, maxAgeMs = 1200) {
  const age = nowMs - capturedAtMs;
  return Number.isFinite(age) && age >= 0 ? Math.max(0, maxAgeMs - age) : 0;
}
export function labelPlacement(polygon, layout, label, blocked) {
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const top = middle(polygon[0], polygon[1]), bottom = middle(polygon[2], polygon[3]);
  const left = middle(polygon[0], polygon[3]), right = middle(polygon[1], polygon[2]);
  const w = label.width, h = label.height;
  const choices = [
    { placement: 'above', x: top.x, y: top.y - 32, left: top.x - w / 2, top: top.y - 32 - h },
    { placement: 'below', x: bottom.x, y: bottom.y + 32, left: bottom.x - w / 2, top: bottom.y + 32 },
    { placement: 'left', x: left.x - 32, y: left.y, left: left.x - 32 - w, top: left.y - h / 2 },
    { placement: 'right', x: right.x + 32, y: right.y, left: right.x + 32, top: right.y - h / 2 },
  ];
  return choices.find(box => box.left >= 12 && box.left + w <= layout.width - 12 && box.top >= 82
    && box.top + h <= layout.height - 12
    && (!blocked || box.left + w <= blocked.left - 8 || box.left >= blocked.right + 8 || box.top + h <= blocked.top - 8 || box.top >= blocked.bottom + 8)) ?? null;
}
