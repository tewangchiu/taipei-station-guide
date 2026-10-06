import test from 'node:test';
import assert from 'node:assert/strict';
import { projectImageAnchor } from '../src/features/camera_guidance/recognizer.mjs';
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const approx = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('identity homography anchors the actual ROI instead of the image center', () => {
  const anchor = projectImageAnchor(identity, [10, 20, 40, 50], { width: 100, height: 200, sourceWidth: 1600, sourceHeight: 3200 });
  assert.deepEqual(anchor, { schemaVersion: 'image-anchor-v1', coordinateSpace: 'normalized-image',
    imageSize: { width: 1600, height: 3200 }, polygon: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.25 }, { x: 0.1, y: 0.25 }], center: { x: 0.25, y: 0.175 } });
  assert(!('worldPosition' in anchor)); assert(!('distanceMeters' in anchor));
});

test('translation and scaling project each corner into normalized input image coordinates', () => {
  const anchor = projectImageAnchor([2, 0, 10, 0, 3, 20, 0, 0, 1], [10, 20, 40, 50], { width: 200, height: 300 });
  assert.deepEqual(anchor.polygon, [{ x: 0.15, y: 80 / 300 }, { x: 0.45, y: 80 / 300 }, { x: 0.45, y: 170 / 300 }, { x: 0.15, y: 170 / 300 }]);
  assert.deepEqual(anchor.center, { x: 0.3, y: 125 / 300 });
});

test('perspective center is the projected reference center, not the average of the corners', () => {
  const anchor = projectImageAnchor([1, 0, 0, 0, 1, 0, 0.01, 0, 1], [10, 20, 50, 60], { width: 100, height: 100 });
  approx(anchor.center.x, (30 / 1.3) / 100); approx(anchor.center.y, (40 / 1.3) / 100);
  const average = anchor.polygon.reduce((sum, point) => sum + point.x, 0) / 4;
  assert(Math.abs(anchor.center.x - average) > 0.001);
});

test('corner order follows the reference after rotation rather than being re-sorted on screen', () => {
  const anchor = projectImageAnchor([0, -1, 100, 1, 0, 0, 0, 0, 1], [10, 20, 40, 50], { width: 100, height: 100 });
  assert.deepEqual(anchor.polygon, [{ x: 0.8, y: 0.1 }, { x: 0.8, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.1 }]);
});

test('cropped input coordinates reflect the actual visible source and no CSS crop is guessed', () => {
  const anchor = projectImageAnchor([1, 0, -20, 0, 1, -10, 0, 0, 1], [30, 30, 70, 60], { width: 80, height: 100, sourceWidth: 320, sourceHeight: 400 });
  assert.deepEqual(anchor.center, { x: 30 / 80, y: 35 / 100 });
  assert.deepEqual(anchor.imageSize, { width: 320, height: 400 });
});

test('out of frame, mirrored and degenerate projections fail closed without clamping', () => {
  for (const h of [[1, 0, -50, 0, 1, 0, 0, 0, 1], [-1, 0, 100, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 0]]) {
    assert.equal(projectImageAnchor(h, [10, 20, 40, 50], { width: 100, height: 100 }), null);
  }
});

test('invalid input cannot produce a NaN or unbounded label position', () => {
  assert.equal(projectImageAnchor(identity, [10, 20, 40, 50]), null);
  assert.equal(projectImageAnchor([1, 0, 0], [10, 20, 40, 50], { width: 100, height: 100 }), null);
  assert.equal(projectImageAnchor([1, 0, 0, 0, 1, 0, 0, NaN, 1], [10, 20, 40, 50], { width: 100, height: 100 }), null);
  assert.equal(projectImageAnchor(identity, [40, 20, 10, 50], { width: 100, height: 100 }), null);
  assert.equal(projectImageAnchor(identity, [10, 20, 40, 50], { width: Infinity, height: 100 }), null);
  assert.equal(projectImageAnchor(identity, [10, 20, 40, 50], { width: 100, height: 100, sourceWidth: 0 }), null);
});
