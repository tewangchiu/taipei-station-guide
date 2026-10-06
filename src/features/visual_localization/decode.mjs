const MAX_PIXELS = 26_000_000;
function bounded(width, height) {
  if (!width || !height || width * height > MAX_PIXELS || Math.max(width, height) > 12000) throw new Error('dimensions');
  return { width, height };
}

// Inspect at most 256 KiB before allocating a decoded image. Unsupported containers fail closed.
export function imageDimensions(buffer, type) {
  const v = new DataView(buffer);
  if (type === 'image/png' && v.byteLength >= 24
    && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a
    && v.getUint32(8) === 13 && v.getUint32(12) === 0x49484452) {
    return bounded(v.getUint32(16), v.getUint32(20));
  }
  if (type === 'image/jpeg' && v.byteLength >= 4 && v.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= v.byteLength) {
      if (v.getUint8(offset++) !== 0xff) break;
      while (offset < v.byteLength && v.getUint8(offset) === 0xff) offset++;
      if (offset + 3 > v.byteLength) break;
      const marker = v.getUint8(offset++);
      if (marker === 0xda || marker === 0xd9) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > v.byteLength) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        return bounded(v.getUint16(offset + 5), v.getUint16(offset + 3));
      }
      offset += length;
    }
  }
  throw new Error('unsupported image header');
}

export function previewDimensions(width, height) {
  bounded(width, height);
  const ratio = Math.min(1, 960 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export async function decodePhoto(file, { signal }, platform = globalThis) {
  let header = await file.slice(0, 256 * 1024).arrayBuffer();
  imageDimensions(header, file.type);
  header = null;
  if (signal.aborted) throw new Error('cancelled');
  let image = new platform.Image();
  let url = platform.URL.createObjectURL(file);
  file = null;
  let canvas;
  let onAbort;
  let timeout;
  try {
    await new Promise((resolve, reject) => {
      onAbort = () => {
        image.removeAttribute('src');
        if (url) platform.URL.revokeObjectURL(url);
        url = null;
        reject(new Error('cancelled'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      image.onload = resolve;
      image.onerror = () => reject(new Error('decode failed'));
      timeout = setTimeout(() => reject(new Error('decode timeout')), 15000);
      image.src = url;
    });
    if (signal.aborted) throw new Error('cancelled');
    const size = previewDimensions(image.naturalWidth, image.naturalHeight);
    canvas = platform.document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '本次照片的暫存預覽；不是定位結果');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(image, 0, 0, size.width, size.height);
    const previewCanvas = canvas;
    return {
      canvas: previewCanvas,
      dispose() { previewCanvas.width = 0; previewCanvas.height = 0; previewCanvas.remove(); },
    };
  } catch {
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas.remove(); }
    throw new Error('photo unavailable');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    image = null;
    if (url) platform.URL.revokeObjectURL(url);
    url = null;
  }
}
