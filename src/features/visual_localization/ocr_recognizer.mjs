const TARGET_NODES = Object.freeze(['Y28', 'Y26', 'Y23']);

function extractTargetNodes(text) {
  const normalized = String(text ?? '').toUpperCase();
  const found = new Set();
  for (const match of normalized.matchAll(/Y\s*(23|26|28)(?!\d)/gu)) {
    found.add(`Y${match[1]}`);
  }
  return TARGET_NODES.filter(nodeId => found.has(nodeId));
}

export class OcrWeakCandidateRecognizer {
  constructor({
    loadTesseract = () => import('/vendor/tesseract/tesseract.esm.min.js'),
    workerOptions = {},
  } = {}) {
    this.loadTesseract = loadTesseract;
    this.workerOptions = workerOptions;
    this.workerPromise = null;
  }

  async #worker() {
    if (!this.workerPromise) {
      this.workerPromise = this.loadTesseract().then(async (module) => {
        const createWorker = module.createWorker ?? module.default?.createWorker;
        if (typeof createWorker !== 'function') throw new Error('OCR runtime unavailable');
        const worker = await createWorker('eng', 1, {
          workerPath: '/vendor/tesseract/worker.min.js',
          corePath: '/vendor/tesseract-core',
          langPath: '/vendor/tessdata',
          cacheMethod: 'none',
          workerBlobURL: false,
          ...this.workerOptions,
        });
        await worker.setParameters({
          tessedit_char_whitelist: 'Yy0123456789',
          tessedit_pageseg_mode: '11',
        });
        return worker;
      }).catch((error) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async recognize({ pixels, signal }) {
    if (signal?.aborted) throw new Error('cancelled');
    const worker = await this.#worker();
    if (signal?.aborted) throw new Error('cancelled');
    const result = await worker.recognize(pixels);
    if (signal?.aborted) throw new Error('cancelled');
    const nodeIds = extractTargetNodes(result?.data?.text);
    return {
      status: nodeIds.length ? 'candidates' : 'unknown',
      candidates: nodeIds.map(node_id => ({
        node_id,
        score_type: 'ocr_weak_score',
        reason: 'weak_text_only',
      })),
      reason: nodeIds.length ? 'weak_text_only' : 'target_text_not_found',
    };
  }
}

export function createOcrWeakCandidateRecognizer(options) {
  const instance = new OcrWeakCandidateRecognizer(options);
  return instance.recognize.bind(instance);
}

export { extractTargetNodes };
