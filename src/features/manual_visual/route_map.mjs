import { ROUTE_NODES, routeContext, walkingReference } from "./route_context.mjs";

// Diagram coordinates express only fixture topology and the right-side Y26 marker.
// They are layout units, not surveyed geometry, meters, or official-map coordinates.
const SEGMENT_PATHS = ["M 86 178 L 187 113", "M 187 113 L 282 52"];
const MARKERS = {
  Y28: { x: 86, y: 178, labelX: 25, labelY: 220 },
  Y26: { x: 203, y: 138, labelX: 222, labelY: 158 },
  Y23: { x: 282, y: 52, labelX: 220, labelY: 22 },
};

export function routeDiagram(state, { expanded = false } = {}) {
  const context = routeContext(state);
  const prefix = expanded ? "expanded" : "overview";
  return `<svg class="corridor-diagram" viewBox="0 0 360 242" role="img" aria-labelledby="${prefix}-map-title ${prefix}-map-desc" data-map-mode="${context.mode}">
    <title id="${prefix}-map-title">B1 主走廊路線示意</title>
    <desc id="${prefix}-map-desc">從 Y28 沿主走廊前進，比對右側 Y26 固定牆標後，沿原走廊前往 Y23。Y26 不需轉入出口。非比例圖，不顯示即時位置。</desc>
    <rect class="map-surroundings" width="360" height="242" rx="16"/>
    <path class="corridor-wall" d="M 54 199 L 313 32"/>
    <path class="corridor-floor" d="M 54 199 L 313 32"/>
    <text class="corridor-label" x="20" y="55">主走廊</text>
    <text class="corridor-subtitle" x="20" y="73">沿走廊直行</text>
    ${context.segments.map((segment, i) => `<path class="map-route route-${segment.status} ${context.mode === "paused" ? "route-paused" : ""}" d="${SEGMENT_PATHS[i]}" data-segment="${segment.from}-${segment.to}" data-progress="${segment.status}"/>`).join("")}
    ${["translate(137 145)", "translate(238 80)"].map((position) => `<path class="route-chevron" d="M -4 -5 L 2 0 L -4 5" transform="${position} rotate(-33)"/>`).join("")}
    <path class="wall-marker-leader" d="M 191 119 L 203 138"/>
    ${ROUTE_NODES.map((nodeId, index) => {
      const point = MARKERS[nodeId];
      const confirmed = context.lastConfirmedNode && index <= ROUTE_NODES.indexOf(context.lastConfirmedNode);
      const last = context.lastConfirmedNode === nodeId;
      const target = context.targetNode === nodeId;
      const status = confirmed ? "confirmed" : target ? "target" : "pending";
      const tag = last ? "上次確認" : target ? context.mode === "paused" ? "原目標" : index === 0 ? "待確認起點" : "目前目標" : confirmed ? "已確認" : index === 2 ? "終點" : "尚未到達";
      return `<g class="map-marker marker-${status}" data-node="${nodeId}" data-progress="${status}" ${target && context.mode !== "paused" ? 'aria-current="step"' : ""}>
        <title>${nodeId} 固定牆標：${tag}</title>
        ${last ? `<path class="last-confirmed-ring" d="M ${point.x} ${point.y - 13} L ${point.x + 13} ${point.y} L ${point.x} ${point.y + 13} L ${point.x - 13} ${point.y} Z"/>` : ""}
        <circle cx="${point.x}" cy="${point.y}" r="${target ? 9 : 6}"/>
        ${confirmed ? `<path class="marker-tick" d="M ${point.x - 3} ${point.y} l 2 2 l 4 -4"/>` : ""}
        <text class="map-node-label" x="${point.labelX}" y="${point.labelY}">${nodeId}<tspan class="map-node-status" dx="6">${tag}</tspan></text>
      </g>`;
    }).join("")}
    <text class="wall-marker-note" x="210" y="180">右側牆標</text>
    <text class="wall-marker-note" x="210" y="196">不轉入出口通道</text>
  </svg>`;
}

export function renderWalkingSummary(state) {
  const context = routeContext(state);
  const reference = walkingReference(context);
  if (context.mode === "completed") return '<div class="walk-summary is-finished"><strong>已抵達 Y23 固定牆標</strong><span>本段路線已由你確認完成</span></div>';
  if (context.mode === "aborted") return '<div class="walk-summary is-paused"><strong>路線已中止</strong><span>不再顯示剩餘步行時間</span></div>';
  if (!reference) return `<div class="walk-summary is-paused"><strong>${context.mode === "paused" ? "指引暫停" : "位置尚未確認"}</strong><span>確認位置後顯示步行參考</span></div>`;
  return `<div class="walk-summary" data-reference-from="${reference.from}">
    <div><span class="walk-kicker">${context.mode === "start_pending" ? "全程" : "剩餘"}</span><strong>${context.remainingSegments} 段</strong></div>
    <div><span class="walk-kicker">${reference.label}</span><strong>${reference.value}</strong></div>
    <p>依既有錄影估算，從${context.mode === "start_pending" ? "起點" : "上次確認地標"}起算；未含停留</p>
  </div>`;
}

export function renderRouteMap(state, { expanded = false } = {}) {
  const context = routeContext(state);
  return `<div class="map-caption"><strong>B1 主走廊</strong><span>路線示意・非比例</span></div>
    <div class="map-stage">${routeDiagram(state, { expanded })}
    ${expanded ? "" : '<button type="button" class="map-expand" data-action="open-route-map">放大完整路線圖 <span aria-hidden="true">↗</span></button>'}</div>
    <div class="map-legend"><span><i class="legend-confirmed"></i>已走（已確認）</span><span><i class="legend-remaining"></i>尚未確認</span></div>
    <div class="map-position"><span>${context.lastConfirmedNode ? `上次確認 ${context.lastConfirmedNode}` : "起點尚未確認"}</span><strong>${context.targetNode && context.mode !== "paused" ? `${context.lastConfirmedNode ? "目前目標" : "先找"} ${context.targetNode}` : context.mode === "completed" ? "路線已完成" : context.mode === "aborted" ? "已中止" : "等待確認位置"}</strong></div>
    ${renderWalkingSummary(state)}`;
}

export function handleOfficialMapError(event) {
  const surface = event.target.closest?.("[data-official-reference]");
  if (!surface || !["img", "image"].includes(event.target.tagName?.toLowerCase())) return;
  surface.querySelector(".official-map-viewport").hidden = true;
  surface.querySelector(".official-map-fallback").hidden = false;
}
