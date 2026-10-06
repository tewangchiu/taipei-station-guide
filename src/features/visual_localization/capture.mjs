// Owns transient browser resources only; deliberately has no navigation/session reference.
export class PhotoCapture {
  constructor({ decode, recognizer = null, allowedNodeIds = [] }) {
    this.decode = decode;
    this.recognizer = recognizer;
    this.allowedNodeIds = new Set(allowedNodeIds);
    this.preview = null;
    this.candidates = [];
    this.status = 'idle';
  }
  clear() {
    this.job?.abort();
    this.job = null;
    this.preview?.dispose();
    this.preview = null;
    this.status = 'idle';
    this.candidates = [];
  }
  async select(file) {
    this.clear();
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || !Number.isFinite(file.size) || file.size <= 0 || file.size > 12 * 1024 * 1024) {
      this.status = 'invalid';
      return;
    }
    const job = this.job = new AbortController();
    this.status = 'decoding';
    try {
      const preview = await this.decode(file, { signal: job.signal });
      file = null;
      if (job.signal.aborted) { preview.dispose(); return; }
      this.preview = preview;
      this.status = 'unavailable';
      if (!this.recognizer) return;
      this.status = 'recognizing';
      try {
        const result = await this.recognizer({ pixels: preview.canvas, signal: job.signal });
        if (job.signal.aborted) return;
        const candidates = result?.candidates;
        if (!['candidates', 'unknown'].includes(result?.status)
          || !Array.isArray(candidates)
          || (result.status === 'candidates') !== (candidates.length > 0)
          || candidates.length > this.allowedNodeIds.size
          || candidates.some(item => !this.allowedNodeIds.has(item?.node_id)
            || item?.score_type !== 'ocr_weak_score'
            || item?.reason !== 'weak_text_only')) {
          this.status = 'unknown';
          return;
        }
        this.candidates = [...new Set(candidates.map(item => item.node_id))]
          .map(node_id => ({ node_id, score_type: 'ocr_weak_score', reason: 'weak_text_only' }));
        this.status = this.candidates.length ? 'candidates' : 'unknown';
      } catch {
        if (!job.signal.aborted) {
          this.preview?.dispose();
          this.preview = null;
          this.status = 'recognizer_error';
        }
      }
    } catch {
      if (!job.signal.aborted) this.status = 'decode_error';
    } finally {
      file = null;
    }
  }
}
