import { mountPhotoPanel } from "../visual_localization/panel.mjs";
import { PhotoCapture } from "../visual_localization/capture.mjs";
import { decodePhoto } from "../visual_localization/decode.mjs";
import { createOcrWeakCandidateRecognizer } from "../visual_localization/ocr_recognizer.mjs";
import { runOcrSelfTest } from "../visual_localization/ocr_diagnostic.mjs";
import { ManualVisualSession } from "./session.mjs";
import { LANDMARKS, renderRouteOverview, landmarkMarkup, handleLandmarkError } from "./route_view.mjs";

import { renderRouteMap, handleOfficialMapError } from "./route_map.mjs";

const FIXTURE_URL = "/data/mvp/route_y28_y26_y23.manual-v1.json";
const app = document.querySelector("#app");
const screen = document.querySelector("#screen");
const title = document.querySelector("#screen-title");
const overview = document.querySelector("#route-overview");
const dialog = document.querySelector("#landmark-dialog");
const dialogImage = document.querySelector("#dialog-image");
const dialogTitle = document.querySelector("#dialog-title");
const dialogLandmark = document.querySelector("#dialog-landmark");
const live = document.querySelector("#status-live");
const toolResult = document.querySelector("#tool-result");
let session;
const mapDialog = document.querySelector("#route-map-dialog");
const mapContent = document.querySelector("#route-map-content");
const mapViewport = document.querySelector("#route-map-viewport");
const officialDialog = document.querySelector("#official-map-dialog");
const officialContent = document.querySelector("#official-map-content");
let mapZoom = 1;
let officialZoom = 1;
let officialFull = false;
const ocrRecognizer = createOcrWeakCandidateRecognizer();
const photoController = new PhotoCapture({
  decode: decodePhoto,
  recognizer: ocrRecognizer,
  allowedNodeIds: ["Y28", "Y26", "Y23"],
});
const photoPanel = mountPhotoPanel({
  input: document.querySelector('#photo-input'),
  take: document.querySelector('#photo-take'),
  clear: document.querySelector('#photo-clear'),
  status: document.querySelector('#photo-status'),
  preview: document.querySelector('#photo-preview'),
}, { controller: photoController });
photoPanel.reset(true);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label, action, style = "primary") {
  return `<button type="button" class="button button-${style}" data-action="${action}">${label}</button>`;
}

