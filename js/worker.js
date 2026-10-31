import {measureRegion,targetSurround} from './regionstats.js';
import {validateRegion,containsRegion} from './selections.js';
import {makeAngularField,ringParameters,solidAnglePerPixel} from './angles.js';
import {filterChroma,reconstructColor} from './chroma.js';
import {circularView,tangentFilter} from './spherical.js';
import {makeFieldMask,paintField,fieldParameters} from './fieldmask.js';
import {falseRange,falseValue,legendTicks} from './falsecolor.js';
import {metadataSuggestion,calculateFov} from './fov.js';
import {colorViewport} from './colorview.js';
import {conditionPreview} from './conditions.js';
import {loadSingle,decodePhoto,interpret,encodeHDR,encodePFM,jpegMetadata,srgbEncode,SRGB_PRIMARIES,rewriteHDRGeometry} from './io.js';
import {stats,inCircle,pairContrast,estimateResponse,mergeBracket,viewport,devas} from './math.js';
import {validateGeometry,parseView,viewString,cropGeometry,cropMask,cropFrame,validateCrop,pixelToRay} from './geometry.js';
import {memoryPlan} from './resources.js';
import {responseSamples,startMerge,addExposure,finishMerge,validateResponse} from './bracket.js';
import {angularReproject} from './reproject.js';
const VERSION='0.6.0';
let appliedField=null,annotationRings=ringParameters();
let fieldPreview=null;
let education=null,fovProvenance=null;
let originalFile=null,geometryState=null,geometryNote='',cropHistory=[],undo=null,allocation=null;

