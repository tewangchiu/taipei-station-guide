import test from 'node:test';
import assert from 'node:assert/strict';
import { runOcrSelfTest } from '../../../src/features/visual_localization/ocr_diagnostic.mjs';

function platformFixture() {
  const canvas = {
    width: 0,
    height: 0,
    removed: false,
    getContext() {
      return {
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        fillRect() {},
        fillText(text) { assert.equal(text, 'Y26'); },
      };
    },
    remove() { this.removed = true; },
  };
  return { canvas, document: { createElement: () => canvas } };
}

test('OCR self-test accepts only the expected weak Y26 candidate and clears canvas', async () => {
  for (const [result, expected] of [
    [{ status: 'candidates', candidates: [{ node_id: 'Y26' }] }, true],
    [{ status: 'unknown', candidates: [] }, false],
    [{ status: 'candidates', candidates: [{ node_id: 'Y28' }] }, false],
  ]) {
    const platform = platformFixture();
    const passed = await runOcrSelfTest({
      platform,
      recognizer: async ({ pixels, signal }) => {
        assert.equal(pixels, platform.canvas);
        assert.equal(signal.aborted, false);
        return result;
      },
    });
    assert.equal(passed, expected);
    assert.equal(platform.canvas.width, 0);
    assert.equal(platform.canvas.height, 0);
    assert.equal(platform.canvas.removed, true);
  }
});
