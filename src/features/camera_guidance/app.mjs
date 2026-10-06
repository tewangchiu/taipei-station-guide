import { routePlan, routeMapSummary } from './route_map.mjs';
import { coverLayout, projectAnchor, visibleObservation, overlayLifetime, labelPlacement } from './overlay.mjs';
import { loadCameraRoute, decodeVerifiedImage } from './route_package.mjs';
import { createSession, transition, expectedNode, walkingSummary, NODES } from './session.mjs';
import { CameraSource } from './camera.mjs';
import { createLandmarkRecognizer, RECOGNIZER_VERSION } from './recognizer.mjs';
import { createEvidenceState, evaluateObservation, POLICY_VERSION } from './policy.mjs';
const $ = id => document.getElementById(id);
const ASSETS = { Y28: '/camera/assets/Y28.png', Y26: '/camera/assets/Y26.png', Y23: '/camera/assets/Y23.png', direction: '/camera/assets/direction.png', unknown: '/camera/assets/unknown.png' };
const REPLAY = [{ scene: 'unknown', duration: 2200 }, { scene: 'Y28', duration: 4000 }, { scene: 'direction', duration: 3300 }, { scene: 'Y26', duration: 4200 }, { scene: 'unknown', duration: 2600 }, { scene: 'Y23', duration: 4600 }];
let routePackage = null, session = null, evidence = createEvidenceState(), engine = null, loading = null, assets = {}, running = false, generation = 0, frameId = 0, timer = null, scene = 'unknown', replayIndex = 0, replaySince = 0, replaySelection = 'auto', errors = 0, observations = 0, rejections = 0, feedback = '', manualTarget = null, lastVideoTime = -1, reasonCounts = {};
let overlayTimer = null, inputRevision = 0;
const camera = new CameraSource($('camera-video'));
const canvas = $('frame');
const context = canvas.getContext('2d', { willReadFrequently: true });
function showFeedback(message) { if (feedback !== message) { feedback = message; $('scan-feedback').textContent = message; } }
async function loadOpenCV() {
  if (!globalThis.cv) await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/camera/vendor/opencv-4.13.0.js';
    script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('MODEL_LOAD_FAILED')); }; document.head.append(script);
  });
  if (globalThis.cv?.Mat) return { runtime: globalThis.cv };
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + 30000;
    const poll = setInterval(() => { if (globalThis.cv?.Mat) { clearInterval(poll); resolve({ runtime: globalThis.cv }); } else if (performance.now() > deadline) { clearInterval(poll); reject(new Error('MODEL_LOAD_FAILED')); } }, 50);
  });
}
async function prepare() {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    const [{ runtime: cv }, route] = await Promise.all([loadOpenCV(), loadCameraRoute()]);
    const images = await Promise.all(Object.entries(ASSETS).map(async ([id, url]) => [id, await decodeVerifiedImage(url, route.nodes.find(node => node.nodeId === id)?.sha256)]));
    routePackage = route; assets = Object.fromEntries(images);
    engine = await createLandmarkRecognizer({ cv, references: route.nodes.map(node => ({ nodeId: node.nodeId, source: assets[node.nodeId], roi: node.roi })) });
    return engine;
  })();
  try { return await loading; } finally { loading = null; }
}
function render() {
  if (!session) return;
  const target = expectedNode(session), completed = session.status === 'completed';
  const paused = ['paused', 'error', 'stopped'].includes(session.status);
  $('source-chip').hidden = session.source !== 'replay';
  $('source-description').textContent = session.source === 'replay' ? '示範將已核准的參考照片送入相同辨識流程。照片依牆標位置取景，進度仍由像素辨識決定；不代表現場測試結果。' : '相機影像僅在裝置記憶體處理，不錄音、不儲存、不上傳。';
  $('instruction-title').textContent = paused ? (session.status === 'error' ? '相機還沒準備好' : '導引已暫停') : session.index < 0 ? '找 Y28 牆標' : session.index === 0 ? '往 Y26 前進' : '往 Y23 前進';
  $('instruction-detail').textContent = paused ? (session.status === 'error' ? '重試開啟，或從右上角查看協助' : '進度已保留，準備好就繼續') : session.index < 0 ? '將牆標與周圍環境放進畫面' : session.index === 0 ? '面向 Y28 牆標，向右回主走廊' : '面向 Y26 牆標，向左回主走廊，別轉入出口';
  $('direction-icon').textContent = paused ? 'Ⅱ' : session.index < 0 ? '◎' : session.index === 0 ? '↱' : '↰';
  $('route-map').innerHTML = routePlan(session);
  $('mini-map').innerHTML = routePlan(session, { compact: true });
  $('map-location').textContent = routeMapSummary(session);
  $('progress-value').textContent = `${session.index + 1} / 3`;
  $('time-value').textContent = walkingSummary(session).time;
  $('time-value').hidden = paused;
  $('arrival').hidden = !completed; $('guidance').hidden = completed; $('recovery').hidden = completed; $('replay-controls').hidden = session.source !== 'replay' || completed;
  $('pause').hidden = completed || paused; $('resume').hidden = completed || !paused; $('pause').disabled = !running; $('resume').disabled = false;
  $('manual').disabled = !target || session.status === 'ready';
  if (session.status === 'error') $('recovery').open = true;
  const manualCount = session.events.filter(event => event.evidenceSource === 'manual_fallback').length;
  $('arrival-title').textContent = session.events.at(-1)?.evidenceSource === 'manual_fallback' ? '已確認終點 Y23' : '找到終點 Y23';
  $('arrival-description').textContent = manualCount ? `路線完成 · ${manualCount} 個地標由你確認` : '這段路線完成了';
  if (target) { $('target-photo').src = ASSETS[target]; $('target-photo').alt = `${target} 固定牆標參考照片`; $('manual').textContent = `改用人工確認 ${target}`; }
}
function clearOverlay() {
  clearTimeout(overlayTimer);
  $('landmark-overlay').hidden = true; $('landmark-outline').setAttribute('hidden', '');
}
function imageLayout(input) {
  const width = input.videoWidth || input.naturalWidth, height = input.videoHeight || input.naturalHeight;
  const box = $('viewfinder').getBoundingClientRect();
  const node = session.source === 'replay' ? routePackage?.nodes.find(node => node.nodeId === scene) : null;
  const focusX = node ? (node.roi[0] + node.roi[2]) / (2 * width) : .5;
  const layout = coverLayout(width, height, box.width, box.height, focusX);
  const display = session.source === 'camera' ? $('camera-video') : $('replay-image');
  if (layout) display.style.objectPosition = `${layout.positionX}% ${layout.positionY}%`;
  return layout;
}
function drawOverlay(result, layout, confirmed, capturedAtMs) {
  clearOverlay();
  const projected = projectAnchor(result.anchor, layout);
  if (!result.accepted || !projected?.visible || !overlayLifetime(capturedAtMs, performance.now())) return;
  const { polygon } = projected;
  const label = $('landmark-overlay');
  // The renderer accepts a display label independently of node identifiers.
  $('landmark-name').textContent = result.label || result.nodeId;
  $('landmark-state').textContent = confirmed ? '找到了' : '看到地標';
  label.dataset.state = confirmed ? 'found' : 'seen'; label.dataset.node = result.nodeId;
  label.hidden = false;
  const placement = labelPlacement(polygon, layout, { width: label.offsetWidth, height: label.offsetHeight }, document.querySelector('.bottom-stack').getBoundingClientRect());
  label.hidden = !placement;
  if (placement) { label.dataset.placement = placement.placement; label.style.left = `${placement.x}px`; label.style.top = `${placement.y}px`; }
  $('landmark-polygon').setAttribute('points', polygon.map(point => `${point.x},${point.y}`).join(' '));
  $('landmark-outline').removeAttribute('hidden');
  overlayTimer = setTimeout(clearOverlay, overlayLifetime(capturedAtMs, performance.now()));
}
function stopInput() { clearOverlay(); running = false; generation += 1; clearTimeout(timer); camera.stop(); lastVideoTime = -1; canvas.width = 1; canvas.height = 1; evidence = createEvidenceState(); }
function pause(reason = '') {
  stopInput(); if (session) session = transition(session, { type: 'pause', sessionId: session.sessionId });
  $('manual-dialog').close(); $('tools-dialog').close(); showFeedback(reason); render();
}
function reset() { stopInput(); session = null; manualTarget = null; canvas.width = 1; canvas.height = 1; $('replay-image').removeAttribute('src'); $('welcome').hidden = false; $('journey').hidden = true; $('manual-dialog').close(); $('diagnostic-dialog').close(); $('tools-dialog').close(); $('route-dialog').close(); document.body.classList.remove('navigating'); window.scrollTo(0, 0); }
function errorMessage(error) {
  if (error.name === 'NotAllowedError') return '相機權限尚未開啟。請在瀏覽器允許相機後重試，或回入口使用照片示範。';
  if (error.name === 'NotFoundError') return '找不到可用相機。可回到入口使用照片示範。';
  if (error.name === 'NotReadableError') return '相機可能正被其他程式使用，關閉後再試。';
  if (error.message === 'SECURE_CONTEXT_REQUIRED') return '即時相機需要 HTTPS 或本機 localhost。此網址可先使用照片示範。';
  return '相機或辨識資料未能載入，請重試；照片和地圖仍可查看。';
}
async function run(source, resume = false) {
  stopInput();
  if (!resume) { session = createSession(crypto.randomUUID(), source); observations = 0; errors = 0; rejections = 0; reasonCounts = {}; frameId = 0; replayIndex = 0; replaySelection = 'auto'; $('scene').value = 'auto'; $('recovery').open = false; scene = 'unknown'; }
  // New observation identity on every resume prevents stale-frame reuse.
  if (resume) session = { ...session, sessionId: crypto.randomUUID() };
  const mine = generation;
  if (source === 'replay') $('replay-image').removeAttribute('src');
  $('welcome').hidden = true; $('journey').hidden = false; document.body.classList.add('navigating'); $('camera-video').hidden = source !== 'camera'; $('replay-image').hidden = source !== 'replay';
  render(); $('resume').disabled = true; showFeedback('正在準備…');
  if (!resume) window.scrollTo(0, 0);
  try {
    // Request permission in direct response to the button, before lengthy model load.
    const cameraReady = source === 'camera' ? camera.start() : Promise.resolve(true);
    const [, ready] = await Promise.all([prepare(), cameraReady]);
    if (mine !== generation || !ready) return;
    if (source === 'camera') camera.stream.getVideoTracks().forEach(track => { for (const event of ['ended', 'mute']) track.addEventListener(event, () => { if (running) pause('相機已中斷，請重新開啟辨識。'); }, { once: true }); });
    session = transition(session, { type: 'start', sessionId: session.sessionId });
    running = true; replaySince = performance.now(); evidence = createEvidenceState(); render(); showFeedback(''); tick(mine);
  } catch (error) { if (mine !== generation) return; errors += 1; stopInput(); session = transition(session, { type: 'error', sessionId: session.sessionId }); showFeedback(errorMessage(error)); render(); }
}
async function replaySource(now) {
  if (replaySelection === 'auto') {
    if (now - replaySince >= REPLAY[replayIndex].duration && replayIndex < REPLAY.length - 1) { replayIndex += 1; replaySince = now; }
    scene = REPLAY[replayIndex].scene;
  } else scene = replaySelection;
  if ($('replay-image').getAttribute('src') !== ASSETS[scene]) { clearOverlay(); $('replay-image').src = ASSETS[scene]; }
  // A matching URL does not prove the displayed pixels decoded successfully.
  await $('replay-image').decode();
  $('replay-stage').textContent = replaySelection === 'auto' ? `自動播放 ${replayIndex + 1} / ${REPLAY.length}` : '手動切換測試畫面';
  return assets[scene];
}
async function tick(mine) {
  if (!running || mine !== generation) return;
  const now = performance.now(), revision = inputRevision;
  try {
    const input = session.source === 'camera' ? $('camera-video') : await replaySource(now);
    if (!running || mine !== generation) return;
    if (revision !== inputRevision) { timer = setTimeout(() => tick(mine), 0); return; }
    const width = input.videoWidth || input.naturalWidth, height = input.videoHeight || input.naturalHeight;
    if (!width || !height) { showFeedback('等待相機畫面…'); timer = setTimeout(() => tick(mine), 450); return; }
    if (session.source === 'camera') {
      if (input.currentTime <= lastVideoTime) { showFeedback('等待新的相機畫面…'); timer = setTimeout(() => tick(mine), 450); return; }
      lastVideoTime = input.currentTime;
    }
    // Native dimensions keep ROI coordinates unambiguous; recognizer owns bounded resize.
    const capturedAtMs = performance.now();
    canvas.width = width; canvas.height = height; context.drawImage(input, 0, 0, width, height);
    let result = await engine.recognize(canvas);
    const layout = imageLayout(input);
    if (!running || mine !== generation) return;
    if (revision !== inputRevision) { clearOverlay(); timer = setTimeout(() => tick(mine), 0); return; }
    observations += 1;
    result = visibleObservation(result, layout);
    const observation = { ...result, capturedAtMs, sessionId: session.sessionId, frameId: ++frameId };
    const judged = evaluateObservation(evidence, observation, { expectedNodeId: expectedNode(session), nowMs: performance.now() });
    evidence = judged.state;
    drawOverlay(result, layout, judged.decision === 'accepted' || session.events.some(event => event.nodeId === result.nodeId), capturedAtMs);
    if (judged.decision === 'accepted') {
      const nodeId = expectedNode(session);
      session = transition(session, { type: 'advance', sessionId: session.sessionId, nodeId, evidenceSource: 'vision_experimental', decision: 'accepted' });
      evidence = createEvidenceState(); showFeedback(''); render();
      if (session.status === 'completed') { stopInput(); canvas.width = 1; canvas.height = 1; $('tools-dialog').close(); $('route-dialog').close(); render(); return; }
    } else if (judged.decision === 'stabilizing') showFeedback('保持鏡頭穩定');
    else {
      rejections += 1; reasonCounts[judged.reason] = (reasonCounts[judged.reason] ?? 0) + 1;
      if (result.accepted && result.nodeId !== expectedNode(session) && !session.events.some(event => event.nodeId === result.nodeId)) showFeedback(`先找 ${expectedNode(session)}`);
      else showFeedback('');
    }
    timer = setTimeout(() => tick(mine), 450);
  } catch (error) {
    if (mine !== generation) return;
    if (revision !== inputRevision) { clearOverlay(); timer = setTimeout(() => tick(mine), 0); return; }
    errors += 1; stopInput(); session = transition(session, { type: 'error', sessionId: session.sessionId }); showFeedback(errorMessage(error)); render();
  }
}
function diagnostics() {
  return { schemaVersion: 'camera-prototype-diagnostic-v1', prototype: true, versions: { app: 'camera-overlay-v1', recognizer: RECOGNIZER_VERSION, policy: POLICY_VERSION, route: 'y28-y26-y23.prototype-v1', references: 'run_01_manual_v1' }, inputSource: session.source, status: session.status,
    recognizedNodes: session.index + 1, observations, rejectedObservations: rejections, reasonCounts: { ...reasonCounts }, runtimeErrors: errors,
    events: session.events, claims: { fieldValidated: false, independentAccuracyVerified: false, navigationReady: false, imagesStored: false, imagesUploaded: false } };
}
let mapKind='route',zoomIndex=0;
const zoomLevels=[1,1.5,2,3];
function setZoom(index) {
 zoomIndex=Math.max(0,Math.min(zoomLevels.length-1,index));const zoom=zoomLevels[zoomIndex];
 $('map-content').style.width=`${zoom*100}%`;$('map-content').dataset.zoom=String(zoom);$('map-zoom-value').textContent=`${zoom*100}%`;
 $('map-zoom-out').disabled=zoomIndex===0;$('map-zoom-in').disabled=zoomIndex===zoomLevels.length-1;
 if(!zoomIndex){$('map-viewport').scrollTop=0;$('map-viewport').scrollLeft=0;}
}
function loadStationMap() {
 $('station-map-fallback').hidden=true;$('map-viewport').hidden=false;$('station-map-svg').dataset.loaded='false';
 $('station-map-image').setAttribute('href',`/references/official-b1-map-2019.png?retry=${Date.now()}`);
}
function showMap(kind) {
 mapKind=kind;const station=kind==='station';
 $('show-route-plan').setAttribute('aria-pressed',String(!station));$('show-station-plan').setAttribute('aria-pressed',String(station));
 $('route-map').hidden=station;$('station-plan').hidden=!station;$('station-map-options').hidden=!station;
 $('station-map-fallback').hidden=true;$('map-viewport').hidden=false;
 $('map-footnote').textContent=station?'2019 官方圖供區域對照；圖內「現在位置」是原看板的位置，並非你的定位。':'菱形標示上次更新的地標；路線未按實際比例繪製。';
 setZoom(0);if(station)loadStationMap();
}
$('show-route-plan').addEventListener('click',()=>showMap('route'));
$('show-station-plan').addEventListener('click',()=>showMap('station'));
$('station-map-region').addEventListener('change',event=>{
 const full=event.target.value==='full';$('station-map-svg').setAttribute('viewBox',full?'0 0 2500 1669':'210 430 630 400');
 $('station-map-svg').setAttribute('aria-label',`2019年${full?'完整':'西側Y區'}車站平面圖；圖上現在位置屬於原看板`);setZoom(0);
});
$('station-map-image').addEventListener('load',()=>{$('station-map-svg').dataset.loaded='true';});
$('station-map-image').addEventListener('error',()=>{if(mapKind==='station'){$('station-map-fallback').hidden=false;$('map-viewport').hidden=true;$('station-map-svg').dataset.loaded='false';}});
$('station-map-retry').addEventListener('click',loadStationMap);
$('map-zoom-in').addEventListener('click',()=>setZoom(zoomIndex+1));
$('map-zoom-out').addEventListener('click',()=>setZoom(zoomIndex-1));
$('map-reset').addEventListener('click',()=>setZoom(0));
$('start-camera').addEventListener('click', () => run('camera'));
$('start-replay').addEventListener('click', () => run('replay'));
$('open-route').addEventListener('click', () => { showMap('route'); $('route-dialog').showModal(); });
$('close-route').addEventListener('click', () => $('route-dialog').close());
$('open-tools').addEventListener('click', () => $('tools-dialog').showModal());
$('close-tools').addEventListener('click', () => $('tools-dialog').close());
$('pause').addEventListener('click', () => pause());
$('resume').addEventListener('click', () => { $('tools-dialog').close(); run(session.source, true); });
$('end').addEventListener('click', reset); $('restart').addEventListener('click', reset);
$('scene').addEventListener('change', event => { inputRevision += 1; clearOverlay(); replaySelection = event.target.value; replayIndex = 0; replaySince = performance.now(); evidence = createEvidenceState(); });
$('manual').addEventListener('click', () => {
  manualTarget = expectedNode(session); pause('');
  $('manual-description').textContent = `目前等待的是 ${manualTarget}。`;
  $('manual-photo').src = ASSETS[manualTarget]; $('manual-dialog').showModal();
});
$('cancel-manual').addEventListener('click', () => { $('manual-dialog').close(); manualTarget = null; });
$('confirm-manual').addEventListener('click', () => {
  if (!session || manualTarget !== expectedNode(session)) return;
  session = transition(session, { type: 'start', sessionId: session.sessionId });
  session = transition(session, { type: 'advance', sessionId: session.sessionId, nodeId: manualTarget, evidenceSource: 'manual_fallback' });
  if (session.status !== 'completed') session = transition(session, { type: 'pause', sessionId: session.sessionId });
  manualTarget = null; $('manual-dialog').close(); showFeedback(''); render();
});
$('diagnostics').addEventListener('click', () => { $('diagnostic-json').textContent = JSON.stringify(diagnostics(), null, 2); $('diagnostic-dialog').showModal(); });
$('close-diagnostics').addEventListener('click', () => $('diagnostic-dialog').close());
$('export-diagnostics').addEventListener('click', () => { const blob = new Blob([$('diagnostic-json').textContent], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'taipei-camera-test.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
document.addEventListener('visibilitychange', () => { if (document.hidden && session && session.status !== 'completed') pause('相機已停止，準備好就繼續'); });
window.addEventListener('pagehide', () => { stopInput(); canvas.width = 1; canvas.height = 1; });

window.addEventListener('resize', () => { inputRevision += 1; clearOverlay(); if (running && session) imageLayout(session.source === 'camera' ? $('camera-video') : assets[scene]); });
