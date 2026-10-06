import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const source=option('--source');const opencv=option('--opencv');
const CV_URL='https://docs.opencv.org/4.13.0/opencv.js';
const CV_HASH='63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0';
const hash=data=>createHash('sha256').update(data).digest('hex');
async function saveVerified(destination,data,expected){if(hash(data)!==expected)throw Error(`Hash mismatch: ${path.basename(destination)}`);await mkdir(path.dirname(destination),{recursive:true});try{const old=await readFile(destination);if(hash(old)!==expected)throw Error(`Existing file differs; refusing overwrite: ${destination}`);return;}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(destination,data,{flag:'wx'});}
if(!source)throw Error('Usage: npm run prepare:camera -- --source /path/to/approved/run_01_manual_v1 [--opencv /path/to/opencv.js]');
const manifest=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
if(manifest.pack_id!=='run_01_manual_v1'||manifest.derivation_review?.privacy_review!=='approved_deidentified')throw Error('Only approved reference pack run_01_manual_v1 is supported');
const manifestBytes=await readFile(path.join(source,'manifest.json'));
await saveVerified(path.join(root,'artifacts/camera_reference/landmarks/manifest.json'),manifestBytes,hash(manifestBytes));
const expectedNames=['SIM01_Y28_FIXED.png','SIM02_Y26_FIXED.png','SIM03_Y23_FIXED.png','SIM04_Y26_DIRECTION_ONLY_NEGATIVE.png','SIM05_NO_APPROVED_NODE_NEGATIVE.png'];
for(const name of expectedNames){const sample=manifest.samples.find(s=>s.filename===name);if(!sample||sample.privacy_review!=='approved_deidentified')throw Error('Reference sample not approved');await saveVerified(path.join(root,'artifacts/camera_reference/landmarks',name),await readFile(path.join(source,name)),sample.sha256);}
const local=path.join(root,'artifacts/camera_reference/vendor/opencv-4.13.0.js');
let cvData;
if(opencv)cvData=await readFile(opencv);else{try{cvData=await readFile(local);}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(CV_URL);if(!response.ok)throw Error(`OpenCV download failed ${response.status}`);cvData=Buffer.from(await response.arrayBuffer());}}
await saveVerified(local,cvData,CV_HASH);
// Historical manual UI is still runnable on the same isolated server.
for(const name of expectedNames.slice(0,3)){const sample=manifest.samples.find(s=>s.filename===name);await saveVerified(path.join(root,'artifacts/route_reference/run_01_manual_v1',name),await readFile(path.join(source,name)),sample.sha256);}
console.log('Verified local assets ready. No raw evidence changed; assets are ignored by Git.');