function setView(heading, html, announcement = heading) {
  title.textContent = heading;
  screen.innerHTML = html;
  live.textContent = announcement;
  requestAnimationFrame(() => {
    title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

function landmark(step) { return landmarkMarkup(step.to_node_id); }

function renderEntry() {
  setView("走到 Y23 固定牆標", `
    <p class="step-kicker">Y28 起點 → Y26 → Y23 終點</p>
    <p class="intro">沿途比對三個固定牆標，每到一處，由你確認後再繼續。</p>
    ${landmarkMarkup("Y28")}
    <p class="helper">先找到照片中的 Y28 固定牆標，再開始比對起點。</p>
    <div class="actions">${button("開始比對起點", "start")}</div>
  `);
}

function renderStart() {
  const startNode = session.fixture.route.sequence.value[0];
  const lowConfidence = session.state.last_reason === "user_cannot_confirm_start_low_confidence";
  setView("確認起點", `
    <p class="step-kicker">路線起點</p>
    <h2>請先找到 ${escapeHtml(startNode)} 固定牆標</h2>
    <p>位置由你本人確認；頭頂指向 Y28 的方向牌不代表已到起點。</p>
    ${landmarkMarkup(startNode)}
    ${lowConfidence ? '<p class="notice"><strong>已安全停留。</strong>無法確認時不會猜測起點；請再比對或中止。</p>' : ""}
    <div class="actions">
      ${button(`我已確認這是 ${escapeHtml(startNode)}`, "confirm-start")}
      ${button("無法辨識／低信心", "start-low-confidence", "secondary")}
      ${button("中止導航", "abort", "danger")}
    </div>
  `);
}

function renderGuidance() {
  const step = session.currentStep;
  const index = session.state.step_index + 1;
  setView(`前往 ${step.to_node_id} 固定牆標`, `
    <p class="step-kicker">第 ${index} 步 · ${escapeHtml(step.from_node_id)} → ${escapeHtml(step.to_node_id)}</p>
    <h2 class="instruction">${escapeHtml(step.instruction.value)}</h2>
    ${landmark(step)}
    <p class="meta">上次由你確認：${escapeHtml(session.state.last_confirmed_node)}。找到目標牆標後，再回報抵達。</p>
    <div class="actions">
      ${button(`我看到 ${escapeHtml(step.to_node_id)}，回報抵達`, "report-arrival")}
      <div class="recovery-actions">${button("我走錯了", "wrong-route", "secondary")}
      ${button("無法辨識／低信心", "low-confidence", "secondary")}</div>
      ${button("中止導航", "abort", "danger")}
    </div>
  `, `顯示第 ${index} 步，目標 ${step.to_node_id}`);
}

function renderArrivalConfirmation() {
  const target = session.state.pending_arrival_node;
  const step = session.fixture.steps[session.state.step_index];
  setView(`再確認 ${target}`, `
    <p class="step-kicker">已收到抵達回報，但還未確認</p>
    <h2>你看到的是 ${escapeHtml(target)} 固定牆標嗎？</h2>
    ${landmark(step)}
    <p class="notice">${target === "Y23" ? "確認這面固定牆標後，才會完成這條路線。" : "確認這面固定牆標後，才會開始前往 Y23。"}</p>
    <div class="actions">
      ${button(`確認是 ${escapeHtml(target)}`, "confirm-arrival")}
      ${button("無法確認／地標不符", "arrival-low-confidence", "secondary")}
      ${button("中止導航", "abort", "danger")}
    </div>
  `);
}

function renderRecovery() {
  const isLowConfidence = session.state.last_reason.includes("low_confidence");
  const candidates = session.state.relocation_candidates;
  setView(isLowConfidence ? "無法辨識：人工重新定位" : "走錯恢復", `
    <p class="notice"><strong>已暫停原指示。</strong>系統不會猜你在哪裡。上一個已確認節點仍是 ${escapeHtml(session.state.last_confirmed_node)}。</p>
    <h2>請以固定牆標比對你看到的節點</h2>
    <div class="candidate-list">
      ${candidates.map((candidate) => `
        <button type="button" class="candidate" data-action="select-relocation" data-node-id="${escapeHtml(candidate.node_id)}">
          <strong>${escapeHtml(candidate.node_id)}</strong>
          <span>我看到這個固定牆標，前往比對確認 →</span>
        </button>`).join("")}
    </div>
    <div class="actions">${button("中止導航", "abort", "danger")}</div>
  `);
}

function renderManualConfirmation() {
  const relocation = session.state.relocation_candidates.length > 0;
  const target = relocation
    ? session.state.pending_confirmation_node
    : session.state.pending_arrival_node;
  setView(`人工確認 ${target}`, `
    <p class="notice"><strong>低信心：目前狀態沒有前進。</strong>只有你再次比對固定牆標並明確確認，才能繼續。</p>
    <h2>你能確認眼前是 ${escapeHtml(target)} 嗎？</h2>
    ${landmarkMarkup(target)}
    <div class="actions">
      ${button(`我已比對，確認是 ${escapeHtml(target)}`, relocation ? "confirm-relocation" : "confirm-arrival")}
      ${button("仍無法確認，中止", "abort", "danger")}
    </div>
  `);
}

function renderBlocked() {
  setView("已安全停止", `
    <p class="notice"><strong>沒有可安全確認的候選。</strong>系統不會用 GPS、感測器或附近節點猜測。</p>
    <p>上一個已確認節點：<strong>${escapeHtml(session.state.last_confirmed_node)}</strong></p>
    <div class="actions">${button("中止導航", "abort", "danger")}</div>
  `);
}

function renderCompleted() {
  setView("已抵達 Y23 固定牆標", `
    <div class="arrival-seal" aria-hidden="true">✓</div>
    <p class="completion-lead">你已親自確認最後一個地標。</p>
    <p class="completion-route">Y28 <span>→</span> Y26 <span>→</span> Y23</p>
    ${landmarkMarkup("Y23")}
    <p class="helper">這條路線到此結束。其他目的地尚未提供指引。</p>
    <div class="actions">${button("重新開始", "restart", "secondary")}</div>
  `);
}

function renderAborted() {
  setView("導航已中止", `
    <p>最後已確認節點：<strong>${escapeHtml(session.state.last_confirmed_node)}</strong></p>
    <p>未確認的位置不會被記成抵達。</p>
    <div class="actions">${button("重新開始", "restart", "secondary")}</div>
  `);
}

function render() {
  switch (session.state.status) {
    case "not_started": renderEntry(); break;
    case "start_confirmation_required": renderStart(); break;
    case "step_guidance": renderGuidance(); break;
    case "arrival_confirmation_required": renderArrivalConfirmation(); break;
    case "manual_relocation": renderRecovery(); break;
    case "manual_confirmation_required": renderManualConfirmation(); break;
    case "blocked_unknown": renderBlocked(); break;
    case "completed": renderCompleted(); break;
    case "aborted": renderAborted(); break;
    default: throw new Error(`UI cannot render state: ${session.state.status}`);
  }
  overview.innerHTML = renderRouteOverview(session.state);
  document.querySelector("#photo-tools").hidden = ["not_started", "completed", "aborted"].includes(session.state.status);
  let expectedNodeId = null;
  if (session.state.status === "start_confirmation_required") {
    expectedNodeId = session.fixture.route.sequence.value[0];
  } else if (session.state.status === "step_guidance") {
    expectedNodeId = session.currentStep.to_node_id;
  } else if (session.state.status === "arrival_confirmation_required") {
    expectedNodeId = session.state.pending_arrival_node;
  } else if (session.state.status === "manual_confirmation_required") {
    expectedNodeId = session.state.pending_confirmation_node !== "unknown"
      ? session.state.pending_confirmation_node
      : session.state.pending_arrival_node;
  }
  photoPanel.setExpectedNode(expectedNodeId);
}

function exportEvents() {
  const blob = new Blob([`${JSON.stringify(session.exportSnapshot(), null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gate4a-manual-visual-events.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toolResult.textContent = `已從記憶體匯出 ${session.events.length} 個事件；不含個資。`;
}

async function initialize() {
  photoPanel.reset(true);
  const response = await fetch(FIXTURE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`路線 fixture 載入失敗 (${response.status})`);
  const fixture = await response.json();
  session = new ManualVisualSession(fixture);
  toolResult.textContent = "";
  document.querySelectorAll("details").forEach((details) => { details.open = false; });
  app.setAttribute("aria-busy", "false");
  render();
  photoPanel.reset(true);
}

function applyZoom(kind, value) {
  const official = kind === "official";
  const panel = official ? officialDialog : mapDialog;
  const content = official ? officialContent : mapContent;
  const viewport = official ? officialContent.querySelector(".official-map-viewport") : mapViewport;
  const key = official ? "official" : "map";
  content.classList.toggle("zoom-2", value === 2);
  content.classList.toggle("zoom-4", value === 4);
  panel.querySelector(`[data-action="${key}-zoom-out"]`).disabled = value === 1;
  panel.querySelector(`[data-action="${key}-zoom-in"]`).disabled = value === 4;
  document.querySelector(`#${key}-zoom-label`).textContent = `圖面 ${value}×`;
  if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
}

function showOfficialMap() {
  officialContent.innerHTML = `<div class="official-map-viewport map-viewport" role="region" tabindex="0" aria-label="官方區域參考圖，可用方向鍵捲動">
    <svg class="official-map-image" viewBox="${officialFull ? "0 0 2500 1669" : "210 430 630 400"}" role="img" aria-label="2019 官方${officialFull ? "完整" : "西側 Y 區"}區域參考圖，不顯示你的定位">
      <image href="/references/official-b1-map-2019.png" width="2500" height="1669"/>
    </svg></div>
    <div class="official-map-fallback" hidden><strong>官方參考圖暫時無法載入</strong><p>可關閉此圖繼續人工比對固定牆標，或開啟下方原始 PDF。</p><button type="button" class="button button-secondary" data-action="retry-official-map">重新載入官方圖</button></div>`;
  officialDialog.querySelector('[data-action="official-west"]').setAttribute("aria-pressed", String(!officialFull));
  officialDialog.querySelector('[data-action="official-full"]').setAttribute("aria-pressed", String(officialFull));
  applyZoom("official", officialZoom);
}

document.addEventListener("error", handleOfficialMapError, true);
mapDialog.addEventListener("click", (event) => { if (event.target === mapDialog) mapDialog.close(); });
officialDialog.addEventListener("click", (event) => { if (event.target === officialDialog) officialDialog.close(); });

document.addEventListener("error", handleLandmarkError, true);
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || !session) return;
  const action = target.dataset.action;
  try {
    if (action === "open-route-map") {
      mapContent.innerHTML = renderRouteMap(session.state, { expanded: true });
      mapZoom = 1;
      applyZoom("map", mapZoom);
      mapDialog.showModal();
      return;
    }
    if (action === "close-route-map") { mapDialog.close(); return; }
    if (action === "map-zoom-in" || action === "map-zoom-out") {
      mapZoom = Math.max(1, Math.min(4, mapZoom * (action === "map-zoom-in" ? 2 : .5)));
      applyZoom("map", mapZoom); return;
    }
    if (action === "open-official-map") {
      officialFull = false; officialZoom = 1; showOfficialMap(); officialDialog.showModal(); return;
    }
    if (action === "close-official-map") { officialDialog.close(); return; }
    if (action === "official-west" || action === "official-full") {
      officialFull = action === "official-full"; officialZoom = 1; showOfficialMap(); return;
    }
    if (action === "retry-official-map") { showOfficialMap(); return; }
    if (action === "official-zoom-in" || action === "official-zoom-out") {
      officialZoom = Math.max(1, Math.min(4, officialZoom * (action === "official-zoom-in" ? 2 : .5)));
      applyZoom("official", officialZoom); return;
    }
    if (action === "close-photo") { dialog.close(); return; }
    if (action === "view-photo") {
      const nodeId = target.dataset.nodeId;
      const photo = LANDMARKS[nodeId];
      if (!photo) return;
      dialogTitle.textContent = `${nodeId} 固定牆標參考圖`;
      dialogLandmark.dataset.landmark = nodeId;
      dialogLandmark.querySelector(".landmark-image-button").hidden = false;
      dialogLandmark.querySelector(".landmark-fallback").hidden = true;
      document.querySelector("#dialog-node").textContent = nodeId;
      dialogImage.src = photo.url;
      dialogImage.alt = photo.alt;
      dialog.showModal();
      return;
    }
    if (!["export", "replay", "ocr-self-test"].includes(action)) photoPanel.reset();
    if (action === "start") session.start();
    else if (action === "confirm-start") session.confirmStart();
    else if (action === "start-low-confidence") session.reportStartLowConfidence();
    else if (action === "report-arrival") session.reportArrival();
    else if (action === "confirm-arrival") session.confirmArrival();
    else if (action === "arrival-low-confidence") session.deferArrivalLowConfidence();
    else if (action === "wrong-route") session.reportWrongRoute();
    else if (action === "low-confidence") session.reportLowConfidence();
    else if (action === "select-relocation") session.selectRelocation(target.dataset.nodeId);
    else if (action === "confirm-relocation") session.confirmRelocation();
    else if (action === "abort") session.abort();
    else if (action === "replay") {
      const replayed = session.replay();
      toolResult.textContent = `重播通過：${session.events.length} 個事件，終態 ${replayed.status}。`;
      return;
    } else if (action === "export") {
      exportEvents();
      return;
    } else if (action === "ocr-self-test") {
      toolResult.textContent = "正在執行本機 OCR 引擎自我測試；這不代表位置辨識成功。";
      try {
        const passed = await runOcrSelfTest({ recognizer: ocrRecognizer });
        toolResult.textContent = passed
          ? "OCR 引擎自我測試通過：合成 Y26 產生弱候選；尚未驗證相機或現場位置。"
          : "OCR 引擎自我測試失敗：請記錄為 fail，仍可使用人工導航。";
      } catch {
        toolResult.textContent = "OCR 引擎自我測試發生錯誤：請記錄為 fail，仍可使用人工導航。";
      }
      return;
    } else if (action === "restart") {
      await initialize();
      return;
    }
    render();
    photoPanel.reset(["not_started", "completed", "aborted"].includes(session.state.status));
  } catch (error) {
    toolResult.textContent = `操作未套用：${error.message}`;
  }
});

initialize().catch((error) => {
  app.setAttribute("aria-busy", "false");
  screen.classList.add("error-card");
  setView("無法啟動", `<p>${escapeHtml(error.message)}</p><p>請確認是否由專案的本機 server 開啟。</p>`);
});
