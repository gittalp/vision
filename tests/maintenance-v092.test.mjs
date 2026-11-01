/* Focused maintenance regression. No new photometric or clinical model. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {conditionPreview,CONDITION_NAMES} from '../js/conditions.js';
import {glareOptions,evalglareArguments} from '../js/glare.js';
const ROOT=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,ROOT),'utf8');
const tests=[];const test=(name,fn)=>{fn();tests.push({name,passed:true});console.log('PASS',name);};
const version=JSON.parse(read('package.json')).version;
test('Single declared workspace release matches all current visible page markers',()=>{
 assert.equal(version,'0.9.2');assert.equal(JSON.parse(read('release.json')).version,version);
 for(const name of ['index.html','METHODS.html','GLARE.html','GLARE_GUIDE.html','START_HERE.html']){
  const s=read(name),matches=[...s.matchAll(/data-workspace-version>([^<]+)</g)];assert(matches.length,name);
  for(const m of matches)assert.equal(m[1],version,name);
 }
 assert(read('js/worker.js').includes("const VERSION='"+version+"';"));
});
test('Only an explicit low-light switch and scoped detection-reset action remain',()=>{
 const s=read('index.html');assert(!s.includes('id="glareLegacyDefaults"'));assert(!s.includes('id="glareEngineDefaults"'));
 assert(s.includes('id="glareDetectionDefaults"'));assert(/id="glareLowLight"[^>]*role="switch"[^>]*checked/.test(s));
 assert(s.includes('Enable DGP low-light correction'));assert(!s.includes('Restore version 0.9 settings'));
});
test('DGP help includes low-end interpretation without a comfort guarantee',()=>{
 const s=read('GLARE_GUIDE.html');assert(s.includes('id="dgp"'));assert(s.includes('DGP = 0.20'));assert(s.includes('exact prediction'));assert(s.includes('below</em> 0.20'));
 assert(read('index.html').includes('What do DGP, UGR and VCP mean?'));
});
test('Condition relabeling retains existing identifier and seeded float32 output',()=>{
 const f=JSON.parse(read('tests/maintenance-condition-baseline.json'));
 const input=Float32Array.from({length:f.width*f.height*3},(_,i)=>.25+((i*37)%101)/50);
 const result=conditionPreview(input,f.width,f.height,f.parameters);
 const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
 assert.equal(CONDITION_NAMES.diabetic,f.newLabel);assert.equal(result.details.name,f.newLabel);
 assert.equal(hash(result.before),f.before);assert.equal(hash(result.after),f.after);
 assert(read('index.html').includes('<option value="diabetic">Diabetic retinopathy simulation</option>'));
});
test('Correction choice changes only the l+ versus l- engine argument',()=>{
 const base={size:800,samples:2,threshold:2000,searchRadius:.2,peak:50000};
 const on=evalglareArguments({...base,lowLight:true}),off=evalglareArguments({...base,lowLight:false});
 assert.equal(on.length,off.length);const changed=on.map((x,i)=>x!==off[i]?i:-1).filter(i=>i>=0);
 assert.equal(changed.length,1);assert.equal(on[changed[0]],'l+');assert.equal(off[changed[0]],'l-');
 assert.equal(glareOptions(base).lowLight,true);
});
test('Requested changes do not add an uncalibrated circadian measurement button',()=>{
 assert(!read('index.html').includes('id="runCircadian"'));assert(!read('js/worker.js').includes("case 'circadian'"));
});
fs.mkdirSync(new URL('qa-output/maintenance/',ROOT),{recursive:true});
fs.writeFileSync(new URL('qa-output/maintenance/tests.json',ROOT),JSON.stringify({passed:tests.length,tests},null,2));
console.log(JSON.stringify({passed:tests.length}));
