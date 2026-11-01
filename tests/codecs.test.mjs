import fs from 'node:fs';import assert from 'node:assert/strict';import {decodeEXR} from '../js/exr.js';import {decodeHDR,interpret} from '../js/io.js';
const root=new URL('./fixtures/',import.meta.url),records=JSON.parse(fs.readFileSync(new URL('manifest.json',root))),results=[];
function buffer(p){const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
for(const r of records){const d=await decodeEXR(buffer(new URL(r.file,root))),e=new Float32Array(buffer(new URL(r.expected+'_expected.f32',root)));let max=0;for(let i=0;i<e.length;i++)max=Math.max(max,Math.abs(d.rgb[i]-e[i]));assert.equal(max,0);results.push({file:r.file,pixels:e.length/3,maximumAbsoluteError:max,pass:true});}
for(const r of records.slice(0,2)){const b=buffer(new URL(r.file,root));await assert.rejects(()=>decodeEXR(b.slice(0,100)));await assert.rejects(()=>decodeEXR(b.slice(0,b.byteLength-1)));}
console.log(JSON.stringify({comparisons:results.length,allPassed:true,truncationTests:4,results},null,2));
// Optional independent user-input comparison, keeping the scenes separate:
if(process.argv.length===4){
 const hdr=interpret(decodeHDR(buffer(process.argv[2]))),exr=interpret(await decodeEXR(buffer(process.argv[3])));assert.equal(hdr.Y.length,exr.Y.length);
 let maxAbsolute=0,maxRelative=0,sumAbsolute=0;for(let i=0;i<hdr.Y.length;i++){const a=hdr.Y[i]*hdr.scaleCandidate,b=exr.Y[i]*exr.scaleCandidate,d=Math.abs(a-b);maxAbsolute=Math.max(maxAbsolute,d);if(b>0)maxRelative=Math.max(maxRelative,d/b);sumAbsolute+=d;}
 console.log(JSON.stringify({type:'same-room file-convention comparison, not independent photometry',pixels:hdr.Y.length,hdrScale:hdr.scaleCandidate,exrScale:exr.scaleCandidate,maxAbsolute,maxRelative,meanAbsolute:sumAbsolute/hdr.Y.length},null,2));
}
