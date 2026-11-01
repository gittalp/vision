import {taskThreshold,taskRecordFingerprint} from './glaretask.js';
/* Optional glare panel; kept out of the existing selection and simulation paths. */
import {glareOptions,parseEvalglare,acceptGlareResult,glareSourceCSV,glarePreview,sha256} from './glare.js';
import {zipStore} from './zipstore.js';
import {NATIVE_RUNNER} from './nativeassets.js';
import {drawAngleRings,makeAngularField} from './angles.js';
import {pixelToRay,rayToPixel} from './geometry.js';
import {decodeHDR,hdrHeader,interpret} from './io.js';
import {inCircle} from './math.js';

export function setupGlarePanel(ctx){
 const $=id=>document.getElementById(id),val=id=>Number($(id).value),fmt=ctx.format;
 let prepared=null,result=null,resultDocument=null,checkPreview=null,checkBytes=null,engineReady=false,engineVersion=null,running=false,ticket=0,sourceKey='',engineWorker=null,skipped=false,overlayKey='',taskKey='',taskListKey='';
 const sourceFingerprint=()=>{const s=ctx.current();return s?JSON.stringify([s.source,s.width,s.height,s.geometry,s.mask,s.calibration,s.cropHistory]):'';};
 function message(text,error=false){$('glareStatus').textContent=text;$('glareStatus').classList.toggle('error',error);}
 function taskRecord(){return ctx.current()?.regions?.find(r=>r.id===$('glareTaskRegion').value);}
 function taskRequest(){return $('glareDetection').value==='task'?{regionId:$('glareTaskRegion').value,multiplier:val('glareTaskMultiplier')}:null;}
 function options(){const r=taskRecord(),t=taskRequest(),threshold=t?taskThreshold(r,r?.measurement,t.multiplier).threshold:val('glareThreshold');return glareOptions({mode:$('glareMode').value,size:val('glareSize'),samples:val('glareSamples'),threshold,searchRadius:val('glareRadius'),lowLight:$('glareLowLight').checked,externalEv:$('glareExternalEv').value.trim()===''?null:val('glareExternalEv'),peak:val('glarePeak')});}
 function syncTaskHelp(){
  const records=ctx.current()?.regions||[],key=JSON.stringify(records.map(r=>[r.id,r.name]));
  if(key!==taskListKey){
   const previous=$('glareTaskRegion').value;taskListKey=key;$('glareTaskRegion').replaceChildren(new Option('Choose a saved task region',''));
   for(const r of records)$('glareTaskRegion').append(new Option(r.name,r.id));
   $('glareTaskRegion').value=records.some(r=>r.id===previous)?previous:'';
  }
  const task=$('glareDetection').value==='task';$('glareTaskControls').hidden=!task;
  const info=$('glareTaskInfo');info.classList.remove('error');
  if(task){try{const r=taskRecord(),t=taskThreshold(r,r?.measurement,val('glareTaskMultiplier'));info.textContent=`${t.name}: angular mean ${fmt(t.meanLuminance)} cd/m2 x ${fmt(t.multiplier)} = ${fmt(t.threshold)} cd/m2 detection threshold; ${fmt(t.solidAngleSteradians)} sr. Native source pixels; full glare view retained.`;}catch(e){info.textContent=e.message;info.classList.add('error');}}
  $('glareRadiusHelp').textContent=`Default 0.2 rad = 11.46 degrees. Current: ${fmt(val('glareRadius')*180/Math.PI)} degrees. Groups detected pixels; not a detection threshold.`;
  $('glareLowLightBadge').textContent=$('glareLowLight').checked?'ON':'OFF';
  $('glareLowLightBadge').dataset.state=$('glareLowLight').checked?'on':'off';
  $('glareLowLightState').textContent=$('glareLowLight').checked?'ON (-C l+): legacy DGP correction enabled. It can suppress DGP excessively for dark electrochromic glazing with visible sun. Only the DGP correction changes; source calibration and image-derived illuminance do not.':'OFF (-C l-): documented engine default since 2.14. Does not change image-derived illuminance, calibration or source detection.';
 }
 function sync(){
  syncTaskHelp();
  if(prepared?.job.taskReference&&taskKey!==taskRecordFingerprint(taskRecord(),val('glareTaskMultiplier'))){invalidate('The selected task changed or was deleted. Prepare a fresh glare copy; source calibration is unchanged.');return;}

  const s=ctx.current(),blocked=ctx.busy()>0;const ready=!!s?.geometry?.confirmed&&!ctx.geometryDirty();
  $('glareControls').hidden=skipped;$('glareEnable').hidden=!skipped;$('glareSkip').hidden=skipped;
  $('glarePrepare').disabled=running||blocked||!ready;$('glareRun').disabled=running||blocked||!prepared;
  for(const id of ['glareExportHDR','glareExportJob'])$(id).disabled=running||blocked||!prepared;
  $('glareImport').disabled=running||blocked||!prepared;$('glareSourcesCSV').disabled=!result||running;$('glareResultJSON').disabled=!resultDocument||running;
  $('glareCheckHDR').disabled=!checkBytes||running;$('glareSavePNG').disabled=!result||running;$('glareCheckEngine').disabled=running||blocked;$('glareCancel').hidden=!running;
  for(const id of ['glareMode','glareSize','glareSamples','glareThreshold','glareRadius','glarePeak','glareLowLight','glareExternalEv','glareDetection','glareTaskRegion','glareTaskMultiplier','glareDetectionDefaults'])$(id).disabled=running||blocked;
  $('glareThreshold').disabled=running||blocked||$('glareDetection').value==='task';
  $('glareLimitedNote').hidden=$('glareMode').value!=='limited';
  $('glareGeometry').textContent=s?.geometry?.confirmed?`Applied source: ${s.geometry.projection}, ${fmt(s.geometry.hfov)} x ${fmt(s.geometry.vfov)} degrees. `+(s.geometry.projection==='equisolid'?'Whole-view preparation will really resample equisolid pixels to -vta; it will not relabel them -vth.':'Preparation uses the confirmed projection and optical center.'):'Confirm image geometry before preparing a glare copy. Glare is optional.';
  if(result&&JSON.stringify([ctx.field(),ctx.rings()])!==overlayKey)paintResults();
 }
 function clearOutputs(){taskKey='';prepared=null;result=null;resultDocument=null;checkPreview=null;checkBytes=null;$('glarePreparedView').hidden=true;$('glareResults').hidden=true;$('glareSourceRows').replaceChildren();$('glarePreparation').textContent='No glare copy prepared.';$('glareRaw').textContent='';}
 function invalidate(reason='Source or geometry changed; prepare a fresh glare copy.'){
  ticket++;engineWorker?.terminate();engineWorker=null;running=false;clearOutputs();message(reason);sync();
 }
 function sourceChanged(){const k=sourceFingerprint();if(k!==sourceKey){sourceKey=k;invalidate();}else sync();}
 function sourceCleared(){sourceKey='';skipped=false;invalidate('No glare copy prepared. Other tools do not require a glare calculation.');}
 async function prepare(){
  const my=++ticket,key=sourceFingerprint();running=true;clearOutputs();message('Preparing a separate calibrated image; the source, saved regions and simulations are unchanged.');sync();
  try{const d=await ctx.request('prepareGlare',{options:options(),task:taskRequest()});if(ticket!==my||sourceFingerprint()!==key)return;prepared=d.glare;sourceKey=key;taskKey=taskRecordFingerprint(taskRecord(),val('glareTaskMultiplier'));
   ctx.drawCanvas('glarePreparedCanvas',prepared.preview);$('glarePreparedView').hidden=false;
   const m=prepared.job;$('glarePreparation').textContent=`${m.outputDimensions.join(' x ')} pixels; ${m.outputGeometry.projection}; ${fmt(m.coverage.solidAngleSteradians)} sr; ${fmt(m.coverage.percentForwardHemisphere)}% of a forward hemisphere.\nImage-integrated eye-plane illuminance: ${fmt(m.imagePlaneIlluminanceLux)} lux (pre-RGBE estimate). ${m.measuredIlluminanceLux===null?'No external illuminance supplied.':'External measured value for DGP: '+fmt(m.measuredIlluminanceLux)+' lux.'}\n${m.sampling}\n${m.photometry}\n${m.warnings.join('\n')}`;
   if(m.taskReference)$('glarePreparation').textContent+=`\nTask: ${m.taskReference.name}; solid-angle-weighted mean ${fmt(m.taskReference.meanLuminance)} cd/m2 x ${fmt(m.taskReference.multiplier)} = ${fmt(m.taskReference.threshold)} cd/m2. Application-derived threshold, not native circular -t. Viewing direction is unchanged.`;
   $('glareCommand').textContent='evalglare '+m.args.join(' ');
   message('Glare copy prepared. Press Run evalglare (in browser). The bundled engine is loaded automatically; no Python or local executable is required.');
  }catch(e){if(my===ticket)message(e.message,true);}finally{if(my===ticket){running=false;sync();}}
 }
 function runWorker(action){return new Promise((resolve,reject)=>{
  const w=new Worker(new URL('./glare-runner.bundle.js?v=0.9.2',ctx.scriptURL));engineWorker=w;
  w.onmessage=({data:d})=>{if(d.type==='progress'){message(d.text);return;}w.terminate();if(engineWorker===w)engineWorker=null;d.ok?resolve(d):reject(Error(d.error));};
  w.onerror=e=>{w.terminate();if(engineWorker===w)engineWorker=null;reject(Error(e.message||'Glare worker could not start. Upload the complete folder and allow local workers / WebAssembly.'));};
  const data={action};if(action==='run'){data.job=prepared.job;data.bytes=prepared.hdr;}w.postMessage(data);
 });}
 function engineFound(d){engineReady=true;engineVersion=d.version;$('glareEngineState').textContent='Bundled browser engine: '+d.version+'. Calculation runs on this device. No Python, executable search, or image upload.';}
 async function checkEngine(){const my=++ticket;running=true;message('Checking the bundled browser engine.');sync();try{const d=await runWorker('check');if(my!==ticket)return;engineFound(d);message('Browser engine verified and ready. Prepare your calibrated image, then run glare here.');}catch(e){if(my!==ticket)return;engineReady=false;$('glareEngineState').textContent='Bundled engine could not be loaded. Check that all vendor/evalglare files were uploaded; existing tools remain available.';message(e.message,true);}finally{if(my===ticket){running=false;sync();}}}
 async function run(){if(!prepared)return;const my=++ticket;running=true;message('Starting the bundled evalglare worker.');sync();try{const d=await runWorker('run');if(my!==ticket)return;engineFound(d);showResult(d.document,d.check);message('Browser evalglare finished. DGP, source solid angles and the diagnostic image come from the real engine; source measurements were kept.');}catch(e){if(my===ticket)message(e.message,true);}finally{if(my===ticket){running=false;sync();}}}
 function bytesBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
 function base64Bytes(str){if(typeof str!=='string'||str.length>48*1024*1024)throw Error('Oversized or invalid check image.');const raw=atob(str),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
 function showResult(doc,check=null){
  const accepted=acceptGlareResult(doc,prepared.job);result=accepted;resultDocument={...doc,analysisPreparation:prepared.job};checkPreview=null;checkBytes=null;
  if(check||doc.checkImageBase64){try{const b=check||base64Bytes(doc.checkImageBase64);checkBytes=new Uint8Array(b);const buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),head=hdrHeader(buffer);if(head.width!==prepared.job.outputDimensions[0]||head.height!==prepared.job.outputDimensions[1])throw Error('Check-image dimensions differ from job');
   const f=interpret(decodeHDR(buffer),'auto'),n=f.width*f.height,Y=new Float32Array(n),valid=new Uint8Array(n),colors=new Float32Array(n*3),scale=f.scaleCandidate;
   if(!(scale>0))throw Error('Check image has no supported scale');const mask=prepared.job.coverage.mode==='full-forward-hemisphere'?{enabled:true,cx:.5,cy:.5,radius:.5}:{enabled:false};
   for(let i=0;i<n;i++){valid[i]=inCircle(i%f.width,Math.floor(i/f.width),f.width,f.height,mask)?1:0;Y[i]=f.Y[i]*scale;for(let c=0;c<3;c++)colors[3*i+c]=(f.display[c*3]*f.rgb[3*i]+f.display[c*3+1]*f.rgb[3*i+1]+f.display[c*3+2]*f.rgb[3*i+2])*scale;}
   checkPreview=glarePreview(Y,valid,f.width,f.height,colors);
  }catch(e){checkBytes=null;accepted.warnings+='\nCheck-image preview rejected: '+e.message;}}
  $('glareResults').hidden=false;$('glareDGP').textContent=fmt(accepted.metrics.dgp);$('glareEv').textContent=fmt(accepted.metrics.E_v)+' lux';$('glareOmega').textContent=fmt(accepted.metrics.omega_sources)+' sr';$('glareSourceCount').textContent=accepted.sources.length.toLocaleString();
  $('glareWarnings').textContent=accepted.warnings.trim();$('glareWarnings').hidden=!accepted.warnings.trim();
  $('glareMetrics').textContent=['dgi','ugr','vcp','cgi','dgi_mod','ugr_exp','Lveil'].filter(k=>k in accepted.metrics).map(k=>k+': '+fmt(accepted.metrics[k])).join(' | ');
  $('glareRaw').textContent='Engine: '+accepted.engineVersion+'\n\n'+accepted.raw+'\n\nWarnings:\n'+accepted.warnings;
  $('glareResultScope').textContent=accepted.mode==='limited-rectilinear'?'LIMITED VIEW: outside sources are unknown. External illuminance does not make this a complete-view result.':'Baseline whole-view result. Viewing-field annotations do not recalculate DGP.';
  const measured=prepared.job.measuredIlluminanceLux;
  $('glareResultScope').textContent+=(prepared.job.taskReference?' Task-derived source threshold: ':' Fixed source threshold: ')+fmt(prepared.job.options.threshold)+' cd/m2; prepared raster '+prepared.job.outputDimensions.join(' x ')+'.';
  $('glareResultScope').textContent+=' Low-light correction '+(prepared.job.options.lowLight?'ON (-C l+; legacy application setting)':'OFF (-C l-)')+'. Background: -q 0, (Ev - Edir) / pi.';
  if(measured!==null)$('glareResultScope').textContent+=' DGP uses the supplied '+fmt(measured)+' lux. The engine E_v shown separately remains image-derived.';
  paintResults();message('Detailed engine output imported for the matching prepared image/settings. Source measurements are unchanged.');sync();
 }
 function localRay(world,g){const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],f=unit(g.vd),r=unit(cross(f,g.vu)),u=cross(r,f),v=unit(world);return[dot(v,r),-dot(v,u),dot(v,f)];}
 function paintResults(){if(!prepared||!result)return;overlayKey=JSON.stringify([ctx.field(),ctx.rings()]);const p=checkPreview||prepared.preview,canvas=$('glareResultCanvas');ctx.drawCanvas('glareResultCanvas',p);const c=canvas.getContext('2d'),g=prepared.job.outputGeometry,field=ctx.field(),mask=prepared.job.coverage.mode==='full-forward-hemisphere'?{enabled:true,cx:.5,cy:.5,radius:.5}:{enabled:false};
  if($('glareOverlayField').checked&&field){const inside=makeAngularField(field),pixels=c.getImageData(0,0,p.width,p.height);for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(inCircle(x,y,p.width,p.height,mask)&&!inside(pixelToRay(g,p.width,p.height,x,y))){const i=(y*p.width+x)*4;for(let k=0;k<3;k++)pixels.data[i+k]*=.3;}c.putImageData(pixels,0,0);}
  if($('glareOverlayRings').checked)drawAngleRings(c,g,p.width,p.height,ctx.rings(),field||{},mask);
  const rows=$('glareSourceRows');rows.replaceChildren();const inField=field?makeAngularField(field):null;
  for(const s of result.sources){const ray=s.direction.every(Number.isFinite)&&Math.hypot(...s.direction)>0?localRay(s.direction,g):null,pos=ray?rayToPixel(g,p.width,p.height,...ray):null;
   if(pos){c.save();c.font='bold 14px system-ui';c.strokeStyle='#000';c.lineWidth=3;c.fillStyle='#fff';c.strokeText(String(s.id),pos[0],pos[1]);c.fillText(String(s.id),pos[0],pos[1]);c.restore();}
   const tr=document.createElement('tr');for(const v of [s.id,s.pixels,fmt(s.luminance),fmt(s.solidAngleSteradians),fmt(s.positionIndex),inField&&ray?(inField(ray)?'Inside':'Outside'):'Not applied']){const td=document.createElement('td');td.textContent=v;tr.append(td);}rows.append(tr);
  }
  $('glareCheckCaption').textContent=(checkPreview?'Actual engine check image; numbered source centroids.':'Prepared luminance with engine source-centroid markers; no check image supplied.')+' Field membership refers ONLY to each centroid, not the whole source footprint.';
 }
 function exportJob(){if(!prepared)return;const job=prepared.job,bat='@echo off\r\ncd /d "%~dp0"\r\npy -3 run_glare.py %*\r\npause\r\n',readme='This job requires a real installed evalglare executable and Python 3.\nRun: python run_glare.py "/path/to/evalglare"\nThen import evalglare-result.json in the same prepared VisionSim session.\nNo image is uploaded and no glare metric is approximated by the wrapper.\nThis optional comparison job is separate from the bundled browser engine.\n';
  ctx.download(zipStore({'input.hdr':prepared.hdr,'job.json':JSON.stringify(job,null,2),'run_glare.py':NATIVE_RUNNER,'RUN_GLARE_WINDOWS.bat':bat,'README.txt':readme}),'visionsim-glare-job.zip','application/zip');}
 $('glarePrepare').onclick=prepare;$('glareCheckEngine').onclick=checkEngine;$('glareRun').onclick=run;
 $('glareCancel').onclick=()=>{ticket++;engineWorker?.terminate();engineWorker=null;running=false;message('Glare operation cancelled/discarded. The active calibrated image and region list were kept.');sync();};
 $('glareSkip').onclick=()=>{skipped=true;invalidate('Glare skipped. Continue using measurements, viewing masks and simulations normally.');};
 $('glareEnable').onclick=()=>{skipped=false;message('Optional glare preparation enabled.');sync();};
 $('glareReset').onclick=()=>{skipped=false;invalidate('Only glare preparation/results cleared. Source, calibration and saved regions were not changed.');};
 $('glareExportHDR').onclick=()=>{if(prepared)ctx.download(prepared.hdr,'glare-input.hdr','application/octet-stream');};$('glareExportJob').onclick=exportJob;
 $('glareImport').onchange=async()=>{try{const file=$('glareImport').files[0];if(!file)return;if(file.size>64*1024*1024)throw Error('Glare result JSON exceeds 64 MiB');showResult(JSON.parse(await file.text()));}catch(e){message(e.message,true);}finally{$('glareImport').value='';}};
 $('glareSourcesCSV').onclick=()=>{if(result)ctx.download(new TextEncoder().encode(glareSourceCSV(result)),'glare-sources.csv','text/csv');};
 $('glareResultJSON').onclick=()=>{if(resultDocument)ctx.download(new TextEncoder().encode(JSON.stringify({...resultDocument,...(checkBytes?{checkImageBase64:bytesBase64(checkBytes)}:{})},null,2)),'evalglare-result.json','application/json');};
 $('glareCheckHDR').onclick=()=>{if(checkBytes)ctx.download(checkBytes,'evalglare-check.hdr','application/octet-stream');};
 $('glareSavePNG').onclick=()=>{if(result)$('glareResultCanvas').toBlob(async b=>{if(b)ctx.download(new Uint8Array(await b.arrayBuffer()),'evalglare-diagnostic.png','image/png');});};
 for(const id of ['glareOverlayField','glareOverlayRings'])$(id).onchange=paintResults;
 $('glareDetectionDefaults').onclick=()=>{
  $('glareDetection').value='fixed';$('glareThreshold').value=2000;$('glareRadius').value=.2;$('glarePeak').value=50000;$('glareTaskMultiplier').value=5;
  invalidate('Source-detection settings reset. Low-light correction, analysis size, subpixel sampling, measured lux, calibration and saved regions were kept. Prepare again.');
 };
 $('glareTaskSelect').onclick=()=>ctx.selectTask?.();
 for(const id of ['glareTaskMultiplier','glareRadius'])$(id).addEventListener('input',()=>syncTaskHelp());
 for(const id of ['glareMode','glareSize','glareSamples','glareThreshold','glareRadius','glarePeak','glareLowLight','glareExternalEv','glareDetection','glareTaskRegion','glareTaskMultiplier'])$(id).addEventListener('change',()=>invalidate('Glare settings changed; prepare a new copy before running or importing results.'));
 return {sync,sourceChanged,sourceCleared,invalidate,report:()=>({status:skipped?'skipped':result?'engine-output':prepared?'prepared-no-calculation':'not-run',engineReady,engineVersion,preparation:prepared?.job||null,result:result||null})};
}
