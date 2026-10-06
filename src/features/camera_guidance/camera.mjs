// Only called after an explicit Start/Resume action. No audio or persistence.
export class CameraSource {
  constructor(video, mediaDevices = globalThis.navigator?.mediaDevices) {
    this.video = video; this.mediaDevices = mediaDevices; this.generation = 0; this.stream = null;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!globalThis.isSecureContext || !this.mediaDevices?.getUserMedia) throw new Error('SECURE_CONTEXT_REQUIRED');
    const stream = await this.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
    this.stream = stream; this.video.srcObject = stream;
    try { await this.video.play(); } catch (error) { if (generation === this.generation) this.stop(); throw error; }
    if (generation !== this.generation) return false;
    return true;
  }
  stop() {
    this.generation += 1;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
  }
}
