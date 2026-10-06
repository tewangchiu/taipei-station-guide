export async function runOcrSelfTest({ recognizer, platform = globalThis }) {
  if (typeof recognizer !== 'function') throw new Error('OCR recognizer unavailable');
  const canvas = platform.document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = 'bold 360px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Y26', canvas.width / 2, canvas.height / 2);
    const result = await recognizer({
      pixels: canvas,
      signal: new AbortController().signal,
    });
    return result?.status === 'candidates'
      && result.candidates?.length === 1
      && result.candidates[0]?.node_id === 'Y26';
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove?.();
  }
}
