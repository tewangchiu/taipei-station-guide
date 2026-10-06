// Experimental, local image matching. Recognition is not a calibrated physical arrival.
export const RECOGNIZER_VERSION = 'camera-landmark-orb-ncc-v1';
export const DEFAULT_ROIS = Object.freeze({
  Y28: Object.freeze([770, 420, 920, 525]),
  Y26: Object.freeze([320, 290, 580, 550]),
  Y23: Object.freeze([695, 545, 910, 685]),
});
export const DEFAULT_PARAMS = Object.freeze({
  maxDimension: 800, features: 1200, ratio: 0.75, maxHamming: 64,
  reprojectionPx: 3, minInliers: 24, minInlierRatio: 0.45,
  minMargin: 12, minCorrelation: 0.72, minContrast: 6,
  minCoverage: 0.12, minMarkerAreaFraction: 0.0015,
  maxMarkerAreaFraction: 0.5, minMarkerShortSidePx: 18,
});
const NODE_IDS = Object.freeze(['Y28', 'Y26', 'Y23']);
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const emptyMetrics = () => ({ inliers: 0, correlation: null, contrast: null, coverage: 0, elapsedMs: 0 });
const destroy = (...items) => { for (const item of items) item?.delete?.(); };

function imageDimensions(source) {
  return [source?.naturalWidth || source?.videoWidth || source?.width,
    source?.naturalHeight || source?.videoHeight || source?.height];
}
function validRoi(roi, width, height) {
  return Array.isArray(roi) && roi.length === 4 && roi.every(Number.isFinite)
    && roi[0] >= 0 && roi[1] >= 0 && roi[2] > roi[0] && roi[3] > roi[1]
    && roi[2] <= width && roi[3] <= height;
}
function project(h, x, y) {
  const z = h[6] * x + h[7] * y + h[8];
  if (!Number.isFinite(z) || Math.abs(z) < 1e-8) return null;
  const p = [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z];
  return p.every(Number.isFinite) ? p : null;
}
function polygonGeometry(h, box, width, height) {
  const points = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
    .map(([x, y]) => project(h, x, y));
  if (points.some(p => !p || p[0] < 0 || p[1] < 0 || p[0] >= width || p[1] >= height)) return null;
  const cross = points.map((p, i) => {
    const q = points[(i + 1) % 4], r = points[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  // No folded/mirrored geometry: references and rear camera are unmirrored.
  if (cross.some(n => !Number.isFinite(n) || n <= 0)) return null;
  const area = Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % 4]; return sum + p[0] * q[1] - p[1] * q[0];
  }, 0)) / 2;
  const sides = points.map((p, i) => Math.hypot(p[0] - points[(i + 1) % 4][0], p[1] - points[(i + 1) % 4][1]));
  return { markerAreaFraction: area / (width * height), markerShortSidePx: Math.min(...sides) };
}
// Image coordinates only. The caller must apply its own CSS crop/fit transform.
// Polygon order follows reference ROI corners, even when the image is rotated.
export function projectImageAnchor(h, roi, { width, height, sourceWidth = width, sourceHeight = height } = {}) {
  if ((!Array.isArray(h) && !ArrayBuffer.isView(h)) || h.length !== 9 || !Array.from(h).every(Number.isFinite)
    || ![width, height, sourceWidth, sourceHeight].every(n => Number.isInteger(n) && n > 0)
    || !Array.isArray(roi) || roi.length !== 4 || !roi.every(Number.isFinite)
    || roi[0] < 0 || roi[1] < 0 || roi[2] <= roi[0] || roi[3] <= roi[1]) return null;
  if (!polygonGeometry(h, roi, width, height)) return null;
  const points = [[roi[0], roi[1]], [roi[2], roi[1]], [roi[2], roi[3]], [roi[0], roi[3]]]
    .map(([x, y]) => project(h, x, y));
  const center = project(h, (roi[0] + roi[2]) / 2, (roi[1] + roi[3]) / 2);
  if (!center || center[0] < 0 || center[1] < 0 || center[0] >= width || center[1] >= height) return null;
  const normalized = ([x, y]) => ({ x: x / width, y: y / height });
  return { schemaVersion: 'image-anchor-v1', coordinateSpace: 'normalized-image',
    imageSize: { width: sourceWidth, height: sourceHeight }, polygon: points.map(normalized), center: normalized(center) };
}
function markerCorrelation(ref, query, h) {
  let n = 0, missing = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let y = Math.ceil(ref.roi[1]); y < ref.roi[3]; y += 2) {
    for (let x = Math.ceil(ref.roi[0]); x < ref.roi[2]; x += 2) {
      const point = project(h, x, y);
      if (!point || point[0] < 0 || point[1] < 0 || point[0] >= query.width - 1 || point[1] >= query.height - 1) { missing++; continue; }
      const [xx, yy] = point, ix = Math.floor(xx), iy = Math.floor(yy), dx = xx - ix, dy = yy - iy;
      const p = query.pixels, index = iy * query.width + ix;
      const a = ref.pixels[y * ref.width + x];
      const b = (1 - dx) * (1 - dy) * p[index] + dx * (1 - dy) * p[index + 1]
        + (1 - dx) * dy * p[index + query.width] + dx * dy * p[index + query.width + 1];
      n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
    }
  }
  if (n < 20) return { correlation: null, contrast: null, markerValidFraction: 0 };
  const vx = Math.max(0, sxx - sx * sx / n), vy = Math.max(0, syy - sy * sy / n);
  const correlation = vx > 1 && vy > 1 ? (sxy - sx * sy / n) / Math.sqrt(vx * vy) : null;
  return { correlation: Number.isFinite(correlation) ? Math.max(-1, Math.min(1, correlation)) : null,
    contrast: Math.sqrt(vy / n), markerValidFraction: n / (n + missing) };
}