let frame=null,source=[],summary=null,scale=1,calibration={kind:'relative',scale:1},mask={enabled:false},saved={},response=null,simulation=null;education=null;fieldPreview=null;appliedField=null;
const send=(id,data,transfer=[])=>postMessage({id,...data},transfer);
const progress=(id,text,fraction=null)=>send(id,{event:'progress',text,fraction});
function requireFrame(){if(!frame)throw Error('Load an image first');}
function checkMask(m){if(!m?.enabled)return {enabled:false};if(![m.cx,m.cy,m.radius].every(Number.isFinite)||m.radius<=0||Math.abs(m.cx)>1e6||Math.abs(m.cy)>1e6||m.radius>1e6)throw Error('Invalid image-circle definition');return m;}
async function identity(file){let sha256=null;if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}return {name:file.name,bytes:file.size,sha256,hashStatus:sha256?'complete file':'unavailable in this browser context'};}
function reset(){appliedField=null;annotationRings=ringParameters();fieldPreview=null;education=null;fovProvenance=null;originalFile=null;geometryState=null;geometryNote='';cropHistory=[];undo=null;allocation=null;frame=null;summary=null;source=[];scale=1;calibration={kind:'relative',scale:1};mask={enabled:false};saved={};response=null;simulation=null;education=null;}
function state(){return {version:VERSION,appliedField,annotationRings,fovSuggestion:metadataSuggestion(frame.header?.cameraMetadata||frame.header?.bracketMetadata?.[0]||frame.header||{}),fovProvenance,phone:frame.header?.phone||null,geometry:geometryState,geometryNote,correctedView:geometryState?.confirmed?viewString(geometryState):null,cropHistory,canUndoCrop:!!undo,undoKind:undo?.kind||null,canHeaderOnly:!!originalFile&&frame.format==='hdr'&&!cropHistory.length,memoryPlan:allocation,source,width:frame.width,height:frame.height,format:frame.format,header:frame.header,sampling:frame.sampling||'native decoded raster',originalDimensions:frame.originalWidth?[frame.originalWidth,frame.originalHeight]:[frame.width,frame.height],notes:frame.notes,negativeFraction:frame.negativeFraction,scaleCandidate:frame.scaleCandidate,colorProfile:frame.colorProfile,calibration,mask,summary:scaledStats(summary),saved,quality:frame.quality||null,response:response?{method:response.method,diagnostics:response.diagnostics,anchor:response.anchor}:null};}
function scaledStats(s){if(!s)return s;const out={...s};for(const key of ['mean','minimum','maximum','median','p05','p95','sd'])if(s[key]!==null&&s[key]!==undefined)out[key]=s[key]*scale;return out;}
function globalStats(){summary=stats(frame.Y,frame.width,frame.height,null,mask,frame.valid);if(!summary.count)throw Error('No valid pixels in this image mask');}
function units(){return calibration.kind==='relative'?'relative Y':'cd/m2';}
function renderArray(Y,w,h,{mode='natural',ev=0,log=true,min=null,max=null,palette='photosphere',bands=0,divisions=8,clip=true,showOutsideMask=false,nativeSize=false}={},rgbFrame=null,base=null){
 const ratio=nativeSize?1:Math.min(1,1280/w,900/h),W=Math.max(1,Math.round(w*ratio)),H=Math.max(1,Math.round(h*ratio)),rgba=new Uint8ClampedArray(W*H*4),ss=base||summary;
 const range=mode==='false'?falseRange({min,max,log,palette,bands,divisions,clip,units:units()},ss,scale):null,anchor=(ss?.median>0?ss.median:ss?.mean>0?ss.mean:1),gain=.18/anchor*2**ev;
 for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){const x=Math.min(w-1,Math.floor((xx+.5)*w/W)),y=Math.min(h-1,Math.floor((yy+.5)*h/H)),i=y*w+x,at=4*(yy*W+xx);rgba[at+3]=255;
  if(rgbFrame&&((!showOutsideMask&&!inCircle(x,y,w,h,rgbFrame.previewMask||mask))||(rgbFrame.valid&&!rgbFrame.valid[i]))){const n=((xx>>3)+(yy>>3))%2?34:25;rgba[at]=rgba[at+1]=rgba[at+2]=n;continue;}
  const luminance=Y[i];if(!Number.isFinite(luminance)||luminance<0){rgba[at]=230;rgba[at+1]=0;rgba[at+2]=220;continue;}
  if(mode==='false'){rgba.set(falseValue(luminance*scale,range),at);}
  else {const den=1+luminance*gain;let color=[luminance,luminance,luminance];if(rgbFrame&&mode==='natural'){const m=rgbFrame.display,r=rgbFrame.rgb[i*3],g=rgbFrame.rgb[i*3+1],b=rgbFrame.rgb[i*3+2];color=[m[0]*r+m[1]*g+m[2]*b,m[3]*r+m[4]*g+m[5]*b,m[6]*r+m[7]*g+m[8]*b];}
   for(let c=0;c<3;c++)rgba[at+c]=255*Math.max(0,Math.min(1,srgbEncode(Math.max(0,color[c])*gain/den)));
  }
 }
 return {rgba,width:W,height:H,legend:range?{...range,ticks:legendTicks(range)}:null,display:{toneMap:'global luminance Reinhard, shared median anchor',exposureEV:ev,anchor,measurementUnaffected:true}};
}
function annotationView(width=800,height=null){
 const W=Math.max(1,Math.round(width)),H=height||Math.max(1,Math.round(W*frame.height/frame.width)),n=W*H,Y=new Float32Array(n),rgb=new Float32Array(n*3),valid=new Uint8Array(n),rays=new Float64Array(n*3),omega=new Float64Array(n),g=geometryState,mat=frame.display;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=(x+.5)*frame.width/W-.5,sy=(y+.5)*frame.height/H-.5,ix=Math.min(frame.width-1,Math.max(0,Math.round(sx))),iy=Math.min(frame.height-1,Math.max(0,Math.round(sy))),at=iy*frame.width+ix,i=y*W+x;
  if(!inCircle(ix,iy,frame.width,frame.height,mask)||(frame.valid&&!frame.valid[at]))continue;const ray=pixelToRay(g,frame.width,frame.height,sx,sy);if(!ray)continue;valid[i]=1;rays.set(ray,i*3);Y[i]=frame.Y[at];omega[i]=solidAnglePerPixel(g,W,H,x,y);
  for(let c=0;c<3;c++)rgb[3*i+c]=mat[c*3]*frame.rgb[3*at]+mat[c*3+1]*frame.rgb[3*at+1]+mat[c*3+2]*frame.rgb[3*at+2];
 }return{width:W,height:H,Y,rgb,valid,rays,omega,geometry:g,mask,details:{sampling:'nearest source sample for annotation preview only; native field measurements are separate'}};
}
function report(extra={}){return {schema:'visionsim-hdr-report-v3',createdUTC:new Date().toISOString(),...state(),geometry:geometryState,display:extra.display||null,simulation:simulation?.details||null,lowVisionConditions:education?.details||null,fieldOverlay:fieldPreview?.details||null,contrast:saved.A&&saved.B?pairContrast(saved.A.mean,saved.B.mean):null,units:units(),scope:'Research prototype. Not a clinical diagnosis, hazard-visibility score, glare rating, or safety/compliance assessment.',calibrationMeaning:calibration.kind==='relative'?'No absolute photometric scale':calibration.kind==='patch'?'One selected patch matched to a supplied meter value; not independent radiometric validation':calibration.evidence||'File luminance scale; no independent validation',dependencies:'Local processing. Optional libheif-js 1.23.5 codec from local vendor file or operator-enabled CDN; image bytes are never uploaded.',limitations:['Photopic Y from stated color interpretation, not individual spectral sensitivity.','Primary region means use equal source pixels; solid-angle-weighted means are reported separately.','HDR extension or metadata does not prove scene linearity or camera accuracy.','No vignetting, dark-field, spectral mismatch, or temporal correction applied.','Visibility is a locally sampled DeVAS-derived approximation; full-field output uses overlapping tangent patches.','Any subsampled photo/bracket has reduced, potentially aliased angular detail.']};}
function inferGeometry(){
 geometryState=null;geometryNote='Geometry has not been confirmed. Header editing does not reproject pixels.';
 const h=frame.header||{};
 try{if(h.geometry)geometryState=validateGeometry({...h.geometry,confirmed:false});else if(h.view||h.VIEW)geometryState=parseView(h.view||h.VIEW);if(geometryState)geometryNote='Imported header is a draft. Review the actual lens, crop and view before applying.';}catch(e){geometryNote='Header needs correction: '+e.message;}
 if(h.circle){try{mask=checkMask(h.circle);}catch{geometryNote+=' Stored circle was invalid and was not applied.';}}
}
async function inspectFiles(files){const meta=[];for(const f of files){if(!/\.jpe?g$/i.test(f.name))throw Error('Exposure brackets must be JPEG files');if(f.size>256*1024*1024)throw Error('A JPEG exceeds the 256 MiB per-file safety limit');meta.push({name:f.name,...jpegMetadata(await f.arrayBuffer())});}return meta;}
function bracketPlan(files,meta,maxWidth,budgetMiB){
 if(!meta.length)throw Error('Select an exposure sequence');let largest=0;for(const f of files)largest=Math.max(largest,f.size);
 const w=meta[0].encodedWidth,h=meta[0].encodedHeight;if(meta.some(m=>m.encodedWidth!==w||m.encodedHeight!==h))throw Error('Exposure dimensions differ');
 if(w*h>25000000)throw Error('A JPEG exceeds the documented 25 MP decoder safety limit. Resize externally before import.');
 return memoryPlan(meta[0],files.length,maxWidth,budgetMiB,largest);
}
function demandBudget(plan){if(!plan.fits)throw Error(`Estimated working allocation ${Math.ceil(plan.estimatedMiB)} MiB exceeds the selected ${plan.budgetMiB} MiB budget. Reduce working width or choose a larger budget on a suitable device. No exposures were discarded.`);}
function cropAllocation(r,budgetMiB){if(!Number.isFinite(budgetMiB)||budgetMiB<64||budgetMiB>8192)throw Error('Choose a crop budget between 64 and 8192 MiB');const old=frame.rgb.byteLength+frame.Y.byteLength+(frame.valid?.byteLength||0),previous=undo&&undo.frame!==frame?undo.frame.rgb.byteLength+undo.frame.Y.byteLength+(undo.frame.valid?.byteLength||0):0,estimate=(old+previous+r.w*r.h*25+64*1048576)*1.2;if(estimate>budgetMiB*1048576)throw Error(`Crop/undo needs approximately ${Math.ceil(estimate/1048576)} MiB, above the selected budget. Increase the budget or reload a smaller image.`);}
onmessage=async ({data:m})=>{const {id,op}=m;try{
 if(op==='inspectBracket'){const meta=await inspectFiles(m.files);send(id,{event:'result',meta,plan:bracketPlan(m.files,meta,m.maxWidth??2048,m.budgetMiB??1024)});return;}
 if(op==='load'){reset();progress(id,'Decoding floating-point image');frame=await loadSingle(m.file,m.profile,f=>progress(id,'Decoding image',f),m.phone||{});originalFile=m.file;if(!frame.originalWidth){frame.originalWidth=frame.width;frame.originalHeight=frame.height;}progress(id,'Recording source and measuring native raster');source=[await identity(m.file)];inferGeometry();globalStats();if(m.scaleMode==='file'&&frame.scaleCandidate>0){if(!Number.isFinite(Math.fround(summary.maximum*frame.scaleCandidate))||!Number.isFinite(Math.fround(summary.minimum*frame.scaleCandidate)))throw Error('File luminance scale exceeds float32 range; reopen in relative mode for inspection');scale=frame.scaleCandidate;calibration={kind:'declared',scale,source:'file-import',verified:false,evidence:'Supported file luminance convention applied at import. Absolute calibration has not been independently verified.'};}send(id,{event:'result',state:state()});return;}
 if(op==='bracket'){
  if(!m.confirm)throw Error('Confirm fixed camera processing and an aligned static scene');
  if(m.files.length<(m.response?2:3))throw Error(m.response?'Use at least two exposures with a known response':'Use at least three exposures to estimate a response');
  if(m.times.length!==m.files.length||m.times.some(t=>!Number.isFinite(t)||t<=0))throw Error('Every exposure time must be positive seconds');
  let lo=Infinity,hi=0;for(const t of m.times){lo=Math.min(lo,t);hi=Math.max(hi,t);}if(hi/lo<2)throw Error('Bracket must span at least one exposure stop');
  const metas=await inspectFiles(m.files),plan=bracketPlan(m.files,metas,m.maxWidth??2048,m.budgetMiB??1024);demandBudget(plan);
  for(const key of ['iso','fNumber','whiteBalance','model']){const values=new Set(metas.map(x=>x[key]).filter(x=>x!==undefined));if(values.size>1)throw Error(`Bracket ${key} differs. Use fixed aperture, ISO, white balance and camera processing.`);}
  reset();allocation=plan;let fitted=null;
  if(m.response){if(m.response.size>1024*1024)throw Error('Response JSON exceeds 1 MiB');fitted=validateResponse(JSON.parse(await m.response.text()));}
  const samples=[];let width=plan.width,height=plan.height,ow=metas[0].encodedWidth,oh=metas[0].encodedHeight;
  // First pass keeps only 512 RGB samples per exposure, not the image stack.
  for(let i=0;i<m.files.length;i++){
   if(!fitted){progress(id,`Response samples: exposure ${i+1} of ${m.files.length}`,i/m.files.length);const d=await decodePhoto(m.files[i],m.maxWidth??2048,25000000);if(d.width!==width||d.height!==height)throw Error('Decoded dimensions do not match preflight');samples.push(responseSamples(d.u8,width,height));}
   source.push(await identity(m.files[i]));
  }
  if(!fitted){progress(id,'Fitting response curves from the complete sequence');fitted=estimateResponse(samples,m.times,512,1,{samples:512,preSampled:true});}response=fitted;
  const accumulator=startMerge(width,height,response);
  for(let i=0;i<m.files.length;i++){progress(id,`Radiance merge: exposure ${i+1} of ${m.files.length}`,i/m.files.length);const d=await decodePhoto(m.files[i],m.maxWidth??2048,25000000);if(d.width!==width||d.height!==height)throw Error('Decoded dimensions differ');addExposure(accumulator,d.u8,m.times[i]);}
  frame=interpret(finishMerge(accumulator,m.times),'rec709');frame.originalWidth=ow;frame.originalHeight=oh;frame.sampling=width===ow&&height===oh?'native browser-decoded JPEG codes':'nearest source-pixel subsampling of browser-decoded JPEG codes';frame.header.bracketMetadata=metas;frame.notes.push('Relative radiance; independent channel anchors are not calibrated color. No alignment or deghosting. All selected exposures were included.');inferGeometry();globalStats();send(id,{event:'result',state:state()});return;
 }
 requireFrame();
 if(op==='fov'){const result=calculateFov({...m.parameters,width:frame.originalWidth||frame.width,height:frame.originalHeight||frame.height,cropHistory});send(id,{event:'result',fov:result});return;}
 if(op==='geometry'){
  if(!m.confirm)throw Error('Check the geometry confirmation box before applying');
  geometryState=validateGeometry({...m.geometry,confirmed:true});fovProvenance=m.fovProvenance||null;geometryNote='Operator-confirmed geometry. Pixel samples and luminance scale were not changed.';simulation=null;education=null;fieldPreview=null;appliedField=null;
  send(id,{event:'result',state:state()});return;
 }
 if(op==='crop'){
  const r=validateCrop(m.rect,frame.width,frame.height);if(r.w===frame.width&&r.h===frame.height&&r.x===0&&r.y===0&&!m.circle)throw Error('This crop already covers the whole image');cropAllocation(r,m.budgetMiB??1024);const inputMask=m.circle?checkMask(m.circle):mask;
  const nextGeometry=geometryState?cropGeometry(geometryState,r,frame.width,frame.height):null,nextMask=cropMask(inputMask,r,frame.width,frame.height),nextFrame=cropFrame(frame,r),nextSummary=stats(nextFrame.Y,r.w,r.h,null,nextMask,nextFrame.valid);if(!nextSummary.count)throw Error('Crop has no valid pixels; current image was retained');
  undo={kind:'crop',frame,summary,mask,geometryState,geometryNote,calibration:{...calibration},scale,cropHistory:[...cropHistory]};
  cropHistory=[...cropHistory,{rect:r,sourceDimensions:[frame.width,frame.height],sourceOrigin:frame.origin||{x:0,y:0},method:'exact float32 pixel subset; no resize/interpolation',scalePreserved:scale,geometryUpdated:!!nextGeometry,selectionShape:m.circle?'circle':'rectangle',circleExcluded:!!m.circle}];
  nextFrame.negativeFraction=nextFrame.Y.reduce((n,v)=>n+(v<0?1:0),0)/nextFrame.Y.length;frame=nextFrame;summary=nextSummary;mask=nextMask;geometryState=nextGeometry;geometryNote=nextGeometry?'Crop FOV and shift/lift updated without resampling. Confirmation state retained.':'Cropped pixels. Enter and confirm geometry for the cropped raster.';saved={};simulation=null;education=null;fieldPreview=null;appliedField=null;
  send(id,{event:'result',state:state()});return;
 }
 if(op==='undoCrop'){
  if(!undo)throw Error('No crop to undo');({frame,summary,mask,geometryState,geometryNote,calibration,scale,cropHistory}=undo);undo=null;saved={};simulation=null;education=null;fieldPreview=null;appliedField=null;send(id,{event:'result',state:state()});return;
 }
 if(op==='render'){
  let p=renderArray(frame.Y,frame.width,frame.height,{...m.display,showOutsideMask:!!m.editingCrop},frame);
  if(appliedField&&m.showFieldOnSource&&!m.editingCrop){const v=annotationView(p.width,p.height);const selected=makeFieldMask(v,appliedField);p={...p,rgba:paintField(p.rgba,v,selected.selected,appliedField),fieldAnnotated:true};}
  send(id,{event:'result',preview:p},[p.rgba.buffer]);return;
 }
 if(op==='mask'){const nextMask=checkMask(m.mask),nextSummary=stats(frame.Y,frame.width,frame.height,null,nextMask,frame.valid);if(!nextSummary.count)throw Error('No valid pixels in this image mask; previous mask was kept');undo={kind:'mask',frame,summary,mask,geometryState,geometryNote,calibration:{...calibration},scale,cropHistory:[...cropHistory]};mask=nextMask;summary=nextSummary;saved={};simulation=null;education=null;fieldPreview=null;appliedField=null;send(id,{event:'result',state:state()});return;}
 if(op==='calibrate'){let nextScale=1,nextCalibration;
  if(m.kind==='relative'){nextCalibration={kind:'relative',scale:1};}
  else if(m.kind==='declared'){if(!(frame.scaleCandidate>0))throw Error('No supported file luminance scale. Use a measured patch instead');nextScale=frame.scaleCandidate;nextCalibration={kind:'declared',scale:nextScale,evidence:'User confirms file-scale convention; no independent validation'};}
  else if(m.kind==='patch'){if(!m.roi)throw Error('Draw the measured patch on the image first');if(!Number.isFinite(m.luminance)||m.luminance<=0)throw Error('Measured luminance must be positive cd/m2');const s=measureRegion(frame,m.roi,{mask,scale:1});if(s.count<9||s.mean<=0||s.negativeFraction>0)throw Error('Patch needs at least 9 valid, nonnegative pixels with positive mean');nextScale=m.luminance/s.mean;nextCalibration={kind:'patch',scale:nextScale,luminance:m.luminance,roi:m.roi,referenceRaster:[frame.width,frame.height],referenceOrigin:frame.origin||{x:0,y:0},patchUnscaled:s,meterNote:String(m.note||'').slice(0,300),evidence:'Single-anchor calibration, not independent validation'};}else throw Error('Unknown calibration mode');
  if(!Number.isFinite(nextScale)||nextScale<=0)throw Error('Invalid calibration scale; previous scale was kept');
  if(!Number.isFinite(Math.fround(summary.minimum*nextScale))||!Number.isFinite(Math.fround(summary.maximum*nextScale)))throw Error('Scaled luminance would exceed float32 range; previous scale was kept');
  scale=nextScale;calibration=nextCalibration;saved={};simulation=null;education=null;fieldPreview=null;appliedField=null;send(id,{event:'result',state:state()});return;}
 if(op==='roi'){
  const region=validateRegion(m.roi,frame.width,frame.height),options={mask,scale,geometry:geometryState,field:m.limitField?appliedField:null};
  if(m.limitField&&!appliedField)throw Error('Apply a viewing field before restricting measurements');
  let result=measureRegion(frame,region,options),comparisonRegions=null,subtracted=false,definition='Selected source region';
  if(!result.count)throw Error('No valid pixels within this region and measurement scope');
  if(m.save==='A'){saved.A=result;delete saved.B;}
  else if(m.autoSubtract&&saved.A?.region&&containsRegion(region,saved.A.region,frame.width,frame.height)){
   const pair=targetSurround(frame,region,saved.A.region,options);if(!pair.B.count)throw Error('The outer selection leaves no background after removing A');
   result=pair.B;comparisonRegions={A:pair.A,B:pair.B};subtracted=pair.subtracted;definition=pair.definition;
   if(m.save==='B'){saved.A=pair.A;saved.B=pair.B;}
  }else if(m.save==='B'){
   definition=m.autoSubtract?'B is used as drawn; it does not fully enclose A, so no automatic subtraction':'Automatic subtraction is off; B is used as drawn';
   if(saved.A?.region)saved.A=measureRegion(frame,saved.A.region,options);saved.B=result;
  }
  if(!comparisonRegions&&saved.A&&saved.B)comparisonRegions=saved;
  send(id,{event:'result',roi:result,saved,comparisonRegions,subtracted,definition,comparisonSaved:!!m.save,contrast:comparisonRegions?pairContrast(comparisonRegions.A.mean,comparisonRegions.B.mean):null});return;
 }
 if(op==='measureField'){
  if(!appliedField)throw Error('Show a viewing field first');progress(id,'Measuring native source pixels inside viewing field');
  const result=measureRegion(frame,null,{mask,scale,geometry:geometryState,field:appliedField});send(id,{event:'result',measurement:result,units:units()});return;
 }
 if(op==='rings'){if(!geometryState?.confirmed)throw Error('Confirm geometry before applying angular rings');annotationRings=ringParameters(m.parameters);send(id,{event:'result',rings:annotationRings});return;}
 if(op==='pixel'){const x=Math.floor(m.x),y=Math.floor(m.y);let value=null;if(x>=0&&y>=0&&x<frame.width&&y<frame.height&&inCircle(x,y,frame.width,frame.height,mask)&&(!frame.valid||frame.valid[y*frame.width+x]))value=frame.Y[y*frame.width+x]*scale;send(id,{event:'result',pixel:{x,y,value,units:units()}});return;}
 if(op==='resetSimulation'){
  if(!['visibility','education','all','field'].includes(m.which))throw Error('Unknown reset target');
  if(m.which==='visibility'||m.which==='all')simulation=null;
  if(m.which==='education'||m.which==='all')education=null;
  if(m.which==='field'){fieldPreview=null;appliedField=null;annotationRings=ringParameters();}
  send(id,{event:'result',state:state(),reset:m.which});return;
 }
 if(op==='simulate'){
  if(!m.confirm||!geometryState?.confirmed)throw Error('Confirm and apply source geometry first');
  const p=m.parameters||{},absolute=calibration.kind!=='relative';let view,model;
  if(p.domain==='full'){
   progress(id,'Sampling the complete circular field');view=circularView(frame,geometryState,mask,p.fullSize||800);
   model=tangentFilter(frame,geometryState,mask,view,{...p,scale:absolute?scale:1,absolute},(f,t)=>progress(id,t,f));model.Y=model.values;
   if(absolute)for(let i=0;i<view.Y.length;i++)view.Y[i]*=scale;
  }else{
   progress(id,'Reprojecting a perspective detail view');view=viewport(frame,{...geometryState,mask},p);
   if(absolute)for(let i=0;i<view.Y.length;i++)view.Y[i]*=scale;
   model=devas(view.Y,view.width,view.height,{...p,absolute},f=>progress(id,'Thresholding spatial-frequency bands',f));
  }
  const localSummary=stats(view.Y,view.width,view.height,null,null,view.valid),identity=[1,0,0,0,1,0,0,0,1];
  let originalRGB=null,filteredRGB=null;
  if(p.color!=='mono'){
   originalRGB=p.domain==='full'?Float32Array.from(view.rgb):colorViewport(frame,{...geometryState,mask},p).rgb;
   let xy;if(p.domain==='full')xy=tangentFilter(frame,geometryState,mask,view,{...p,scale:1},(f,t)=>progress(id,t,f),'chroma').values;
   else xy=filterChroma(originalRGB,view.width,view.height,p);
   filteredRGB=reconstructColor(xy,model.Y);if(absolute)for(let i=0;i<originalRGB.length;i++)originalRGB[i]*=scale;
  }
  const support={valid:view.valid,previewMask:view.mask||{enabled:false},display:identity};
  const display={...m.display,mode:p.color==='mono'?'mono':'natural',nativeSize:true},left=renderArray(view.Y,view.width,view.height,display,{...support,rgb:originalRGB},localSummary),right=renderArray(model.Y,view.width,view.height,display,{...support,rgb:filteredRGB},localSummary);
  simulation={Y:model.Y,valid:view.valid||null,width:view.width,height:view.height,details:{...view.details,...model.details,colorMode:p.color==='mono'?'luminance only':'CIE xy chromaticity with normalized CSF lowpass; reconstructed with filtered Y',gamut:'negative linear-sRGB channels clipped, then normalized to filtered Y; display gamut clipping may alter visible color',domain:p.domain==='full'?'full circular fisheye':'perspective detail',geometry:view.geometry||geometryState,sourceGeometry:geometryState,calibration:{...calibration},logmar:p.logmar,pr:p.pr,units:units(),sourceSampling:frame.sampling||'native raster'}};
  send(id,{event:'result',simulation:{details:simulation.details,left,right}},[left.rgba.buffer,right.rgba.buffer]);return;
 }
 if(op==='educate'){
  if(!geometryState?.confirmed)throw Error('Apply confirmed source geometry first');
  const p=m.parameters||{},full=p.domain==='full',absolute=calibration.kind!=='relative';let view,original,rgb,domain={};
  if(full){progress(id,'Sampling full-field color');view=circularView(frame,geometryState,mask,p.fullSize||800);original=Float32Array.from(view.rgb);rgb=Float32Array.from(view.rgb);domain={rays:view.rays,valid:view.valid,omega:view.omega,geometry:view.geometry};}
  else{view=colorViewport(frame,{...geometryState,mask},p);original=Float32Array.from(view.rgb);rgb=view.rgb;}
  let filterDetails=null,blurDetails=null;
  if(m.useAcuity){
   const lum=full?view:viewport(frame,{...geometryState,mask},p);let result;
   if(full){result=tangentFilter(frame,geometryState,mask,view,{...p,scale:absolute?scale:1,absolute},(f,t)=>progress(id,t,f));result.Y=result.values;}
   else{if(absolute)for(let i=0;i<lum.Y.length;i++)lum.Y[i]*=scale;result=devas(lum.Y,lum.width,lum.height,{...p,absolute},f=>progress(id,'Reduced-acuity condition step',f));}
   filterDetails=result.details;
   const xy=full?tangentFilter(frame,geometryState,mask,view,{...p,scale:1},(f,t)=>progress(id,t,f),'chroma').values:filterChroma(rgb,view.width,view.height,p);
   const unscaledY=absolute?Float32Array.from(result.Y,v=>v/scale):result.Y;rgb=reconstructColor(xy,unscaledY);
  }
  if(full&&(p.condition==='cataract'||p.condition==='custom')&&p.blurDegrees*p.severity>0){
   const blurFrame={width:view.width,height:view.height,rgb,Y:view.Y,valid:view.valid};
   const blurred=tangentFilter(blurFrame,view.geometry,view.mask,view,{...p,scale:1,sigmaDegrees:p.blurDegrees*p.severity},(f,t)=>progress(id,t,f),'blur');domain.blurred=blurred.values;blurDetails=blurred.details;
  }
  const out=conditionPreview(rgb,view.width,view.height,p,domain),toY=colors=>Float32Array.from({length:colors.length/3},(_,i)=>.2126*colors[3*i]+.7152*colors[3*i+1]+.0722*colors[3*i+2]),baseY=toY(original),afterY=toY(out.after),base=stats(baseY,view.width,view.height,null,null,view.valid),identity=[1,0,0,0,1,0,0,0,1];
  const renderColor=(colors,Y)=>renderArray(Y,view.width,view.height,{...m.display,mode:'natural',nativeSize:true},{rgb:colors,display:identity,valid:view.valid,previewMask:full?view.mask:{enabled:false}},base);
  const left=renderColor(original,baseY),right=renderColor(out.after,afterY);
  education={details:{...out.details,geometry:view.geometry||geometryState,sourceGeometry:geometryState,useAcuity:!!m.useAcuity,filterDetails,blurDetails,sourceMeasurementUnchanged:true}};
  send(id,{event:'result',education:{left,right,details:education.details}},[left.rgba.buffer,right.rgba.buffer]);return;
 }
 if(op==='field'){
  if(!geometryState?.confirmed)throw Error('Apply confirmed source geometry first');
  const p=fieldParameters(m.parameters);progress(id,'Preparing angular viewing mask');
  const view=geometryState.projection==='perspective'?annotationView(m.parameters.size||800):circularView(frame,geometryState,mask,m.parameters.size||800),selected=makeFieldMask(view,p);appliedField=p;
  const localSummary=stats(view.Y,view.width,view.height,null,null,view.valid),identity=[1,0,0,0,1,0,0,0,1],base=renderArray(view.Y,view.width,view.height,{...m.display,nativeSize:true},{rgb:view.rgb,display:identity,valid:view.valid,previewMask:view.mask},localSummary);
  const rgba=paintField(base.rgba,view,selected.selected,p),preview={...base,rgba,legend:p.style==='binary'?null:base.legend};
  fieldPreview={mask:selected.selected,valid:view.valid,width:view.width,height:view.height,details:{...selected.details,solidAngleWeightedMean:selected.details.solidAngleWeightedMean===null?null:selected.details.solidAngleWeightedMean*scale,pixelMean:selected.details.pixelMean===null?null:selected.details.pixelMean*scale,units:units(),geometry:view.geometry,sourceGeometry:geometryState,sampling:view.details,calibration:{...calibration}}};
  send(id,{event:'result',field:{preview,details:fieldPreview.details}},[rgba.buffer]);return;
 }
 if(op==='export'){let bytes,name,type='application/octet-stream';const stem='visionsim-analysis';
  if(m.kind==='report'){bytes=new TextEncoder().encode(JSON.stringify(report(m.extra),null,2));name=stem+'.json';type='application/json';}
  else if(m.kind==='response'){if(!response)throw Error('No fitted/imported response in this session');bytes=new TextEncoder().encode(JSON.stringify(response,null,2));name='camera-response.json';type='application/json';}
  else if(m.kind==='csv'){const rows=[['region','unit','count','mean','median','min','max','p05','p95','sd','x','y','width','height','region_type','solid_angle_sr','solid_angle_weighted_mean','field_type']];for(const [n,s] of Object.entries(saved))rows.push([n,units(),s.count,s.mean,s.median,s.minimum,s.maximum,s.p05,s.p95,s.sd,s.roi.x,s.roi.y,s.roi.w,s.roi.h,s.region?.type||'rectangle',s.solidAngleSteradians??'',s.solidAngleWeightedMean??'',s.field?.type||'none']);if(rows.length===1)throw Error('Save region A or B before exporting CSV');bytes=new TextEncoder().encode(rows.map(r=>r.join(',')).join('\r\n'));name='regions.csv';type='text/csv';}
  else if(m.kind==='hdr'){if(frame.valid&&frame.valid.some(v=>!v))throw Error('This bracket has invalid pixels. Export PFM plus the validity mask, not an HDR that could silently encode holes as black');if(frame.colorProfile==='bmd')throw Error('Use quantitative PFM export for this color interpretation');if(!geometryState?.confirmed)throw Error('Confirm and apply image geometry before exporting corrected HDR');bytes=encodeHDR(frame,scale,calibration.kind!=='relative',{geometry:geometryState,mask});name='prepared-source.hdr';}
  else if(m.kind==='headerOnly'){
   if(!originalFile||frame.format!=='hdr'||cropHistory.length)throw Error('Header-only export requires an original HDR with no applied crop. Use prepared HDR after cropping.');if(!geometryState?.confirmed)throw Error('Confirm and apply geometry first');
   bytes=rewriteHDRGeometry(await originalFile.arrayBuffer(),geometryState);name='original-pixels-corrected-view.hdr';
  }
  else if(m.kind==='view'){
   if(!geometryState?.confirmed)throw Error('Apply confirmed geometry first');const v=viewString(geometryState);if(!v)throw Error('Equisolid is not a standard Radiance VIEW. Export custom geometry in prepared HDR/JSON or use the explicit angular reprojection.');bytes=new TextEncoder().encode('VIEW= '+v+'\n');name='corrected-view.vf';type='text/plain';
  }
  else if(m.kind==='angular'){
   if(!geometryState?.confirmed)throw Error('Apply confirmed geometry first');if(frame.colorProfile==='bmd')throw Error('Angular RGBE export does not support this color interpretation');
   const out=angularReproject(frame,geometryState,mask,m.extra?.angularSize||1024,m.extra?.angularFov||180,f=>progress(id,'Reprojecting pixels to angular fisheye',f));bytes=encodeHDR(out.frame,scale,calibration.kind!=='relative',{geometry:out.geometry,mask:out.mask});name='reprojected-angular-fisheye.hdr';
  }
  else if(m.kind==='pfm'){bytes=encodePFM(frame.Y,frame.width,frame.height,scale);name='luminance.pfm';}
  else if(m.kind==='simulation'){if(!simulation)throw Error('Run a simulation first');bytes=encodePFM(simulation.Y,simulation.width,simulation.height);name='simulation-luminance.pfm';}
  else if(m.kind==='simulationMask'||m.kind==='fieldMask'){
   const data=m.kind==='fieldMask'?fieldPreview:simulation;if(!data)throw Error('Run the corresponding preview first');
   const h=new TextEncoder().encode(`P5\n${data.width} ${data.height}\n255\n`),v=m.kind==='fieldMask'?data.mask:data.valid;
   bytes=new Uint8Array(h.length+data.width*data.height);bytes.set(h);for(let i=0;i<data.width*data.height;i++)bytes[h.length+i]=(!v||v[i])?255:0;
   name=m.kind==='fieldMask'?'viewing-field-mask.pgm':'simulation-support.pgm';
  }
  else if(m.kind==='mask'){const h=new TextEncoder().encode(`P5\n${frame.width} ${frame.height}\n255\n`);bytes=new Uint8Array(h.length+frame.width*frame.height);bytes.set(h);for(let i=0;i<frame.Y.length;i++)bytes[h.length+i]=inCircle(i%frame.width,Math.floor(i/frame.width),frame.width,frame.height,mask)&&(!frame.valid||frame.valid[i])?255:0;name='validity-mask.pgm';}
  else throw Error('Unknown export');send(id,{event:'result',download:{bytes,name,type}},[bytes.buffer]);return;
 }
 throw Error('Unknown operation');
 }catch(error){send(id,{event:'error',message:error?.message||String(error)});}};

postMessage({event:'ready'});
