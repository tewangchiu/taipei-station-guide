const ORDER = ['Y28', 'Y26', 'Y23'];
export function validateCameraRoute(route) {
  if (route?.schemaVersion !== 'route-package-v1' || route.specVersion !== 'camera-prototype-v1'
    || route.evidenceMode !== 'prototype' || route.navigationReady !== false || route.physicalArrivalVerified !== false
    || JSON.stringify(route.nodeOrder) !== JSON.stringify(ORDER) || route.nodes?.length !== 3 || route.segments?.length !== 2
    || route.map?.kind !== 'schematic' || route.map.notToScale !== true) throw new Error('INVALID_ROUTE_PACKAGE');
  for (let i=0;i<3;i++) {
    const node=route.nodes[i];
    if (node.nodeId !== ORDER[i] || node.floor !== 'B1' || node.referenceImage !== `/camera/assets/${ORDER[i]}.png`
      || !/^[a-f0-9]{64}$/.test(node.sha256) || node.referencePackId !== 'run_01_manual_v1'
      || node.locationEvidenceStatus !== 'fixed_marker_visible_only' || !Array.isArray(node.roi) || node.roi.length !== 4
      || !node.roi.every(Number.isFinite) || node.roi[0] < 0 || node.roi[1] < 0 || node.roi[2] <= node.roi[0] || node.roi[3] <= node.roi[1]) throw new Error('INVALID_ROUTE_PACKAGE');
    if (i<2) { const segment=route.segments[i]; if (segment.fromNodeId !== ORDER[i] || segment.toNodeId !== ORDER[i+1] || typeof segment.instruction !== 'string' || segment.timeReference?.notLiveEta !== true) throw new Error('INVALID_ROUTE_PACKAGE'); }
  }
  return route;
}
export async function loadCameraRoute() {
 const response=await fetch('/camera/route.json');if(!response.ok)throw new Error('ROUTE_LOAD_FAILED');
 return validateCameraRoute(await response.json());
}
export async function decodeVerifiedImage(url, expectedSha) {
 const response=await fetch(url);if(!response.ok)throw new Error('REFERENCE_LOAD_FAILED');
 const bytes=await response.arrayBuffer();
 if(expectedSha){const digest=await crypto.subtle.digest('SHA-256',bytes);const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(actual!==expectedSha)throw new Error('REFERENCE_HASH_MISMATCH');}
 const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
 try{const image=new Image();image.src=objectUrl;await image.decode();return image;}finally{URL.revokeObjectURL(objectUrl);}
}