export async function createLandmarkRecognizer({ cv, references }) {
  if (!cv?.ORB || !cv?.findHomography || !cv?.imread || !Array.isArray(references)
    || references.length !== NODE_IDS.length || new Set(references.map(r => r?.nodeId)).size !== NODE_IDS.length
    || references.some(r => !NODE_IDS.includes(r?.nodeId))) throw new Error('invalid_landmark_references');
  const params = DEFAULT_PARAMS;
  const orb = new cv.ORB(params.features, 1.2, 8, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  const refs = [];
  // Candidate geometry is private; rejected candidates never expose a UI anchor.
  const imageAnchors = new WeakMap();
  let disposed = false;
  function extract(source) {
    const [sourceWidth, sourceHeight] = imageDimensions(source);
    if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 32 || sourceHeight < 32
      || sourceWidth > 8192 || sourceHeight > 8192) throw new Error('invalid_frame_dimensions');
    let rgba, scaled, gray, mask, keypoints, descriptors;
    try {
      rgba = cv.imread(source); scaled = new cv.Mat(); gray = new cv.Mat(); mask = new cv.Mat();
      const scale = Math.min(1, params.maxDimension / Math.max(sourceWidth, sourceHeight));
      const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale);
      cv.resize(rgba, scaled, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
      cv.cvtColor(scaled, gray, cv.COLOR_RGBA2GRAY);
      keypoints = new cv.KeyPointVector(); descriptors = new cv.Mat();
      orb.detectAndCompute(gray, mask, keypoints, descriptors, false);
      return { width, height, sourceWidth, sourceHeight, scale, keypoints, descriptors, pixels: new Uint8Array(gray.data) };
    } catch (error) { destroy(keypoints, descriptors); throw error; }
    finally { destroy(rgba, scaled, gray, mask); }
  }
  try {
    for (const reference of references) {
      const [w, h] = imageDimensions(reference.source);
      const roi = reference.roi ?? DEFAULT_ROIS[reference.nodeId];
      if (!validRoi(roi, w, h)) throw new Error('invalid_landmark_roi');
      const extracted = extract(reference.source);
      if (extracted.descriptors.rows < params.minInliers) { destroy(extracted.keypoints, extracted.descriptors); throw new Error('reference_has_insufficient_features'); }
      refs.push({ ...extracted, nodeId: reference.nodeId, roi: roi.map(n => n * extracted.scale) });
    }
  } catch (error) { refs.forEach(r => destroy(r.keypoints, r.descriptors)); orb.delete(); throw error; }

  function compare(ref, query) {
    const result = { nodeId: ref.nodeId, inliers: 0, matches: 0, inlierRatio: 0, coverage: 0,
      correlation: null, contrast: null, markerValidFraction: 0, geometryValid: false,
      markerAreaFraction: 0, markerShortSidePx: 0 };
    let matcher, pairs, src, dst, mask, homography;
    try {
      if (query.descriptors.rows < 2) return result;
      matcher = new cv.BFMatcher(cv.NORM_HAMMING, false); pairs = new cv.DMatchVectorVector();
      matcher.knnMatch(ref.descriptors, query.descriptors, pairs, 2);
      const matches = [], usedTargets = new Set();
      for (let i = 0; i < pairs.size(); i++) {
        const pair = pairs.get(i);
        try { if (pair.size() >= 2) {
          const a = pair.get(0), b = pair.get(1);
          if (a.distance < params.ratio * b.distance && a.distance <= params.maxHamming
            && !usedTargets.has(a.trainIdx)) { matches.push(a); usedTargets.add(a.trainIdx); }
        } } finally { pair.delete(); }
      }
      result.matches = matches.length;
      if (matches.length < 4) return result;
      const sourcePoints = [], queryPoints = [];
      for (const match of matches) {
        const a = ref.keypoints.get(match.queryIdx).pt, b = query.keypoints.get(match.trainIdx).pt;
        sourcePoints.push(a.x, a.y); queryPoints.push(b.x, b.y);
      }
      src = cv.matFromArray(matches.length, 1, cv.CV_32FC2, sourcePoints);
      dst = cv.matFromArray(matches.length, 1, cv.CV_32FC2, queryPoints); mask = new cv.Mat();
      homography = cv.findHomography(src, dst, cv.RANSAC, params.reprojectionPx, mask, 2000, 0.995);
      if (homography.empty()) return result;
      const h = Array.from(homography.data64F.length ? homography.data64F : homography.data32F);
      if (h.length !== 9 || !h.every(Number.isFinite)) return result;
      const x = [], y = [], cells = new Set();
      for (let i = 0; i < matches.length; i++) if (mask.data[i]) {
        result.inliers++; const px = sourcePoints[i * 2], py = sourcePoints[i * 2 + 1];
        x.push(px); y.push(py); cells.add(`${Math.min(3, Math.floor(px / ref.width * 4))}:${Math.min(3, Math.floor(py / ref.height * 4))}`);
      }
      result.inlierRatio = result.inliers / matches.length;
      result.coverage = result.inliers ? (Math.max(...x) - Math.min(...x)) * (Math.max(...y) - Math.min(...y)) / (ref.width * ref.height) : 0;
      result.occupiedCells = cells.size;
      const geometry = polygonGeometry(h, ref.roi, query.width, query.height);
      if (!geometry) return result;
      Object.assign(result, geometry, markerCorrelation(ref, query, h));
      result.geometryValid = geometry.markerAreaFraction >= params.minMarkerAreaFraction
        && geometry.markerAreaFraction <= params.maxMarkerAreaFraction
        && geometry.markerShortSidePx >= params.minMarkerShortSidePx && result.markerValidFraction >= 0.98;
      if (result.geometryValid) imageAnchors.set(result, projectImageAnchor(h, ref.roi, query));
      return result;
    } finally { destroy(matcher, pairs, src, dst, mask, homography); }
  }
  return {
    recognize(source) {
      const started = clock();
      if (disposed) return { nodeId: null, accepted: false, reason: 'recognizer_disposed', anchor: null, metrics: emptyMetrics(), candidates: [] };
      let query;
      try {
        query = extract(source);
        const candidates = refs.map(ref => compare(ref, query)).sort((a, b) => b.inliers - a.inliers);
        const best = candidates[0], runnerUp = candidates[1];
        let reason = 'landmark_match';
        if (best.inliers < params.minInliers || best.inlierRatio < params.minInlierRatio) reason = 'insufficient_geometric_match';
        else if (best.inliers - runnerUp.inliers < params.minMargin) reason = 'ambiguous_landmark';
        else if (best.coverage < params.minCoverage || best.occupiedCells < 4) reason = 'insufficient_scene_coverage';
        else if (!best.geometryValid) reason = 'marker_geometry_unresolved';
        else if (best.correlation === null || best.correlation < params.minCorrelation || best.contrast < params.minContrast) reason = 'marker_patch_mismatch';
        const accepted = reason === 'landmark_match';
        return { nodeId: accepted ? best.nodeId : null, accepted, reason, anchor: accepted ? imageAnchors.get(best) ?? null : null,
          metrics: { ...best, elapsedMs: clock() - started }, candidates,
          recognizerVersion: RECOGNIZER_VERSION, evidenceMode: 'prototype', physicalArrivalVerified: false };
      } catch { return { nodeId: null, accepted: false, reason: 'recognizer_error', anchor: null, metrics: { ...emptyMetrics(), elapsedMs: clock() - started }, candidates: [] }; }
      finally { if (query) destroy(query.keypoints, query.descriptors); }
    },
    dispose() { if (!disposed) { disposed = true; refs.forEach(r => { destroy(r.keypoints, r.descriptors); r.pixels.fill(0); }); orb.delete(); } },
  };
}
