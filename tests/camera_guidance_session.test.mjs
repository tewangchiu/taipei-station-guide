import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, transition, expectedNode, walkingSummary } from '../src/features/camera_guidance/session.mjs';
import { CameraSource } from '../src/features/camera_guidance/camera.mjs';
import { cameraRequestPath, cameraHeaders, validLocalRequest } from '../scripts/serve_camera_guidance.mjs';
function event(state,type,extra={}){return {sessionId:state.sessionId,type,...extra};}
test('experimental vision advances in order and reaches a terminal state, independent of elapsed time',()=>{
 let s=createSession('a','camera');s=transition(s,event(s,'start'));
 const before=s;assert.equal(transition(s,event(s,'timer',{elapsedMs:999999})),before);
 assert.equal(transition(s,event(s,'advance',{nodeId:'Y26',decision:'accepted',evidenceSource:'vision_experimental'})),before);
 for(const nodeId of ['Y28','Y26','Y23'])s=transition(s,event(s,'advance',{nodeId,decision:'accepted',evidenceSource:'vision_experimental'}));
 assert.equal(s.status,'completed');assert.equal(expectedNode(s),null);assert.equal(s.events.length,3);
 assert.equal(transition(s,event(s,'start')),s);assert.equal(transition(s,event(s,'advance',{nodeId:'Y23',decision:'accepted',evidenceSource:'vision_experimental'})),s);
});
test('pause rejects advances, resumed input retains progress, manual events keep their source',()=>{
 let s=createSession('a','replay');s=transition(s,event(s,'start'));s=transition(s,event(s,'advance',{nodeId:'Y28',evidenceSource:'manual_fallback'}));
 assert.equal(s.events[0].evidenceSource,'manual_fallback');s=transition(s,event(s,'pause'));
 assert.equal(transition(s,event(s,'advance',{nodeId:'Y26',decision:'accepted',evidenceSource:'vision_experimental'})),s);
 assert.equal(walkingSummary(s).time,'指引已暫停');s=transition(s,event(s,'start'));assert.equal(expectedNode(s),'Y26');
 assert.equal(transition(s,{type:'advance',sessionId:'old',nodeId:'Y26',decision:'accepted',evidenceSource:'vision_experimental'}),s);
});
test('an unaccepted observation or legacy event cannot impersonate a vision decision',()=>{
 let s=createSession('a');s=transition(s,event(s,'start'));
 for(const extra of [{nodeId:'Y28',evidenceSource:'vision_experimental',decision:'rejected'},{nodeId:'Y28',evidenceSource:'user_confirmed'},{nodeId:'Y28'}])assert.equal(transition(s,event(s,'advance',extra)),s);
 assert.equal(transition(s,event(s,'user_confirmed',{nodeId:'Y28'})),s);
});
test('camera late permission response releases tracks without attaching to a stopped session',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
 try{let grant;let stops=0;let asked;const video={pause(){},play:async()=>{},srcObject:null};const c=new CameraSource(video,{getUserMedia:constraints=>{asked=constraints;return new Promise(resolve=>grant=resolve);}});
 const pending=c.start();c.stop();grant({getTracks:()=>[{stop:()=>stops++}]});assert.equal(await pending,false);assert.equal(stops,1);assert.equal(video.srcObject,null);assert.equal(asked.audio,false);
 }finally{if(original)Object.defineProperty(globalThis,'isSecureContext',original);else delete globalThis.isSecureContext;}
});
test('camera stop is idempotent and insecure contexts never request permission',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{value:false,configurable:true});
 try{let requested=0;const c=new CameraSource({pause(){},srcObject:null},{getUserMedia:()=>{requested++;}});await assert.rejects(()=>c.start(),/SECURE_CONTEXT_REQUIRED/);c.stop();assert.equal(requested,0);
 }finally{if(original)Object.defineProperty(globalThis,'isSecureContext',original);else delete globalThis.isSecureContext;}
});
test('camera server permits only listed files and grants camera solely to prototype documents',()=>{
 for(const url of ['/camera','/camera/','/camera?demo=1'])assert.match(cameraHeaders(url)['permissions-policy'],/camera=\(self\)/);
 for(const url of ['/','/camera/app.mjs','/camera-evil'])assert.match(cameraHeaders(url)['permissions-policy'],/camera=\(\)/);
 for(const url of ['/raw_data/x.mp4','/.git/config','/docs/PROJECT_CONTEXT.md','/camera/%2e%2e/%2e%2e/AGENTS.md','/%E0%A4%A'])assert.equal(cameraRequestPath(url),null);
 assert.match(cameraRequestPath('/camera/assets/Y28.png'),/SIM01_Y28_FIXED.png$/);
 assert.match(cameraHeaders('/camera')['content-security-policy'],/connect-src 'self' data:/);
 assert.doesNotMatch(cameraHeaders('/')['content-security-policy'],/'unsafe-eval'/);
});

test('initialization can pause and resume before camera permission resolves',()=>{
 let s=createSession('loading','camera');s=transition(s,event(s,'pause'));assert.equal(s.status,'paused');s=transition(s,event(s,'start'));assert.equal(s.status,'running');assert.equal(s.index,-1);
});
test('local server rejects DNS rebinding Host, foreign origin and incorrect ports',()=>{
 const req=(host,origin)=>({headers:{host,...(origin?{origin}:{})},socket:{localPort:4206}});
 assert.equal(validLocalRequest(req('127.0.0.1:4206')),true);assert.equal(validLocalRequest(req('localhost:4206','http://localhost:4206')),true);
 for(const host of ['unexpected.example:4206','127.0.0.1.evil:4206','127.0.0.1:80','127.0.0.1:999999','127.0.0.1:4206@evil'])assert.equal(validLocalRequest(req(host)),false);
 assert.equal(validLocalRequest(req('127.0.0.1:4206','https://example.com')),false);
});
