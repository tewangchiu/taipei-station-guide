import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPhotoPanel } from '../../../src/features/visual_localization/panel.mjs';
class Element extends EventTarget {
  constructor() { super(); this.value = ''; this.disabled = false; this.textContent = ''; this.children = []; }
  replaceChildren(...children) { this.children = children; }
  click() { this.dispatchEvent(new Event('click')); }
}
test('explicit capture, cancellation, page leave, abort and restart clear the panel', async () => {
  const elements = Object.fromEntries(['input','take','clear','status','preview'].map(k => [k, new Element()]));
  const page = new EventTarget(); let clears = 0;
  const controller = { status: 'idle', preview: null, candidates: [], clear() { clears++; this.preview=null; this.status='idle'; }, async select() { this.status='unavailable'; this.preview={canvas:{}}; } };
  const panel = mountPhotoPanel(elements, { controller, page });
  panel.setExpectedNode('Y28');
  assert.match(elements.status.textContent, /目前應找 Y28 固定牆標/);
  elements.take.click(); assert.equal(clears, 1);
  elements.input.files = [{}]; elements.input.dispatchEvent(new Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(elements.status.textContent, /尚未啟用辨識/);
  elements.input.dispatchEvent(new Event('cancel')); assert.equal(elements.preview.children.length,0);
  page.dispatchEvent(new Event('pagehide')); assert.equal(controller.preview,null);
  panel.reset(true); assert.equal(elements.take.disabled,true);
  panel.reset(false); assert.equal(elements.take.disabled,false);
});

test('candidate message distinguishes matching target from a conflicting sign', () => {
  const elements = Object.fromEntries(['input','take','clear','status','preview'].map(k => [k, new Element()]));
  const page = new EventTarget();
  const controller = {
    status: 'candidates',
    preview: null,
    candidates: [{ node_id: 'Y26' }],
    clear() { this.status = 'idle'; this.candidates = []; },
    async select() {},
  };
  const panel = mountPhotoPanel(elements, { controller, page });
  panel.setExpectedNode('Y28');
  controller.status = 'candidates';
  controller.candidates = [{ node_id: 'Y26' }];
  panel.setExpectedNode('Y28');
  assert.match(elements.status.textContent, /不符合目前目標/);
  assert.match(elements.status.textContent, /請不要確認/);
  panel.setExpectedNode('Y26');
  assert.match(elements.status.textContent, /包含目前目標 Y26/);
  assert.match(elements.status.textContent, /仍可能來自方向牌/);
});
