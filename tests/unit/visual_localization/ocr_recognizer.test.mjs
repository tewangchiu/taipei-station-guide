import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OcrWeakCandidateRecognizer,
  extractTargetNodes,
} from '../../../src/features/visual_localization/ocr_recognizer.mjs';

test('extracts only the three approved node labels without retaining OCR text', () => {
  assert.deepEqual(extractTargetNodes('next: y 26 / Y23; unrelated Y99 and 128'), ['Y26', 'Y23']);
  assert.deepEqual(extractTargetNodes('Y280 Y2 Y 28'), ['Y28']);
});

test('lazy local OCR returns weak candidates and disables persistence cache', async () => {
  let creates = 0;
  let receivedOptions;
  let parameters;
  const fakeWorker = {
    async setParameters(value) { parameters = value; },
    async recognize(pixels) {
      assert.equal(pixels, 'canvas');
      return { data: { text: 'Y26 then Y 23', confidence: 99, private_text: 'discard' } };
    },
  };
  const recognizer = new OcrWeakCandidateRecognizer({
    loadTesseract: async () => ({ default: { createWorker: async (_lang, _oem, options) => {
      creates++;
      receivedOptions = options;
      return fakeWorker;
    } } }),
  });
  const result = await recognizer.recognize({ pixels: 'canvas', signal: new AbortController().signal });
  assert.equal(creates, 1);
  assert.equal(receivedOptions.cacheMethod, 'none');
  assert.equal(receivedOptions.workerBlobURL, false);
  assert.equal(parameters.tessedit_pageseg_mode, '11');
  assert.deepEqual(result, {
    status: 'candidates',
    candidates: [
      { node_id: 'Y26', score_type: 'ocr_weak_score', reason: 'weak_text_only' },
      { node_id: 'Y23', score_type: 'ocr_weak_score', reason: 'weak_text_only' },
    ],
    reason: 'weak_text_only',
  });
  assert.doesNotMatch(JSON.stringify(result), /private_text|confidence|discard/u);
});

test('no approved label is unknown and abort fails closed', async () => {
  const recognizer = new OcrWeakCandidateRecognizer({
    loadTesseract: async () => ({ createWorker: async () => ({
      async setParameters() {},
      async recognize() { return { data: { text: 'Exit West' } }; },
    }) }),
  });
  const result = await recognizer.recognize({ pixels: {}, signal: new AbortController().signal });
  assert.deepEqual(result, { status: 'unknown', candidates: [], reason: 'target_text_not_found' });
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(recognizer.recognize({ pixels: {}, signal: aborted.signal }), /cancelled/u);
});
