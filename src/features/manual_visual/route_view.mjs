// Presentation only: progress is derived from authoritative session state.
import { ROUTE_NODES } from "./route_context.mjs";
import { renderRouteMap } from "./route_map.mjs";
export { ROUTE_NODES };
export const LANDMARKS = Object.freeze({
  Y28: { url: "/landmarks/Y28.png", alt: "Y28 固定牆標，位於金屬門上方的牆面", width: 1600, height: 1150 },
  Y26: { url: "/landmarks/Y26.png", alt: "Y26 固定牆標，位於走廊側邊金屬門上方", width: 1600, height: 1334 },
  Y23: { url: "/landmarks/Y23.png", alt: "Y23 固定牆標，位於金屬門與壁面看板上方", width: 1600, height: 1252 },
});

export function routeProgress(state) {
  const confirmedIndex = ROUTE_NODES.indexOf(state.last_confirmed_node);
  const terminal = ["completed", "aborted"].includes(state.status);
  const targetIndex = terminal ? -1 : confirmedIndex + 1;
  return ROUTE_NODES.map((nodeId, index) => ({
    nodeId,
    status: index <= confirmedIndex ? "confirmed" : index === targetIndex ? "target" : "pending",
    label: index <= confirmedIndex ? "已確認" : index === targetIndex
      ? (confirmedIndex < 0 ? "待確認起點" : "目前目標") : "尚未到達",
  }));
}

export function renderRouteOverview(state) {
  return renderRouteMap(state);
}

export function landmarkMarkup(nodeId) {
  const photo = LANDMARKS[nodeId];
  if (!photo) return "";
  return `<figure class="landmark" data-landmark="${nodeId}">
    <div class="landmark-frame">
      <button type="button" class="landmark-image-button" data-action="view-photo" data-node-id="${nodeId}" aria-label="放大 ${nodeId} 固定牆標參考圖">
        <img src="${photo.url}" alt="${photo.alt}" width="${photo.width}" height="${photo.height}" decoding="async">
        <span class="enlarge-label" aria-hidden="true">↗ 放大</span>
      </button>
      <div class="landmark-fallback" hidden><strong>${nodeId}</strong><p>參考照片暫時無法載入</p><span>請以現場 ${nodeId} 固定牆標文字比對；無法確認就先停下。</span></div>
    </div>
    <figcaption><strong>${nodeId} 固定牆標</strong><span>參考圖・請比對牆面，勿只看方向牌</span></figcaption>
  </figure>`;
}

export function handleLandmarkError(event) {
  const image = event.target;
  if (image.tagName !== "IMG") return;
  const figure = image.closest("[data-landmark]");
  if (!figure) return;
  figure.querySelector(".landmark-image-button").hidden = true;
  figure.querySelector(".landmark-fallback").hidden = false;
}
