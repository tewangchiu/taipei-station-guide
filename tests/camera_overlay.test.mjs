import test from 'node:test';
import assert from 'node:assert/strict';
import { coverLayout, projectAnchor, visibleObservation, overlayLifetime, labelPlacement } from '../src/features/camera_guidance/overlay.mjs';
import { createEvidenceState, evaluateObservation } from '../src/features/camera_guidance/policy.mjs';
const anchor = (x = .5, y = .4) => ({ schemaVersion: 'image-anchor-v1', coordinateSpace: 'normalized-image', imageSize: { width: 1600, height: 1200 }, polygon: [{x:x-.04,y:y-.04},{x:x+.04,y:y-.04},{x:x+.04,y:y+.04},{x:x-.04,y:y+.04}], center:{x,y} });
test('cover maps a centered image point to the actual phone center, with horizontal crop', () => {
  const layout = coverLayout(1600, 1200, 390, 844);
  const position = projectAnchor(anchor(.5,.5), layout);
  assert.ok(Math.abs(position.center.x - 195) < 1e-6);
  assert.ok(Math.abs(position.center.y - 422) < 1e-6);
  assert.equal(position.visible, true);
  assert.ok(layout.offsetX < 0);
});
test('replay framing aligns approved ROI without inventing an observation', () => {
  const layout = coverLayout(1600,1200,390,844,.28);
  const position = projectAnchor(anchor(.28),layout);
  assert.ok(Math.abs(position.center.x - 195) < 1e-6);
  assert.equal(position.visible,true);
  assert.equal(projectAnchor(null,layout),null);
});
test('landscape cover maps vertical cropping and rejects out-of-view marker', () => {
  const layout = coverLayout(900,1600,844,390);
  assert.ok(layout.offsetY < 0);
  assert.equal(projectAnchor(anchor(.5,.1),layout).visible,false);
});
test('clipped marker is rejected before temporal evidence can advance, with no leaked node/anchor', () => {
  const result = { accepted:true,nodeId:'Y26',anchor:anchor(.1),reason:'landmark_match' };
  const filtered = visibleObservation(result,coverLayout(1600,1200,390,844));
  assert.equal(filtered.accepted,false); assert.equal(filtered.nodeId,null); assert.equal(filtered.anchor,null);
  let evidence=createEvidenceState();
  for (let i=0;i<5;i++) {
    const judged=evaluateObservation(evidence,{...filtered,sessionId:'visible',frameId:i,capturedAtMs:i*600},{expectedNodeId:'Y26',nowMs:i*600});
    assert.notEqual(judged.decision,'accepted'); evidence=judged.state;
  }
});
test('missing and malformed geometry never becomes a fabricated centered label', () => {
  const layout=coverLayout(1600,1200,390,844);
  for (const item of [null,{...anchor(),center:{x:NaN,y:.5}},{...anchor(),coordinateSpace:'world'},{...anchor(),polygon:[]}]) {
    assert.equal(projectAnchor(item,layout),null);
    assert.equal(visibleObservation({accepted:true,nodeId:'Y28',anchor:item},layout).accepted,false);
  }
  assert.equal(coverLayout(0,0,390,844),null);
});

test('overlay age includes inference time and rejects expired, future or invalid timestamps', () => {
  assert.equal(overlayLifetime(100,500),800);
  assert.equal(overlayLifetime(100,1300),0);
  assert.equal(overlayLifetime(100,1800),0);
  assert.equal(overlayLifetime(500,100),0);
  assert.equal(overlayLifetime(NaN,500),0);
});
test('slanted ROI label points to the actual edge midpoint', () => {
  const polygon=[{x:150,y:250},{x:250,y:310},{x:250,y:400},{x:150,y:340}];
  const placement=labelPlacement(polygon,{width:390,height:844},{width:118,height:78},null);
  assert.equal(placement.placement,'above');
  assert.equal(placement.x,200); assert.equal(placement.y + 32,280);
});
test('landscape uses a side label when top toolbar and bottom card block vertical labels', () => {
  const polygon=[{x:405,y:113},{x:485,y:113},{x:485,y:169},{x:405,y:169}];
  const placement=labelPlacement(polygon,{width:844,height:390},{width:118,height:78},{left:458,right:828,top:231,bottom:376});
  assert.equal(placement.placement,'left');
  assert.equal(placement.x + 32,405); assert.equal(placement.y,141);
});
