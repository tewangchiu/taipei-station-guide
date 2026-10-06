import { NODES, expectedNode } from './session.mjs';
// Layout units from the known corridor topology, not surveyed floor-plan coordinates.
export function routePlan(session, { compact = false } = {}) {
  const index = session?.index ?? -1, target = expectedNode(session ?? { index: -1 });
  const paused = ['paused','error','stopped'].includes(session?.status), prefix = compact ? 'mini' : 'plan';
  const layout = compact ? { height:102,path:'M 24 78 L 328 27',points:[[50,74],[178,52],[302,31]],marker:[189,72],labels:[[37,43],[212,92],[277,21]] } : { height:252,path:'M 46 213 L 316 39',points:[[76,194],[180,127],[288,57]],marker:[200,157],labels:[[24,241],[226,177],[251,25]] };
  const {points,marker,labels}=layout, line=(a,b)=>`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  const chevron=(a,b)=>`<path class="plan-chevron" d="M -4 -5 L 2 0 L -4 5" transform="translate(${(a[0]+b[0])/2} ${(a[1]+b[1])/2}) rotate(${Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI})"/>`;
  return `<svg class="route-plan ${compact?'is-mini':''} ${paused?'is-paused':''}" viewBox="0 0 360 ${layout.height}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" data-route-index="${index}"><title id="${prefix}-title">Y28 → Y26 → Y23 地下街路線</title><desc id="${prefix}-description">${routeMapSummary(session)}。沿主走廊前進，Y26牆標在右側，不轉入出口。路線關係圖，非即時定位。</desc>
  <rect class="plan-surround" width="360" height="${layout.height}" rx="14"/><path class="plan-wall" d="${layout.path}"/><path class="plan-floor" d="${layout.path}"/>
  ${points.slice(1).map((point,i)=>`<path class="plan-segment ${i<index?'is-done':'is-ahead'}" d="${line(points[i],point)}" data-segment="${NODES[i]}-${NODES[i+1]}" data-state="${i<index?'recognized':'pending'}"/>${i>=index?chevron(points[i],point):''}`).join('')}
  <path class="plan-leader" d="${line(points[1],marker)}"/>
  ${NODES.map((node,i)=>{const [x,y]=[points[0],marker,points[2]][i],[lx,ly]=labels[i],status=i<=index?'recognized':node===target?'target':'pending';return `<g data-map-node="${node}" data-state="${status}" data-last-seen="${i===index}" ${node===target?'aria-current="step"':''}>${i===index?`<path class="plan-last" d="M ${x} ${y-13} l 13 13 l -13 13 l -13 -13 Z"/>`:''}${node===target?`<circle class="plan-target" cx="${x}" cy="${y}" r="13"/>`:''}<circle class="plan-node ${status}" cx="${x}" cy="${y}" r="7"/>${i<=index?`<path class="plan-tick" d="M ${x-3} ${y} l 2 2 l 4 -4"/>`:''}<text class="plan-label" x="${lx}" y="${ly}">${node}</text></g>`;}).join('')}
  ${compact?'':'<text class="plan-caption" x="24" y="62">主走廊</text><text class="plan-note" x="218" y="200">不要轉入出口</text>'}</svg>`;
}
export function routeMapSummary(session) {
  if (!session || session.index<0) return '先找 Y28，確認起點';
  const source=session.events.at(-1)?.evidenceSource==='manual_fallback'?'確認':'辨識',next=expectedNode(session);
  return `上次${source} ${NODES[session.index]}${next?` · 接著 ${next}`:' · 路線完成'}`;
}
