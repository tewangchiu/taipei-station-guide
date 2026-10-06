import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRequestPath } from './serve_manual_visual.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = new Map([
  ['/camera', 'src/features/camera_guidance/index.html'], ['/camera/', 'src/features/camera_guidance/index.html'],
  ...['app.mjs','overlay.mjs','session.mjs','camera.mjs','policy.mjs','recognizer.mjs','route_package.mjs','route_map.mjs','styles.css'].map(file => [`/camera/${file}`, `src/features/camera_guidance/${file}`]),
  ['/camera/route.json', 'data/camera/route_y28_y26_y23.prototype-v1.json'],
  ['/camera/vendor/opencv-4.13.0.js', 'artifacts/camera_reference/vendor/opencv-4.13.0.js'],
  ...Object.entries({Y28:'SIM01_Y28_FIXED.png',Y26:'SIM02_Y26_FIXED.png',Y23:'SIM03_Y23_FIXED.png',direction:'SIM04_Y26_DIRECTION_ONLY_NEGATIVE.png',unknown:'SIM05_NO_APPROVED_NODE_NEGATIVE.png'}).map(([id,file])=>[`/camera/assets/${id}.png`, `artifacts/camera_reference/landmarks/${file}`]),
]);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.pdf':'application/pdf','.json':'application/json; charset=utf-8','.gz':'application/gzip'};
export function cameraRequestPath(url) {
  try { const name=decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname); return routes.has(name) ? path.join(root,routes.get(name)) : resolveRequestPath(url,'127.0.0.1'); } catch { return null; }
}
export function cameraHeaders(url) {
  const cameraPage = /^\/camera(?:\/?(?:\?.*)?)$/.test(url);
  return { 'cache-control':'no-store', 'content-security-policy':`default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self' ${cameraPage ? 'data:' : ''}; img-src 'self' blob:; media-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval' ${cameraPage ? "'unsafe-eval'" : ''}; worker-src 'self' blob:; style-src 'self'`, 'permissions-policy':`${cameraPage ? 'camera=(self)' : 'camera=()'}, geolocation=(), microphone=()`, 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff', 'x-frame-options':'DENY' };
}
export function validLocalRequest(request) {
 const host=request.headers.host??'';
 if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return false;
 try {
  const parsed=new URL(`http://${host}`);
  if(Number(parsed.port||80)!==request.socket.localPort)return false;
  return !request.headers.origin || request.headers.origin===`http://${host}`;
 } catch { return false; }
}
export function createCameraServer(){return createServer(async(req,res)=>{if(!validLocalRequest(req)){res.writeHead(403,{'content-type':'text/plain','cache-control':'no-store'});res.end('Local host only');return;}const file=cameraRequestPath(req.url??'/');const headers=cameraHeaders(req.url??'/');if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(file?405:404,{...headers,'content-type':'text/plain'});res.end(file?'Method not allowed':'Not found');return;}try{const info=await stat(file);if(!info.isFile())throw Error();res.writeHead(200,{...headers,'content-type':types[path.extname(file)]??'application/octet-stream','content-length':info.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}catch{res.writeHead(404,{...headers,'content-type':'text/plain'});res.end('Not found');}});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT??4206); if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 const server=createCameraServer();server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`Camera prototype: http://127.0.0.1:${port}/camera\nLoopback only. Camera images remain on this device.`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
