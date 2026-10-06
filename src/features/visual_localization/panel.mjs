import { PhotoCapture } from './capture.mjs';
import { decodePhoto } from './decode.mjs';

const messages = {
  idle: '拍攝只提供暫存預覽。拍照完成不是定位完成，請仍以現場固定牆標人工確認。',
  decoding: '正在本機解碼；可隨時清除或中止。',
  unavailable: '尚未啟用辨識／無法提供位置候選。請回到上方，以現場固定牆標人工確認。',
  invalid: '未保留照片。請選擇 12 MiB 以下的 JPEG 或 PNG；HEIC 尚未支援。',
  decode_error: '無法解碼或影像超過限制，未保留照片。請重拍較小的 JPEG／PNG，或使用人工確認。',
  recognizing: '正在處理候選；目前位置與步驟不會改變。',
  unknown: '無法提供位置候選。請以現場固定牆標人工確認。',
  recognizer_error: '辨識未完成，已清除照片。請使用人工確認。',
};

export function mountPhotoPanel(elements, { controller = new PhotoCapture({ decode: decodePhoto }), page = globalThis } = {}) {
  const { input, take, clear, status, preview } = elements;
  let disabled = false;
  let expectedNodeId = null;
  function render() {
    preview.replaceChildren(...(controller.preview ? [controller.preview.canvas] : []));
    if (controller.status === 'candidates') {
      const candidateIds = controller.candidates.map(item => item.node_id);
      if (expectedNodeId && !candidateIds.includes(expectedNodeId)) {
        status.textContent = `目前應找 ${expectedNodeId} 固定牆標，但只讀到弱候選：${candidateIds.join('、')}。不符合目前目標，可能來自方向牌；請不要確認，改用低信心、走錯或清除照片。`;
      } else {
        const matchText = expectedNodeId ? `其中包含目前目標 ${expectedNodeId}；` : '';
        status.textContent = `讀到的弱候選：${candidateIds.join('、')}。${matchText}這仍可能來自方向牌，不代表你位於該處；請親自比對固定牆標後，再使用上方的人工確認按鈕。`;
      }
    } else {
      const targetText = expectedNodeId && ['idle', 'unknown', 'unavailable'].includes(controller.status)
        ? `目前應找 ${expectedNodeId} 固定牆標。`
        : '';
      status.textContent = `${targetText}${messages[controller.status] ?? messages.unknown}`;
    }
    take.disabled = disabled;
  }
  function reset(nextDisabled = disabled) {
    disabled = nextDisabled;
    input.value = '';
    controller.clear();
    render();
  }
  take.addEventListener('click', () => {
    if (disabled) return;
    reset(); // Clear BEFORE opening picker, including browsers without a cancel event.
    input.click();
  });
  input.addEventListener('cancel', () => reset());
  input.addEventListener('change', async () => {
    if (disabled) { reset(); return; }
    let file = input.files?.[0] ?? null;
    input.value = '';
    const pending = controller.select(file);
    file = null;
    render();
    await pending;
    render();
  });
  clear.addEventListener('click', () => reset());
  page.addEventListener('pagehide', () => reset());
  render();
  return {
    reset,
    setExpectedNode(nodeId) {
      expectedNodeId = typeof nodeId === 'string' ? nodeId : null;
      render();
    },
  };
}
