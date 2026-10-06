import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDimensions, previewDimensions } from '../../../src/features/visual_localization/decode.mjs';
function png(w,h) {
  const a = new Uint8Array(24); a.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const v = new DataView(a.buffer); v.setUint32(16,w); v.setUint32(20,h); return a.buffer;
}
test('dimensions are bounded before image decode and preview fits 960px', () => {
  assert.deepEqual(imageDimensions(png(4000,3000), 'image/png'), { width:4000, height:3000 });
  assert.deepEqual(imageDimensions(png(5712,4284), 'image/png'), { width:5712, height:4284 });
  assert.deepEqual(previewDimensions(4000,3000), { width:960, height:720 });
  assert.throws(() => imageDimensions(png(10000,10000), 'image/png'));
  assert.throws(() => imageDimensions(png(0,100), 'image/png'));
  assert.throws(() => imageDimensions(new ArrayBuffer(0), 'image/jpeg'));
});

import { decodePhoto } from '../../../src/features/visual_localization/decode.mjs';
function platformFixture(mode) {
  const revoked = []; const sources = [];
  const canvas = { width: 0, height: 0, setAttribute() {}, getContext() { return { drawImage() {} }; }, remove() {} };
  class Image {
    naturalWidth = 4000; naturalHeight = 3000;
    set src(value) {
      sources.push(value);
      if (mode === 'load') queueMicrotask(() => this.onload?.());
      if (mode === 'error') queueMicrotask(() => this.onerror?.());
    }
    removeAttribute() {}
  }
  return { revoked, sources, canvas, Image, URL: { createObjectURL() { return 'blob:transient'; }, revokeObjectURL(value) { revoked.push(value); } }, document: { createElement() { return canvas; } } };
}
const imageFile = { type: 'image/png', slice() { return { async arrayBuffer() { return png(4000,3000); } }; } };
test('decoder revokes original object URL on success and clears canvas when disposed', async () => {
  const platform = platformFixture('load');
  const result = await decodePhoto(imageFile, { signal: new AbortController().signal }, platform);
  assert.deepEqual(platform.revoked, ['blob:transient']);
  assert.equal(result.canvas.width, 960);
  result.dispose();
  assert.equal(result.canvas.width, 0);
  assert.equal(result.canvas.height, 0);
});
test('decoder error and abort both revoke URLs; oversized input creates no URL', async () => {
  const failed = platformFixture('error');
  await assert.rejects(decodePhoto(imageFile, { signal: new AbortController().signal }, failed));
  assert.deepEqual(failed.revoked, ['blob:transient']);
  const pending = platformFixture('pending');
  const job = new AbortController();
  const work = decodePhoto(imageFile, { signal: job.signal }, pending);
  await new Promise(resolve => setImmediate(resolve));
  job.abort();
  await assert.rejects(work);
  assert.deepEqual(pending.revoked, ['blob:transient']);
  const oversized = platformFixture('load');
  await assert.rejects(decodePhoto({ type:'image/png', slice() { return { async arrayBuffer() { return png(9000,9000); } }; } }, { signal: new AbortController().signal }, oversized));
  assert.equal(oversized.sources.length,0);
});
test('JPEG SOF dimensions and malformed segment bounds are checked before decode', () => {
  const jpeg = new Uint8Array([255,216,255,192,0,11,8,11,184,15,160,1,1,17,0]);
  assert.deepEqual(imageDimensions(jpeg.buffer,'image/jpeg'), { width:4000,height:3000 });
  assert.throws(() => imageDimensions(jpeg.slice(0,10).buffer,'image/jpeg'));
  assert.throws(() => imageDimensions(jpeg.buffer,'image/png'));
});
